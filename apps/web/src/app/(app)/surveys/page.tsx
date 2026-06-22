
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";
import { createSurveyRequestAction, updateSurveyRequestAction } from "./actions";
import { listSurveyRequestsForTenant } from "@/server/surveys";


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


export default async function SurveysPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const fromEnquiry = readParam(params, "fromEnquiry");
  const selectedSurveyId = readParam(params, "selected");
  const [surveyRequests, enquiry] = await Promise.all([
    listSurveyRequestsForTenant(activeTenant.tenantId),
    fromEnquiry ? getEnquiryById(activeTenant.tenantId, fromEnquiry) : Promise.resolve(null)
  ]);

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}
      <section style={{ ...cardStyle(), display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Survey requests</p>
        <h1 style={{ margin: 0 }}>Book site work before quoting</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>If a survey is required, book it here, then turn the completed survey into a quote.</p>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <form action={createSurveyRequestAction} style={{ ...cardStyle(), display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>New survey request</h2>
          <input type="hidden" name="enquiryId" value={enquiry?.id ?? ""} />
          <input name="clientName" defaultValue={enquiry?.clientName ?? ""} placeholder="Client / business name" style={inputStyle} />
          <input name="contactName" defaultValue={enquiry?.contactName ?? ""} placeholder="Contact name" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="phone" defaultValue={enquiry?.phone ?? ""} placeholder="Phone" style={inputStyle} />
            <input name="assignedTo" placeholder="Assigned to" style={inputStyle} />
          </div>
          <input name="siteAddress" defaultValue={enquiry?.siteAddress ?? ""} placeholder="Site address" style={inputStyle} />
          <input name="dueDate" type="date" style={inputStyle} />
          <textarea name="notes" defaultValue={[enquiry?.requestSummary, enquiry?.notes].filter(Boolean).join("\n\n")} placeholder="Survey notes / what needs measuring" style={textareaStyle} />
          <button type="submit" style={buttonStyle}>Create survey request</button>
        </form>

        <section style={{ ...cardStyle(), display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Current survey requests</h2>
            <span style={{ fontSize: 13, color: "#667085" }}>{surveyRequests.length} total</span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {surveyRequests.map((survey) => {
              const isOpen = selectedSurveyId === survey.id;
              const surveyPhotos = extractSurveyPhotos(survey.installSchedulerPayload);
              return (
                <article key={survey.id} style={{ border: isOpen ? "2px solid #155eef" : "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 12, background: isOpen ? "#f8fbff" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                    <div>
                      <strong>{survey.clientName}</strong>
                      <div style={{ color: "#475467", marginTop: 4 }}>{survey.siteAddress || "No site address yet"}</div>
                    </div>
                    <span style={{ borderRadius: 999, background: survey.status === "completed" ? "#ecfdf3" : "#eef2ff", color: survey.status === "completed" ? "#067647" : "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{survey.status}</span>
                  </div>
                  <div style={{ color: "#667085", fontSize: 13 }}>
                    {[survey.contactName, survey.phone, survey.dueDate ? `Due ${survey.dueDate}` : null, survey.assignedTo].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ borderRadius: 999, background: survey.installSchedulerSyncStatus === "completed" ? "#ecfdf3" : survey.installSchedulerSyncStatus === "error" ? "#fff1f3" : survey.installSchedulerJobId ? "#eef2ff" : "#f2f4f7", color: survey.installSchedulerSyncStatus === "completed" ? "#067647" : survey.installSchedulerSyncStatus === "error" ? "#b42318" : survey.installSchedulerJobId ? "#4338ca" : "#475467", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>
                      Install Scheduler: {survey.installSchedulerSyncStatus || "not synced"}
                    </span>
                    {survey.installSchedulerJobUrl ? (
                      <a href={survey.installSchedulerJobUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 800, color: "#155eef", textDecoration: "none" }}>Open Install Scheduler job</a>
                    ) : null}
                    {survey.installSchedulerSyncError ? (
                      <span style={{ fontSize: 13, color: "#b42318" }}>{survey.installSchedulerSyncError}</span>
                    ) : null}
                    {surveyPhotos.length ? (
                      <span style={{ borderRadius: 999, background: "#fff7ed", color: "#c2410c", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{surveyPhotos.length} survey photo{surveyPhotos.length === 1 ? "" : "s"}</span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link href={`/surveys?selected=${survey.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", color: "#111827", fontWeight: 800 }}>Open / edit survey details</Link>
                    <Link href={`/quotes?fromSurvey=${survey.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, background: "#111827", color: "#fff", fontWeight: 800 }}>Create quote from survey</Link>
                  </div>
                  {isOpen ? (
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
    </div>
  );
}
