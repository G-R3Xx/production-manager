
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listEnquiriesForTenant, listEnquiryCorrespondenceForTenant } from "@/server/enquiries";
import { customerLogoUrl, listCustomersForTenant } from "@/server/customers";
import { attachEnquiryCorrespondenceAction, createEnquiryAction, createSurveyFromEnquiryAction, deleteEnquiryAction, restoreEnquiryAction } from "./actions";
import { EnquiryCorrespondenceDropzone } from "./EnquiryCorrespondenceDropzone";


type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function cardStyle() {
  return { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 22 } as const;
}

const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", width: "100%", boxSizing: "border-box" } as const;
const textareaStyle = { minHeight: 110, borderRadius: 12, border: "1px solid #d0d5dd", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer", padding: "0 16px" } as const;

const urgencyOptions = ["Low", "Normal", "High", "Urgent", "Critical"];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatFileSize(sizeBytes: number | null | undefined): string {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return "";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function urgencyBadgeStyle(urgency: string | null | undefined) {
  const value = String(urgency ?? "Normal").toLowerCase();
  if (value === "critical" || value === "urgent") return { background: "#fff1f3", color: "#c01048", borderColor: "#fecdd6" } as const;
  if (value === "high") return { background: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa" } as const;
  if (value === "low") return { background: "#f0fdf4", color: "#15803d", borderColor: "#bbf7d0" } as const;
  return { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" } as const;
}


export default async function EnquiriesPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const filter = readParam(params, "filter");
  const [allEnquiries, clients, correspondence] = await Promise.all([
    listEnquiriesForTenant(activeTenant.tenantId, { includeDeleted: true }),
    listCustomersForTenant(activeTenant.tenantId),
    listEnquiryCorrespondenceForTenant(activeTenant.tenantId)
  ]);
  const deletedCount = allEnquiries.filter((enquiry) => enquiry.status === "deleted").length;
  const enquiries = filter === "deleted"
    ? allEnquiries.filter((enquiry) => enquiry.status === "deleted")
    : allEnquiries.filter((enquiry) => enquiry.status !== "deleted");
  const correspondenceByEnquiry = new Map<string, typeof correspondence>();
  for (const item of correspondence) {
    const existing = correspondenceByEnquiry.get(item.enquiryId) ?? [];
    existing.push(item);
    correspondenceByEnquiry.set(item.enquiryId, existing);
  }

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Enquiries</p>
        <h1 style={{ margin: 0 }}>Quick intake first</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Capture the client, a rough requirement, and decide the next step later. This does not need to tie to MYOB immediately.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <form action={createEnquiryAction} style={{ ...cardStyle(), display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>New enquiry</h2>
          <select name="linkedCustomerId" defaultValue="" style={inputStyle}>
            <option value="">New / unlinked client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.displayName}</option>
            ))}
          </select>
          <input name="clientName" placeholder="Client / business name (or choose existing above)" style={inputStyle} />
          <input name="contactName" placeholder="Contact name" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="phone" placeholder="Phone" style={inputStyle} />
            <input name="email" placeholder="Email" style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="source" placeholder="Source (call / email / walk-in)" style={inputStyle} />
            <select name="urgency" defaultValue="Normal" style={inputStyle}>
              {urgencyOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <input name="siteAddress" placeholder="Site address if relevant" style={inputStyle} />
          <textarea name="requestSummary" placeholder="Rough idea of what they require" style={textareaStyle} />
          <textarea name="notes" placeholder="Internal notes" style={textareaStyle} />
          <button type="submit" style={buttonStyle}>Create enquiry</button>
        </form>

        <section style={{ ...cardStyle(), display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>{filter === "deleted" ? "Deleted enquiries" : "Current enquiries"}</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <a href="/enquiries" style={{ color: filter === "deleted" ? "#667085" : "#155eef", fontWeight: 800, textDecoration: "none" }}>Active</a>
              <a href="/enquiries?filter=deleted" style={{ color: filter === "deleted" ? "#155eef" : "#667085", fontWeight: 800, textDecoration: "none" }}>Deleted ({deletedCount})</a>
              <span style={{ fontSize: 13, color: "#667085" }}>{enquiries.length} shown</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {enquiries.map((enquiry) => (
              <article key={enquiry.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
                {(() => {
                  const linkedClient = clients.find((client) => client.id === enquiry.linkedCustomerId) ?? null;
                  const logoUrl = customerLogoUrl(linkedClient);
                  return (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "start" }}>
                    {logoUrl ? <img src={logoUrl} alt={`${enquiry.clientName} logo`} style={{ width: 46, height: 46, objectFit: "contain", borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }} /> : null}
                    <div>
                      <strong>{enquiry.clientName}</strong>
                      <div style={{ color: "#475467", marginTop: 4 }}>{enquiry.requestSummary}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ borderRadius: 999, border: `1px solid ${urgencyBadgeStyle(enquiry.urgency).borderColor}`, ...urgencyBadgeStyle(enquiry.urgency), padding: "4px 10px", fontSize: 12, fontWeight: 900 }}>{enquiry.urgency || "Normal"}</span>
                    <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{enquiry.status}</span>
                  </div>
                </div>
                  );
                })()}
                <div style={{ color: "#667085", fontSize: 13 }}>
                  {[enquiry.contactName, enquiry.phone, enquiry.email, enquiry.siteAddress].filter(Boolean).join(" · ")}
                </div>

                {(() => {
                  const enquiryCorrespondence = correspondenceByEnquiry.get(enquiry.id) ?? [];
                  return (
                    <section style={{ display: "grid", gap: 8, borderTop: "1px solid #eef2f7", paddingTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <strong style={{ fontSize: 13 }}>Correspondence</strong>
                        <span style={{ fontSize: 12, color: "#667085" }}>{enquiryCorrespondence.length} attached</span>
                      </div>
                      {enquiryCorrespondence.length > 0 ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {enquiryCorrespondence.slice(0, 5).map((item) => (
                            <a
                              key={item.id}
                              href={item.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                border: "1px solid #dbe6f5",
                                background: "#fbfdff",
                                color: "#0f172a",
                                textDecoration: "none",
                                borderRadius: 999,
                                padding: "7px 10px",
                                fontSize: 12,
                                fontWeight: 800,
                                maxWidth: 260,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              }}
                              title={`${item.fileName}${item.uploadedBy ? ` · uploaded by ${item.uploadedBy}` : ""} · ${formatDateTime(item.createdAt)}`}
                            >
                              {item.fileName}{formatFileSize(item.sizeBytes) ? ` · ${formatFileSize(item.sizeBytes)}` : ""}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#98a2b3", fontSize: 12 }}>No email correspondence attached yet.</span>
                      )}
                      {enquiry.status !== "deleted" ? (
                        <form action={attachEnquiryCorrespondenceAction} style={{ margin: 0 }}>
                          <input type="hidden" name="enquiryId" value={enquiry.id} />
                          <EnquiryCorrespondenceDropzone />
                        </form>
                      ) : null}
                    </section>
                  );
                })()}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {enquiry.status !== "deleted" ? (
                    <>
                      <form action={createSurveyFromEnquiryAction} style={{ margin: 0 }}>
                        <input type="hidden" name="enquiryId" value={enquiry.id} />
                        <button type="submit" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, cursor: "pointer" }}>Create site survey request</button>
                      </form>
                      <Link href={`/surveys?fromEnquiry=${enquiry.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", color: "#111827", fontWeight: 700 }}>Open survey form</Link>
                    </>
                  ) : null}
                  {enquiry.status !== "deleted" ? <Link href={`/quotes?fromEnquiry=${enquiry.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, background: "#111827", color: "#fff", fontWeight: 800 }}>Create quote</Link> : null}
                  {enquiry.status === "deleted" ? (
                    <form action={restoreEnquiryAction} style={{ margin: 0 }}>
                      <input type="hidden" name="enquiryId" value={enquiry.id} />
                      <button type="submit" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, cursor: "pointer" }}>Restore enquiry</button>
                    </form>
                  ) : (
                    <form action={deleteEnquiryAction} style={{ margin: 0 }}>
                      <input type="hidden" name="enquiryId" value={enquiry.id} />
                      <button type="submit" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", fontWeight: 800, cursor: "pointer" }}>Delete</button>
                    </form>
                  )}
                </div>
              </article>
            ))}
            {enquiries.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No enquiries yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
