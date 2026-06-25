
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById, listEnquiriesForTenant } from "@/server/enquiries";
import { createSurveyRequestAction, deleteSurveyRequestAction, restoreSurveyRequestAction, updateSurveyRequestAction } from "./actions";
import { listSurveyRequestsForTenant } from "@/server/surveys";
import { customerLogoUrl, listCustomersForTenant } from "@/server/customers";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";


type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

type UnknownRecord = Record<string, unknown>;
type SurveyPhoto = {
  url: string;
  fileName: string;
  signTitle: string;
  annotated: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getPhotoUrl(photo: unknown): string {
  if (!isRecord(photo)) return "";
  return textValue(photo.url) || textValue(photo.downloadUrl) || textValue(photo.photoUrl) || textValue(photo.photoURL);
}

function getPhotoName(photo: unknown, fallback: string): string {
  if (!isRecord(photo)) return fallback;
  return textValue(photo.fileName) || textValue(photo.originalFileName) || textValue(photo.name) || fallback;
}

function extractSurveyPhotos(payload: unknown): SurveyPhoto[] {
  if (!isRecord(payload)) return [];
  const directPhotos = Array.isArray(payload.surveyPhotos) ? payload.surveyPhotos : [];
  const signs = Array.isArray(payload.signs) ? payload.signs : [];
  const rawSurvey = isRecord(payload.rawSurvey) ? payload.rawSurvey : {};
  const rawSigns = Array.isArray(rawSurvey.signs) ? rawSurvey.signs : [];
  const photoRows: SurveyPhoto[] = [];
  const seen = new Set<string>();

  directPhotos.forEach((photo, index) => {
    const url = getPhotoUrl(photo);
    if (!url || seen.has(url)) return;
    seen.add(url);
    photoRows.push({
      url,
      fileName: getPhotoName(photo, `Photo ${index + 1}`),
      signTitle: isRecord(photo) ? textValue(photo.signTitle) || textValue(photo.location) || "Survey photo" : "Survey photo",
      annotated: isRecord(photo) ? Boolean(photo.annotated) : false,
    });
  });

  [...signs, ...rawSigns].forEach((sign, signIndex) => {
    if (!isRecord(sign)) return;
    const signTitle = textValue(sign.title) || textValue(sign.location) || `Sign / location ${signIndex + 1}`;
    const photos = Array.isArray(sign.photos) ? sign.photos : [];
    photos.forEach((photo, photoIndex) => {
      const url = getPhotoUrl(photo);
      if (!url || seen.has(url)) return;
      seen.add(url);
      photoRows.push({
        url,
        fileName: getPhotoName(photo, `Photo ${photoIndex + 1}`),
        signTitle,
        annotated: isRecord(photo) ? Boolean(photo.annotated) : false,
      });
    });
  });

  return photoRows;
}

function cardStyle() {
  return { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 22 } as const;
}

const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", width: "100%", boxSizing: "border-box" } as const;
const textareaStyle = { minHeight: 110, borderRadius: 12, border: "1px solid #d0d5dd", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer", padding: "0 16px" } as const;


function getSurveyWorkflowStatus(survey: { status: string; installSchedulerJobId: string | null; installSchedulerSyncStatus: string | null; installSchedulerSyncError: string | null }) {
  if (survey.installSchedulerSyncStatus === "completed" || survey.status === "completed") {
    return {
      label: "Survey completed",
      helper: "Returned from Install Scheduler and ready to quote.",
      background: "#ecfdf3",
      color: "#067647",
      border: "#abefc6"
    } as const;
  }

  if (survey.installSchedulerSyncStatus === "error") {
    return {
      label: "Sync issue",
      helper: survey.installSchedulerSyncError || "Install Scheduler did not accept or return this survey yet.",
      background: "#fff1f3",
      color: "#b42318",
      border: "#fecdd3"
    } as const;
  }

  if (survey.installSchedulerJobId || survey.installSchedulerSyncStatus === "created") {
    return {
      label: "Awaiting survey completion",
      helper: "Sent to Install Scheduler. Waiting for staff to complete the survey.",
      background: "#eef2ff",
      color: "#4338ca",
      border: "#c7d7fe"
    } as const;
  }

  if (survey.status === "booked") {
    return {
      label: "Survey booked",
      helper: "Booked locally. Not yet returned as a completed survey.",
      background: "#fef7c3",
      color: "#a15c07",
      border: "#fde68a"
    } as const;
  }

  return {
    label: "Survey requested",
    helper: "Created in Production Manager. It can now be sent to Install Scheduler.",
    background: "#f2f4f7",
    color: "#475467",
    border: "#e5e7eb"
  } as const;
}

function statusDot(label: string, active: boolean, complete: boolean) {
  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "center", color: complete ? "#067647" : active ? "#155eef" : "#98a2b3", fontSize: 12, fontWeight: 850, minWidth: 84 }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: complete ? "#12b76a" : active ? "#155eef" : "#e5e7eb", color: "#fff", display: "grid", placeItems: "center", fontSize: 11 }}>{complete ? "✓" : active ? "•" : ""}</span>
      <span style={{ textAlign: "center" }}>{label}</span>
    </div>
  );
}



