
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { listProductsForTenant } from "@/server/products";
import { createQuoteDraftAction, addQuoteLineAction } from "./actions";
import { getQuoteDraftById, listQuoteDraftsForTenant, listQuoteLines } from "@/server/quotes";


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


export default async function QuotesPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const fromEnquiry = readParam(params, "fromEnquiry");
  const fromSurvey = readParam(params, "fromSurvey");
  const selected = readParam(params, "selected");

  const [quoteDrafts, products, enquiry, survey, selectedQuote] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId),
    listProductsForTenant(activeTenant.tenantId),
    fromEnquiry ? getEnquiryById(activeTenant.tenantId, fromEnquiry) : Promise.resolve(null),
    fromSurvey ? getSurveyRequestById(activeTenant.tenantId, fromSurvey) : Promise.resolve(null),
    selected ? getQuoteDraftById(activeTenant.tenantId, selected) : Promise.resolve(null)
  ]);
  const quoteLines = selectedQuote ? await listQuoteLines(selectedQuote.id) : [];
  const sourceClientName = survey?.clientName ?? enquiry?.clientName ?? "";
  const sourceContactName = survey?.contactName ?? enquiry?.contactName ?? "";
  const sourcePhone = survey?.phone ?? enquiry?.phone ?? "";
  const sourceEmail = enquiry?.email ?? "";

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}
      <section style={{ ...cardStyle(), display: "grid", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Quote entry</p>
        <h1 style={{ margin: 0 }}>Fast quote setup from enquiry or survey</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Choose a base product, preset options, and quantity. MYOB linkage can happen later when the quote/job is ready.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "420px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <form action={createQuoteDraftAction} style={{ ...cardStyle(), display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>New draft quote</h2>
          <input type="hidden" name="enquiryId" value={enquiry?.id ?? ""} />
          <input type="hidden" name="surveyRequestId" value={survey?.id ?? ""} />
          <input name="clientName" defaultValue={sourceClientName} placeholder="Client / business name" style={inputStyle} />
          <input name="contactName" defaultValue={sourceContactName} placeholder="Contact name" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="phone" defaultValue={sourcePhone} placeholder="Phone" style={inputStyle} />
            <input name="email" defaultValue={sourceEmail} placeholder="Email" style={inputStyle} />
          </div>
          <input name="discountPercent" defaultValue="0" placeholder="Client discount %" style={inputStyle} />
          <textarea name="notes" defaultValue={[enquiry?.requestSummary, survey?.notes].filter(Boolean).join("\n\n")} placeholder="Quote notes" style={textareaStyle} />
          <button type="submit" style={buttonStyle}>Create draft quote</button>
        </form>

        <section style={{ ...cardStyle(), display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Current draft quotes</h2>
            <span style={{ fontSize: 13, color: "#667085" }}>{quoteDrafts.length} total</span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {quoteDrafts.map((quote) => (
              <a key={quote.id} href={`/quotes?selected=${quote.id}`} style={{ textDecoration: "none", color: "inherit", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>{quote.clientName}</strong>
                  <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{quote.status}</span>
                </div>
                <div style={{ color: "#667085", fontSize: 13 }}>{[quote.contactName, quote.phone, quote.discountPercent !== "0" ? `Discount ${quote.discountPercent}%` : null].filter(Boolean).join(" · ")}</div>
              </a>
            ))}
            {quoteDrafts.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No draft quotes yet.</p> : null}
          </div>

          {selectedQuote ? (
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, display: "grid", gap: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>Selected quote: {selectedQuote.clientName}</h3>
                <p style={{ margin: "6px 0 0", color: "#667085" }}>Add fast quote lines by choosing a base product, a preset option summary, and quantity.</p>
              </div>
              <form action={addQuoteLineAction} style={{ display: "grid", gap: 12 }}>
                <input type="hidden" name="quoteId" value={selectedQuote.id} />
                <select name="productId" style={inputStyle}>
                  <option value="">Choose base product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
                <input name="optionSummary" placeholder="Preset options (eg 600x900, direct print, matte laminate)" style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input name="quantity" defaultValue="1" placeholder="Quantity" style={inputStyle} />
                  <input name="unitPrice" defaultValue="0" placeholder="Unit price" style={inputStyle} />
                </div>
                <textarea name="notes" placeholder="Line notes" style={textareaStyle} />
                <button type="submit" style={buttonStyle}>Add quote line</button>
              </form>

              <div style={{ display: "grid", gap: 10 }}>
                <h4 style={{ margin: 0 }}>Quote lines</h4>
                {quoteLines.map((line) => (
                  <div key={line.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, display: "grid", gap: 4 }}>
                    <strong>{line.productName}</strong>
                    <div style={{ color: "#667085", fontSize: 13 }}>{[line.optionSummary, `Qty ${line.quantity}`, `Unit $${line.unitPrice}`, `Total $${line.lineTotal}`].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
                {quoteLines.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No quote lines yet.</p> : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
