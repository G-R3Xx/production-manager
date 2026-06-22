
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listEnquiriesForTenant } from "@/server/enquiries";
import { createEnquiryAction, createSurveyFromEnquiryAction } from "./actions";


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


export default async function EnquiriesPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const enquiries = await listEnquiriesForTenant(activeTenant.tenantId);

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
          <input name="clientName" placeholder="Client / business name" style={inputStyle} />
          <input name="contactName" placeholder="Contact name" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="phone" placeholder="Phone" style={inputStyle} />
            <input name="email" placeholder="Email" style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="source" placeholder="Source (call / email / walk-in)" style={inputStyle} />
            <input name="urgency" placeholder="Urgency" style={inputStyle} />
          </div>
          <input name="siteAddress" placeholder="Site address if relevant" style={inputStyle} />
          <textarea name="requestSummary" placeholder="Rough idea of what they require" style={textareaStyle} />
          <textarea name="notes" placeholder="Internal notes" style={textareaStyle} />
          <button type="submit" style={buttonStyle}>Create enquiry</button>
        </form>

        <section style={{ ...cardStyle(), display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Current enquiries</h2>
            <span style={{ fontSize: 13, color: "#667085" }}>{enquiries.length} total</span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {enquiries.map((enquiry) => (
              <article key={enquiry.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <strong>{enquiry.clientName}</strong>
                    <div style={{ color: "#475467", marginTop: 4 }}>{enquiry.requestSummary}</div>
                  </div>
                  <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{enquiry.status}</span>
                </div>
                <div style={{ color: "#667085", fontSize: 13 }}>
                  {[enquiry.contactName, enquiry.phone, enquiry.email, enquiry.siteAddress].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <form action={createSurveyFromEnquiryAction} style={{ margin: 0 }}>
                    <input type="hidden" name="enquiryId" value={enquiry.id} />
                    <button type="submit" style={{ minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, cursor: "pointer" }}>Create site survey request</button>
                  </form>
                  <Link href={`/surveys?fromEnquiry=${enquiry.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, border: "1px solid #d0d5dd", color: "#111827", fontWeight: 700 }}>Open survey form</Link>
                  <Link href={`/quotes?fromEnquiry=${enquiry.id}`} style={{ textDecoration: "none", minHeight: 40, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, background: "#111827", color: "#fff", fontWeight: 800 }}>Create quote</Link>
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
