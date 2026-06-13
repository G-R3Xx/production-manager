
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";
import { createSurveyRequestAction } from "./actions";
import { listSurveyRequestsForTenant } from "@/server/surveys";


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


export default async function SurveysPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const fromEnquiry = readParam(params, "fromEnquiry");
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
            {surveyRequests.map((survey) => (
              <article key={survey.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <strong>{survey.clientName}</strong>
                    <div style={{ color: "#475467", marginTop: 4 }}>{survey.siteAddress || "No site address yet"}</div>
                  </div>
                  <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{survey.status}</span>
                </div>
                <div style={{ color: "#667085", fontSize: 13 }}>
                  {[survey.contactName, survey.phone, survey.dueDate ? `Due ${survey.dueDate}` : null, survey.assignedTo].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href={`/quotes?fromSurvey=${survey.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, background: "#111827", color: "#fff", fontWeight: 800 }}>Create quote from survey</Link>
                </div>
              </article>
            ))}
            {surveyRequests.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No survey requests yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
