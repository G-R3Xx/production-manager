
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { listMaterialsForTenant } from "@/server/materials";
import { listProductsForTenant } from "@/server/products";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { createQuoteDraftAction } from "./actions";
import { QuoteLineBuilder } from "./QuoteLineBuilder";
import { getQuoteDraftById, listQuoteDraftsForTenant, listQuoteLines } from "@/server/quotes";


type QuoteChoice = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  widthMm?: string | null;
  heightMm?: string | null;
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

type QuoteComponent = {
  id?: string | null;
  label?: string | null;
  kind?: string | null;
  materialId?: string | null;
  quantity?: string | null;
  unit?: string | null;
  ruleType?: string | null;
  wastePercent?: string | null;
  notes?: string | null;
  stockUsage?: {
    usageBasis?: string | null;
    dimensionSource?: string | null;
    optionKey?: string | null;
    optionValues?: string[] | null;
    widthMm?: string | null;
    heightMm?: string | null;
    rollWidthMm?: string | null;
    partsPerSheet?: string | null;
    metresPerUnit?: string | null;
    sheetsPerUnit?: string | null;
    sellRate?: string | null;
    chargeName?: string | null;
  } | null;
  trigger?: {
    optionKey?: string | null;
    optionValues?: string[] | null;
  } | null;
};

type QuoteProduct = {
  id: string;
  name: string;
  sku?: string | null;
  fields: QuoteQuestion[];
  components: QuoteComponent[];
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
      const type = String(field?.type ?? "text");
      const options = Array.isArray(field?.options)
        ? field.options.map((option: any) => ({
            id: option?.id ? String(option.id) : null,
            label: option?.label ? String(option.label) : String(option?.value ?? ""),
            value: String(option?.value ?? option?.label ?? ""),
            widthMm: option?.widthMm == null ? null : String(option.widthMm),
            heightMm: option?.heightMm == null ? null : String(option.heightMm)
          })).filter((option: QuoteChoice) => String(option.value ?? "").length > 0)
        : [];

      return {
        id: field?.id ? String(field.id) : key,
        key,
        label: label || key,
        type,
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
    .filter((field: QuoteQuestion) => {
      if (field.label.length === 0) return false;

      const isEmptyPlaceholder =
        field.label.toLowerCase() === "quote choice" &&
        ["select", "size_select", "color"].includes(field.type) &&
        (!field.options || field.options.length === 0);

      return !isEmptyPlaceholder;
    });
}
function cleanComponents(definition: Record<string, any> | null | undefined): QuoteComponent[] {
  const rawComponents = Array.isArray(definition?.components) ? definition?.components ?? [] : [];

  return rawComponents.map((component: any, index: number) => ({
    id: component?.id ? String(component.id) : `component_${index + 1}`,
    label: component?.label == null ? `Material row ${index + 1}` : String(component.label),
    kind: component?.kind == null ? "material" : String(component.kind),
    materialId: component?.materialId == null || component.materialId === "" ? null : String(component.materialId),
    quantity: component?.quantity == null ? "1" : String(component.quantity),
    unit: component?.unit == null ? null : String(component.unit),
    ruleType: component?.ruleType == null ? null : String(component.ruleType),
    wastePercent: component?.wastePercent == null ? "0" : String(component.wastePercent),
    notes: component?.notes == null ? null : String(component.notes),
    stockUsage: component?.stockUsage
      ? {
          usageBasis: component.stockUsage.usageBasis == null ? null : String(component.stockUsage.usageBasis),
          dimensionSource: component.stockUsage.dimensionSource == null ? null : String(component.stockUsage.dimensionSource),
          optionKey: component.stockUsage.optionKey == null ? null : String(component.stockUsage.optionKey),
          optionValues: Array.isArray(component.stockUsage.optionValues) ? component.stockUsage.optionValues.map(String) : [],
          widthMm: component.stockUsage.widthMm == null ? null : String(component.stockUsage.widthMm),
          heightMm: component.stockUsage.heightMm == null ? null : String(component.stockUsage.heightMm),
          rollWidthMm: component.stockUsage.rollWidthMm == null ? null : String(component.stockUsage.rollWidthMm),
          partsPerSheet: component.stockUsage.partsPerSheet == null ? null : String(component.stockUsage.partsPerSheet),
          metresPerUnit: component.stockUsage.metresPerUnit == null ? null : String(component.stockUsage.metresPerUnit),
          sheetsPerUnit: component.stockUsage.sheetsPerUnit == null ? null : String(component.stockUsage.sheetsPerUnit),
          sellRate: component.stockUsage.sellRate == null ? null : String(component.stockUsage.sellRate),
          chargeName: component.stockUsage.chargeName == null ? null : String(component.stockUsage.chargeName)
        }
      : null,
    trigger: component?.trigger
      ? {
          optionKey: component.trigger.optionKey == null ? null : String(component.trigger.optionKey),
          optionValues: Array.isArray(component.trigger.optionValues) ? component.trigger.optionValues.map(String) : []
        }
      : null
  }));
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

  const [quoteDrafts, products, materials, enquiry, survey, selectedQuote] = await Promise.all([
    listQuoteDraftsForTenant(activeTenant.tenantId),
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
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
    fields: cleanQuoteQuestions(productTemplates[index]?.definitionJson),
    components: cleanComponents(productTemplates[index]?.definitionJson)
  }));
  const sourceClientName = survey?.clientName ?? enquiry?.clientName ?? "";
  const sourceContactName = survey?.contactName ?? enquiry?.contactName ?? "";
  const sourcePhone = survey?.phone ?? enquiry?.phone ?? "";
  const sourceEmail = enquiry?.email ?? "";

  return (
    <div style={{ maxWidth: 1360, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}
      <section style={{ ...cardStyle(), display: "grid", gap: 8, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 54%, #eef6ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" }}>Quote entry</p>
        <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Fast quote setup from enquiry or survey</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Choose a product, answer its quote cards, and the line price is calculated from linked material cost, sheet/roll usage and sell charges. MYOB linkage can happen later when the quote/job is ready.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "390px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
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
              <a key={quote.id} href={`/quotes?selected=${quote.id}`} style={{ textDecoration: "none", color: "inherit", border: "1px solid #dfe7f2", borderRadius: 18, padding: 16, display: "grid", gap: 6, background: "#fbfdff" }}>
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
                <p style={{ margin: "6px 0 0", color: "#667085" }}>Add quote lines by choosing a product, then answering the quote cards you set up on the Products page.</p>
              </div>
              <QuoteLineBuilder quoteId={selectedQuote.id} products={quoteProducts} materials={materials.filter((material) => material.active)} />

              <div style={{ display: "grid", gap: 10 }}>
                <h4 style={{ margin: 0 }}>Quote lines</h4>
                {quoteLines.map((line) => (
                  <div key={line.id} style={{ border: "1px solid #dfe7f2", borderRadius: 18, padding: 14, display: "grid", gap: 4, background: "#fbfdff" }}>
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
