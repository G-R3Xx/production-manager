import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { listMaterialsForTenant } from "@/server/materials";
import { getCompanySettingsByTenantId } from "@/server/company";
import { createQuoteDraftAction, deleteQuoteLineAction } from "./actions";
import { QuoteMaterialFlowBuilder } from "./QuoteMaterialFlowBuilder";
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
  return { background: "rgba(255,255,255,0.94)", border: "1px solid #dfe7f2", borderRadius: 26, padding: 22, boxShadow: "0 18px 48px rgba(15,23,42,0.06)" } as const;
}

const inputStyle = { minHeight: 44, borderRadius: 14, border: "1px solid #cfd9e8", padding: "0 14px", width: "100%", boxSizing: "border-box", background: "#fff" } as const;
const textareaStyle = { minHeight: 110, borderRadius: 14, border: "1px solid #cfd9e8", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 14, border: "none", background: "#0f172a", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 16px" } as const;

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

  const [quoteDrafts, materials, enquiry, survey, selectedQuote, companySettings] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    fromEnquiry ? getEnquiryById(activeTenant.tenantId, fromEnquiry) : Promise.resolve(null),
    fromSurvey ? getSurveyRequestById(activeTenant.tenantId, fromSurvey) : Promise.resolve(null),
    selected ? getQuoteDraftById(activeTenant.tenantId, selected) : Promise.resolve(null),
    getCompanySettingsByTenantId(activeTenant.tenantId)
  ]);

  const quoteLines = selectedQuote ? await listQuoteLines(selectedQuote.id) : [];
  const sourceClientName = survey?.clientName ?? enquiry?.clientName ?? "";
  const sourceContactName = survey?.contactName ?? enquiry?.contactName ?? "";
  const sourcePhone = survey?.phone ?? enquiry?.phone ?? "";
  const sourceEmail = enquiry?.email ?? "";
  const activeMaterials = materials.filter((material) => material.active);

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      <section style={{ ...cardStyle(), display: "grid", gap: 8, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 54%, #eef6ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" }}>Quote entry</p>
        <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Build quote lines from materials</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Start with a base material, then move through the card flow: thickness, colour, size, print, ink, laminate and finishing. Products/templates stay in the background as optional shortcuts.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
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
            <textarea name="notes" defaultValue={[enquiry?.requestSummary, survey?.notes, survey?.surveyDetails].filter(Boolean).join("\n\n")} placeholder="Quote notes" style={textareaStyle} />
            <button type="submit" style={buttonStyle}>Create draft quote</button>
          </form>

          <section style={{ ...cardStyle(), display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Draft quotes</h2>
              <span style={{ fontSize: 13, color: "#667085" }}>{quoteDrafts.length} total</span>
            </div>
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
              {quoteDrafts.map((quote) => {
                const active = selectedQuote?.id === quote.id;
                return (
                  <a key={quote.id} href={`/quotes?selected=${quote.id}`} style={{ textDecoration: "none", color: "inherit", border: active ? "2px solid #155eef" : "1px solid #dfe7f2", borderRadius: 18, padding: 14, display: "grid", gap: 6, background: active ? "#eff6ff" : "#fbfdff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>{quote.clientName}</strong>
                      <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{quote.status}</span>
                    </div>
                    <div style={{ color: "#667085", fontSize: 13 }}>{[quote.contactName, quote.phone, quote.discountPercent !== "0" ? `Discount ${quote.discountPercent}%` : null].filter(Boolean).join(" · ")}</div>
                  </a>
                );
              })}
              {quoteDrafts.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No draft quotes yet.</p> : null}
            </div>
          </section>
        </div>

        <section style={{ ...cardStyle(), display: "grid", gap: 16 }}>
          {selectedQuote ? (
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Selected quote: {selectedQuote.clientName}</h2>
                <p style={{ margin: "6px 0 0", color: "#667085" }}>Add line items by building from your material library. Start with Acrylic, ACM, Corflute, PVC, Banner or another sheet material.</p>
              </div>

              <QuoteMaterialFlowBuilder
                quoteId={selectedQuote.id}
                materials={activeMaterials}
                pricingSettings={{
                  markupMultiplier: companySettings?.globalMarkupMultiplier ?? "1.5",
                  profitMultiplier: companySettings?.globalProfitMultiplier ?? "1.2",
                  labourRate: companySettings?.quoteLabourRate ?? "66",
                  inkRatePerSqm: companySettings?.quoteInkRatePerSqm ?? "10",
                  monoRatePerSqm: companySettings?.quoteMonoRatePerSqm ?? "4",
                  signageSizePresets: companySettings?.quoteSignageSizePresets,
                  smallSizePresets: companySettings?.quoteSmallSizePresets
                }}
              />

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h4 style={{ margin: 0 }}>Saved quote lines</h4>
                  <p style={{ margin: 0, color: "#667085", fontSize: 13 }}>Saved lines are snapshots. Change the card flow above, then save a new line or remove an old one.</p>
                </div>
                {quoteLines.map((line) => (
                  <div key={line.id} style={{ border: "1px solid #dfe7f2", borderRadius: 18, padding: 14, display: "grid", gap: 10, background: "#fbfdff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{line.productName}</strong>
                        <div style={{ color: "#667085", fontSize: 13 }}>{[line.optionSummary, `Qty ${line.quantity}`, `Unit $${line.unitPrice}`, `Total $${line.lineTotal}`].filter(Boolean).join(" · ")}</div>
                      </div>
                      <form action={deleteQuoteLineAction}>
                        <input type="hidden" name="quoteId" value={selectedQuote.id} />
                        <input type="hidden" name="lineId" value={line.id} />
                        <button type="submit" style={{ border: "1px solid #fecaca", background: "#fff", color: "#b42318", borderRadius: 12, padding: "8px 10px", fontWeight: 900, cursor: "pointer" }}>Remove</button>
                      </form>
                    </div>
                  </div>
                ))}
                {quoteLines.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No saved quote lines yet. Build a line above, then save it to the quote.</p> : null}
              </div>
            </div>
          ) : (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 22, padding: 30, display: "grid", placeItems: "center", textAlign: "center", gap: 8, minHeight: 320 }}>
              <h2 style={{ margin: 0 }}>Choose or create a quote first</h2>
              <p style={{ margin: 0, color: "#667085" }}>Once a draft is selected, the material card flow appears here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
