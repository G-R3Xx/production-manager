import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";

type QuotesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function humanize(value: string | null | undefined): string {
  if (!value) return "Not set";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2 mm");
}

function choiceValue(option: any): string {
  return String(option?.value ?? option?.label ?? "");
}

function choiceLabel(option: any): string {
  return String(option?.label ?? option?.value ?? "Choice");
}

function triggerSummary(component: Record<string, any>): string {
  const trigger = component.trigger ?? {};
  const optionKey = trigger.optionKey ?? component.stockUsage?.optionKey;
  const values = Array.isArray(trigger.optionValues) && trigger.optionValues.length > 0 ? trigger.optionValues : component.stockUsage?.optionValues;
  if (!optionKey || (Array.isArray(values) && values.length === 0 && component.role === "base_material")) return "Always used";
  const friendlyValues = Array.isArray(values) && values.length > 0 ? values.map(humanize).join(", ") : "selected";
  return `Only when ${humanize(optionKey)} is ${friendlyValues}`;
}

function usageSummary(component: Record<string, any>): string {
  const ruleType = String(component.ruleType ?? component.stockUsage?.usageBasis ?? "fixed");
  if (ruleType === "yield_based") return "Allocates part of parent sheet / yield";
  if (ruleType === "per_linear_metre") return "Allocates metres from roll";
  if (ruleType === "per_sqm") return "Allocates by square metre";
  if (ruleType === "per_unit") return `Allocates ${component.quantity ?? 1} ${component.unit ?? "each"} per quantity`;
  if (ruleType === "selected_by_option") return "Applies only when selected";
  return humanize(ruleType);
}

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 24,
  padding: 22,
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)"
};

const softCardStyle: CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 16
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "0 12px",
  fontSize: 15,
  boxSizing: "border-box",
  background: "#fff"
};

const labelStyle: CSSProperties = { display: "grid", gap: 7, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 850, fontSize: 13, color: "#344054" };
const mutedTextStyle: CSSProperties = { color: "#667085", fontSize: 13, lineHeight: 1.5 };
const buttonStyle: CSSProperties = { minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, cursor: "pointer", padding: "0 16px" };
const pillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "5px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const greenPillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#ecfdf3", color: "#067647", padding: "5px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };

function QuoteField({ field }: { field: Record<string, any> }) {
  const options = Array.isArray(field.options) ? field.options : [];
  const defaultValue = String(field.defaultValue ?? "");
  const matchedDefault = options.find((option: any) => choiceValue(option) === defaultValue || choiceLabel(option) === defaultValue);

  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>{field.label}</span>
      {options.length > 0 ? (
        <select name={field.key} defaultValue={matchedDefault ? choiceValue(matchedDefault) : defaultValue} style={inputStyle}>
          {options.map((option: any) => <option key={option.id ?? choiceValue(option)} value={choiceValue(option)}>{choiceLabel(option)}</option>)}
        </select>
      ) : (
        <input name={field.key} defaultValue={defaultValue} type={field.type === "quantity" || field.type === "number" ? "number" : "text"} style={inputStyle} />
      )}
      {field.helpText ? <span style={mutedTextStyle}>{field.helpText}</span> : null}
      {field.showWhen?.optionKey ? <span style={mutedTextStyle}>Appears when {humanize(field.showWhen.optionKey)} is {(field.showWhen.optionValues ?? []).map(humanize).join(", ")}</span> : null}
    </label>
  );
}