export default async function SurveysPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const fromEnquiry = readParam(params, "fromEnquiry");
  const selectedSurveyId = readParam(params, "selected");
  const filter = readParam(params, "filter");
  const [allSurveyRequests, enquiry, clients, allEnquiries] = await Promise.all([
    listSurveyRequestsForTenant(activeTenant.tenantId, { includeDeleted: true }),
    fromEnquiry ? getEnquiryById(activeTenant.tenantId, fromEnquiry) : Promise.resolve(null),
    listCustomersForTenant(activeTenant.tenantId),
    listEnquiriesForTenant(activeTenant.tenantId, { includeDeleted: true })
  ]);
  const deletedCount = allSurveyRequests.filter((survey) => survey.status === "deleted").length;
  const surveyRequests = filter === "deleted"
    ? allSurveyRequests.filter((survey) => survey.status === "deleted")
    : allSurveyRequests.filter((survey) => survey.status !== "deleted");
  const customerById = new Map(clients.map((client) => [client.id, client]));
  const enquiryById = new Map(allEnquiries.map((item) => [item.id, item]));
  const sourceClientLogoUrl = enquiry?.clientLogoUrl || customerLogoUrl(enquiry?.linkedCustomerId ? customerById.get(enquiry.linkedCustomerId) : null);

  return (
    <div style={{ maxWidth: 1680, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}
      <section style={{ ...cardStyle(), display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Survey requests</p>
        <h1 style={{ margin: 0 }}>Book site work before quoting</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>If a survey is required, book it here, then turn the completed survey into a quote.</p>
      </section>
      <details open={Boolean(enquiry) || surveyRequests.length === 0} style={{ ...cardStyle(), display: "grid", gap: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 950, color: "#155eef", fontSize: 18 }}>New survey request</summary>
        <form action={createSurveyRequestAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Create or edit requests here; the current survey workflow below now gets the full page width.</p>
          <input type="hidden" name="enquiryId" value={enquiry?.id ?? ""} />
          {enquiry ? (
            <section style={{ border: "1px solid #dbeafe", borderRadius: 16, padding: 12, background: "#f8fbff", display: "flex", gap: 12, alignItems: "center" }}>
              <ClientLogoBadge logoUrl={sourceClientLogoUrl} name={enquiry.clientName} size={48} radius={14} padding={4} />
              <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{enquiry.clientName}</strong>
                <span style={{ color: "#667085", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{enquiry.requestSummary}</span>
              </div>
            </section>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <input name="clientName" defaultValue={enquiry?.clientName ?? ""} placeholder="Client / business name" style={inputStyle} />
            <input name="contactName" defaultValue={enquiry?.contactName ?? ""} placeholder="Contact name" style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <input name="phone" defaultValue={enquiry?.phone ?? ""} placeholder="Phone" style={inputStyle} />
            <input name="assignedTo" placeholder="Assigned to" style={inputStyle} />
            <input name="siteAddress" defaultValue={enquiry?.siteAddress ?? ""} placeholder="Site address" style={inputStyle} />
            <input name="dueDate" type="date" style={inputStyle} />
          </div>
          <textarea name="notes" defaultValue={[enquiry?.requestSummary, enquiry?.notes].filter(Boolean).join("\n\n")} placeholder="Survey notes / what needs measuring" style={textareaStyle} />
          <button type="submit" style={{ ...buttonStyle, width: "fit-content" }}>Create survey request</button>
        </form>
      </details>

      <section style={{ ...cardStyle(), display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>{filter === "deleted" ? "Deleted survey requests" : "Current survey requests"}</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <a href="/surveys" style={{ color: filter === "deleted" ? "#667085" : "#155eef", fontWeight: 800, textDecoration: "none" }}>Active</a>
              <a href="/surveys?filter=deleted" style={{ color: filter === "deleted" ? "#155eef" : "#667085", fontWeight: 800, textDecoration: "none" }}>Deleted ({deletedCount})</a>
              <span style={{ fontSize: 13, color: "#667085" }}>{surveyRequests.length} shown</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {surveyRequests.map((survey) => {
              const isOpen = selectedSurveyId === survey.id;
              const surveyPhotos = extractSurveyPhotos(survey.installSchedulerPayload);
              const workflowStatus = getSurveyWorkflowStatus(survey);
              const hasInstallJob = Boolean(survey.installSchedulerJobId || survey.installSchedulerJobUrl);
              const hasCompletedSurvey = survey.installSchedulerSyncStatus === "completed" || survey.status === "completed";
              const surveySourceEnquiry = survey.enquiryId ? enquiryById.get(survey.enquiryId) : null;
              const surveyLogoUrl = surveySourceEnquiry?.clientLogoUrl || customerLogoUrl(survey.linkedCustomerId ? customerById.get(survey.linkedCustomerId) : null);
              return (
                <article key={survey.id} style={{ border: isOpen ? "2px solid #155eef" : "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 12, background: isOpen ? "#f8fbff" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <ClientLogoBadge logoUrl={surveyLogoUrl} name={survey.clientName} size={48} radius={14} padding={4} />
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{survey.clientName}</strong>
                        <div style={{ color: "#475467", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{survey.siteAddress || "No site address yet"}</div>
                      </div>
                    </div>
                    <span style={{ borderRadius: 999, background: workflowStatus.background, color: workflowStatus.color, padding: "4px 10px", fontSize: 12, fontWeight: 900 }}>{workflowStatus.label}</span>
                  </div>
                  <div style={{ color: "#667085", fontSize: 13 }}>
                    {[survey.contactName, survey.phone, survey.dueDate ? `Due ${survey.dueDate}` : null, survey.assignedTo].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ border: `1px solid ${workflowStatus.border}`, borderRadius: 16, padding: 12, background: workflowStatus.background, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", overflowX: "auto", paddingBottom: 2 }}>
                      {statusDot("Requested", true, true)}
                      <span style={{ flex: 1, height: 2, background: hasInstallJob ? "#155eef" : "#d0d5dd", minWidth: 34 }} />
                      {statusDot("Sent", hasInstallJob && !hasCompletedSurvey, hasInstallJob)}
                      <span style={{ flex: 1, height: 2, background: hasCompletedSurvey ? "#12b76a" : "#d0d5dd", minWidth: 34 }} />
                      {statusDot("Completed", hasCompletedSurvey, hasCompletedSurvey)}
                      <span style={{ flex: 1, height: 2, background: hasCompletedSurvey ? "#12b76a" : "#d0d5dd", minWidth: 34 }} />
                      {statusDot("Ready to quote", hasCompletedSurvey, hasCompletedSurvey)}
                    </div>
                    <p style={{ margin: 0, color: workflowStatus.color, fontSize: 13, fontWeight: 800 }}>{workflowStatus.helper}</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ borderRadius: 999, background: "rgba(255,255,255,0.72)", color: workflowStatus.color, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>
                        Install Scheduler: {survey.installSchedulerSyncStatus || "not synced"}
                      </span>
                      {survey.installSchedulerJobUrl ? (
                        <a href={survey.installSchedulerJobUrl} target="_blank" rel="noreferrer" style={{ minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 12px", borderRadius: 10, background: "#155eef", color: "#fff", fontSize: 13, fontWeight: 900, textDecoration: "none" }}>Open in Install Scheduler</a>
                      ) : null}
                      {survey.installSchedulerSyncError ? (
                        <span style={{ fontSize: 13, color: "#b42318" }}>{survey.installSchedulerSyncError}</span>
                      ) : null}
                      {surveyPhotos.length ? (
                        <span style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{surveyPhotos.length} survey photo{surveyPhotos.length === 1 ? "" : "s"}</span>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {survey.status !== "deleted" ? (
                      <>
                        <Link href={`/surveys?selected=${survey.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", color: "#111827", fontWeight: 800 }}>Open / edit survey details</Link>
                        <Link href={`/quotes?fromSurvey=${survey.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, background: hasCompletedSurvey ? "#111827" : "#344054", color: "#fff", fontWeight: 800 }}>{hasCompletedSurvey ? "Create quote from completed survey" : "Create quote from survey notes"}</Link>
                        <form action={deleteSurveyRequestAction} style={{ margin: 0 }}>
                          <input type="hidden" name="surveyId" value={survey.id} />
                          <button type="submit" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", fontWeight: 800, cursor: "pointer" }}>Delete</button>
                        </form>
                      </>
                    ) : (
                      <form action={restoreSurveyRequestAction} style={{ margin: 0 }}>
                        <input type="hidden" name="surveyId" value={survey.id} />
                        <button type="submit" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, cursor: "pointer" }}>Restore survey</button>
                      </form>
                    )}
                  </div>
                  {isOpen && survey.status !== "deleted" ? (
                    <form action={updateSurveyRequestAction} style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, display: "grid", gap: 12 }}>
                      <input type="hidden" name="surveyId" value={survey.id} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>
                          Status
                          <select name="status" defaultValue={survey.status} style={inputStyle}>
                            <option value="requested">Requested</option>
                            <option value="booked">Booked</option>
                            <option value="in_progress">In progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>
                          Due date
                          <input name="dueDate" type="date" defaultValue={survey.dueDate ?? ""} style={inputStyle} />
                        </label>
                        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>
                          Assigned to
                          <input name="assignedTo" defaultValue={survey.assignedTo ?? ""} placeholder="Installer / staff" style={inputStyle} />
                        </label>
                      </div>
                      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>
                        Survey brief / notes
                        <textarea name="notes" defaultValue={survey.notes ?? ""} placeholder="What needs measuring, access notes, customer requirements" style={textareaStyle} />
                      </label>
                      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800 }}>
                        Survey information collected
                        <textarea name="surveyDetails" defaultValue={survey.surveyDetails ?? ""} placeholder="Measurements, photos taken, fixing notes, wall type, install access, recommendations" style={{ ...textareaStyle, minHeight: 150 }} />
                      </label>
                      {surveyPhotos.length ? (
                        <section style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 16, padding: 14, display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                            <strong>Survey photos returned from Install Scheduler</strong>
                            <span style={{ color: "#9a3412", fontSize: 13, fontWeight: 800 }}>{surveyPhotos.length} photo{surveyPhotos.length === 1 ? "" : "s"}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                            {surveyPhotos.map((photo, index) => (
                              <a key={`${photo.url}-${index}`} href={photo.url} target="_blank" rel="noreferrer" style={{ display: "grid", gap: 6, textDecoration: "none", color: "#111827" }}>
                                <img src={photo.url} alt={photo.fileName || "Survey photo"} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 12, border: "1px solid #fdba74", background: "#fff" }} />
                                <span style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.signTitle}</span>
                                <span style={{ fontSize: 12, color: "#9a3412", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.fileName}{photo.annotated ? " · annotated" : ""}</span>
                              </a>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      <button type="submit" style={buttonStyle}>Save survey information</button>
                    </form>
                  ) : null}
                </article>
              );
            })}
            {surveyRequests.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No survey requests yet.</p> : null}
          </div>
        </section>
    </div>
  );
}
