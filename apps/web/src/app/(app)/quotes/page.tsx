
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { listProductsForTenant } from "@/server/products";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { createQuoteDraftAction } from "./actions";
import { QuoteLineBuilder } from "./QuoteLineBuilder";
import { getQuoteDraftById, listQuoteDraftsForTenant, listQuoteLines } from "@/server/quotes";


type QuoteChoice = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  priceDelta?: string | null;
};

type QuoteQuestion = {
  id?: string | null;
  key: string;
  label: string;
  type: string;
  required?: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  options?: QuoteChoice[];
  showWhen?: {
    optionKey?: string | null;
    optionValues?: string[] | null;
  } | null;
};

type QuoteProduct = {
  id: string;
  name: string;
  sku?: string | null;
  fields: QuoteQuestion[];
};

function cleanQuestionKey(value: unknown, fallback: string): string {
  const raw = String(value ?? fallback).trim();
  return raw || fallback;
}

function cleanQuoteQuestions(definition: Record<string, any> | null | undefined): QuoteQuestion[] {
  const rawFields = Array.isArray(definition?.fields) ? definition?.fields ?? [] : [];

  return rawFields
    .map((field: any, index: number) => {
      const label = String(field?.label ?? `Option ${index + 1}`).trim();
      const key = cleanQuestionKey(field?.key, `option_${index + 1}`);
      const options = Array.isArray(field?.options)
        ? field.options.map((option: any) => ({
            id: option?.id ? String(option.id) : null,
            label: option?.label ? String(option.label) : String(option?.value ?? ""),
            value: String(option?.value ?? option?.label ?? ""),
            priceDelta: option?.priceDelta == null && option?.price == null ? "0" : String(option.priceDelta ?? option.price)
          })).filter((option: QuoteChoice) => String(option.value ?? "").length > 0)
        : [];

      return {
        id: field?.id ? String(field.id) : key,
        key,
        label: label || key,
        type: String(field?.type ?? "text"),
        required: field?.required !== false,
        defaultValue: field?.defaultValue == null ? null : String(field.defaultValue),
        helpText: field?.helpText == null ? null : String(field.helpText),
        options,
        showWhen: field?.showWhen?.optionKey
          ? {
              optionKey: String(field.showWhen.optionKey),
              optionValues: Array.isArray(field.showWhen.optionValues) ? field.showWhen.optionValues.map(String) : []
            }
          : null
      };
    })
    .filter((field: QuoteQuestion) => field.label.length > 0);
}

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
  const [quoteLines, productTemplates] = await Promise.all([
    selectedQuote ? listQuoteLines(selectedQuote.id) : Promise.resolve([]),
    Promise.all(products.map((product) => product.defaultTemplateId
      ? getConfiguratorTemplateById(activeTenant.tenantId, product.defaultTemplateId)
      : Promise.resolve(null)))
  ]);
  const quoteProducts: QuoteProduct[] = products.map((product, index) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    fields: cleanQuoteQuestions(productTemplates[index]?.definitionJson)
  }));
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
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Choose a base product, answer its quote questions, set the price, then add the line. MYOB linkage can happen later when the quote/job is ready.</p>
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
                <p style={{ margin: "6px 0 0", color: "#667085" }}>Add quote lines by choosing a product, then selecting the options/questions you set up on the Products page.</p>
              </div>
              <QuoteLineBuilder quoteId={selectedQuote.id} products={quoteProducts} />

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