export default async function QuotesPage({ searchParams }: QuotesPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const params = (await searchParams) ?? {};
  const selectedProductId = readParam(params, "product");

  const [products, materials, selectedProduct] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    selectedProductId ? getProductById(activeTenant.tenantId, selectedProductId) : Promise.resolve(null)
  ]);

  const template = selectedProduct?.defaultTemplateId
    ? await getConfiguratorTemplateById(activeTenant.tenantId, selectedProduct.defaultTemplateId)
    : null;

  const definition = template?.definitionJson ?? {};
  const fields = Array.isArray(definition.fields) ? definition.fields : [];
  const components = Array.isArray(definition.components) ? definition.components : [];
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const baseComponents = components.filter((item) => item.role === "base_material" || (!item.trigger?.optionKey && item.kind !== "labour"));
  const triggeredComponents = components.filter((item) => !baseComponents.includes(item));

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Quotes</p>
            <h1 style={{ margin: "10px 0 8px", fontSize: 34 }}>Quote builder</h1>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 880 }}>
              This is where quote-time choices happen. Select a base product, then choose the size, print type, laminate, finishing and quantity. The product setup controls which materials are allocated.
            </p>
          </div>
          <span style={pillStyle}>{products.length} products available</span>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <aside style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>1. Select product</h2>
          {products.length === 0 ? (
            <p style={{ margin: 0, color: "#475467" }}>No products created yet. Create base products first.</p>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: 680, overflowY: "auto" }}>
              {products.map((product) => {
                const selected = selectedProduct?.id === product.id;
                return (
                  <a
                    key={product.id}
                    href={`/quotes?product=${product.id}`}
                    style={{
                      border: selected ? "1px solid #4f46e5" : "1px solid #e5e7eb",
                      background: selected ? "#eef2ff" : "#fafafa",
                      color: "#111827",
                      borderRadius: 14,
                      padding: 13,
                      textDecoration: "none"
                    }}
                  >
                    <strong>{product.name}</strong>
                    <div style={{ marginTop: 5, fontSize: 13, color: "#475467" }}>{product.sku || "No SKU"} · {humanize(product.productFamily)}</div>
                    <div style={{ marginTop: 5, fontSize: 12, color: "#667085" }}>{product.templateName ? "quote choices ready" : "needs quote behaviour"}</div>
                  </a>
                );
              })}
            </div>
          )}
        </aside>

        <main style={{ display: "grid", gap: 16 }}>
          {!selectedProduct ? (
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Select a product to start a quote</h2>
              <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
                Example: choose “Sign - ACM - 3mm”, then the quote screen will ask for size, print type, laminate, finishing and quantity.
              </p>
            </section>
          ) : (
            <>
              <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Selected product</p>
                    <h2 style={{ margin: "8px 0 0", fontSize: 30 }}>{selectedProduct.name}</h2>
                    <p style={{ margin: "6px 0 0", color: "#667085" }}>{selectedProduct.sku || "No SKU"} · GST</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={greenPillStyle}>{baseComponents.length} base materials</span>
                    <span style={pillStyle}>{fields.length} quote choices</span>
                  </div>
                </div>
                <div style={{ ...softCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
                  <strong style={{ color: "#067647" }}>Quote flow</strong>
                  <p style={{ margin: "6px 0 0", color: "#064e3b", lineHeight: 1.55 }}>
                    The base product is fixed. The choices below are what staff change for this quote only. Stock allocation comes from the base materials and any extra materials triggered by the choices.
                  </p>
                </div>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <h2 style={{ margin: 0 }}>2. Quote choices</h2>
                {fields.length === 0 ? (
                  <div style={{ border: "1px dashed #d0d5dd", borderRadius: 16, padding: 16, color: "#475467" }}>
                    This product has no quote behaviour yet. Open it on Products and apply a quote preset such as ACM sign, banner or business cards.
                  </div>
                ) : (
                  <form style={{ display: "grid", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                      {fields.map((field, index) => <QuoteField key={field.id ?? `${field.key}-${index}`} field={field} />)}
                    </div>
                    <div style={{ ...softCardStyle }}>
                      <strong>Next batch placeholder</strong>
                      <p style={{ margin: "6px 0 0", ...mutedTextStyle }}>
                        This screen now shows the correct quote flow. The next database batch can save quote headers, quote lines, selected answers, pricing snapshot and material allocations.
                      </p>
                    </div>
                    <button type="button" style={{ ...buttonStyle, opacity: 0.65, cursor: "not-allowed" }}>Save quote line coming next</button>
                  </form>
                )}
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <h2 style={{ margin: 0 }}>3. Stock allocation preview</h2>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={softCardStyle}>
                    <strong>Base product materials</strong>
                    {baseComponents.length === 0 ? (
                      <p style={{ margin: "8px 0 0", ...mutedTextStyle }}>No base material linked yet.</p>
                    ) : (
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {baseComponents.map((item, index) => {
                          const material = item.materialId ? materialMap.get(item.materialId) : null;
                          return (
                            <div key={item.id ?? `${item.label}-${index}`} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
                              <strong>{item.label}</strong>
                              <div style={{ marginTop: 4, ...mutedTextStyle }}>{material?.name ? `Material: ${material.name}` : "No material linked"} · {usageSummary(item)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={softCardStyle}>
                    <strong>Materials triggered by quote choices</strong>
                    {triggeredComponents.length === 0 ? (
                      <p style={{ margin: "8px 0 0", ...mutedTextStyle }}>No optional materials or labour yet.</p>
                    ) : (
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {triggeredComponents.map((item, index) => {
                          const material = item.materialId ? materialMap.get(item.materialId) : null;
                          return (
                            <div key={item.id ?? `${item.label}-${index}`} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
                              <strong>{item.label}</strong>
                              <div style={{ marginTop: 4, ...mutedTextStyle }}>{material?.name ? `Material: ${material.name}` : item.kind === "labour" ? "Labour / process" : "Material link can be added later"} · {usageSummary(item)}</div>
                              <div style={{ marginTop: 3, ...mutedTextStyle }}>{triggerSummary(item)}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </section>
    </div>
  );
}
