import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { getProductById, listProductsForTenant } from "@/server/products";
import { listMaterialsForTenant } from "@/server/materials";
import { listSuppliersForTenant } from "@/server/suppliers";
import { addProductComponentAction, addProductOptionAction, addStarterRulesAction, createProductAction, updateProductAction } from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type EditorDefinition = {
  components: Array<Record<string, any>>;
  fields: Array<Record<string, any>>;
};

type FlowStep = {
  number: string;
  title: string;
  description: string;
  href: string;
  status: string;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function matchesQuery(value: string | null | undefined, query: string): boolean {
  return String(value ?? "").toLowerCase().includes(query.toLowerCase());
}

function formatFamily(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelForFieldType(value: string): string {
  switch (value) {
    case "yes_no":
      return "Yes / No";
    case "select":
      return "Select";
    case "size_select":
      return "Size select";
    case "quantity":
      return "Quantity";
    case "number":
      return "Number";
    case "color":
      return "Colour";
    case "binding":
      return "Binding";
    default:
      return value || "Text";
  }
}

function labelForRuleType(value: string): string {
  switch (value) {
    case "fixed":
      return "Fixed qty";
    case "per_unit":
      return "Per unit sold";
    case "per_sqm":
      return "Per sqm";
    case "per_linear_metre":
      return "Per linear metre";
    case "per_sheet":
      return "Per sheet";
    case "yield_based":
      return "Yield based";
    case "selected_by_option":
      return "Selected by option";
    default:
      return value || "Fixed qty";
  }
}

function rulePlainEnglish(component: Record<string, any>): string {
  const usage = component.stockUsage ?? {};
  const trigger = component.trigger ?? {};
  const rule = labelForRuleType(component.ruleType);
  const base = `${rule} · ${component.quantity ?? "1"} ${component.unit ?? "each"}`;
  const source = usage.dimensionSource ? ` from ${String(usage.dimensionSource).replace(/_/g, " ")}` : "";
  const triggerText = trigger.optionKey
    ? ` · only when ${trigger.optionKey} is ${trigger.optionValue || (Array.isArray(trigger.optionValues) && trigger.optionValues.length > 0 ? trigger.optionValues.join(", ") : "selected")}`
    : "";
  return `${base}${source}${triggerText}`;
}

function choiceLabels(field: Record<string, any>): string {
  if (!Array.isArray(field.options) || field.options.length === 0) return "Free entry / no fixed choices";
  return field.options.map((option: any) => option.label ?? option.value).join(", ");
}

function optionPlainEnglish(field: Record<string, any>): string {
  const rule = field.rule ?? {};
  if (!rule.componentLinkMode || rule.componentLinkMode === "none") return "Used as a quote choice. No component link yet.";
  return `${String(rule.componentLinkMode).replace(/_/g, " ")} ${rule.effectTarget ? `→ ${rule.effectTarget}` : ""}`.trim();
}

function selectedProductUrl(productId: string, query: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  return `/products?selected=${productId}${q}`;
}

function statusTone(value: string): CSSProperties {
  if (value === "active") return { background: "#ecfdf3", color: "#067647", borderColor: "#abefc6" };
  if (value === "archived") return { background: "#f2f4f7", color: "#475467", borderColor: "#d0d5dd" };
  return { background: "#fffaeb", color: "#b54708", borderColor: "#fedf89" };
}

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 22,
  padding: 22,
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)"
};

const softCardStyle: CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 16
};

const compactCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
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

const textareaStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: 12,
  fontSize: 15,
  boxSizing: "border-box",
  background: "#fff"
};

const labelStyle: CSSProperties = { display: "grid", gap: 7, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 800, fontSize: 13, color: "#344054" };
const gridTwoStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 };
const gridThreeStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, cursor: "pointer", padding: "0 16px" };
const secondaryButtonStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 900, cursor: "pointer", padding: "0 14px" };
const pillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "5px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const mutedTextStyle: CSSProperties = { color: "#667085", fontSize: 13, lineHeight: 1.5 };
const stepNumberStyle: CSSProperties = { width: 34, height: 34, borderRadius: 999, background: "#111827", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flex: "0 0 auto" };
const sectionAnchorStyle: CSSProperties = { scrollMarginTop: 24 };

function StepHeading({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={stepNumberStyle}>{number}</span>
      <div>
        <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
        <p style={{ margin: "7px 0 0", color: "#475467", lineHeight: 1.55 }}>{children}</p>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div style={{ border: "1px dashed #d0d5dd", borderRadius: 16, padding: 16, color: "#667085", background: "#fcfcfd" }}>{children}</div>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedId = readParam(params, "selected");
  const query = readParam(params, "q");

  const [products, materials, suppliers, selectedProduct] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId),
    selectedId ? getProductById(activeTenant.tenantId, selectedId) : Promise.resolve(null)
  ]);

  const filteredProducts = query
    ? products.filter((product) => matchesQuery(product.name, query) || matchesQuery(product.sku, query) || matchesQuery(product.productFamily, query))
    : products;

  const editorTemplate = selectedProduct?.defaultTemplateId
    ? await getConfiguratorTemplateById(activeTenant.tenantId, selectedProduct.defaultTemplateId)
    : null;
  const editorDefinition: EditorDefinition = {
    components: Array.isArray(editorTemplate?.definitionJson?.components) ? editorTemplate.definitionJson.components : [],
    fields: Array.isArray(editorTemplate?.definitionJson?.fields) ? editorTemplate.definitionJson.fields : []
  };

  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const activeMaterials = materials.filter((material) => material.active);
  const hasProductDetails = Boolean(selectedProduct?.name);
  const hasComponents = editorDefinition.components.length > 0;
  const hasOptions = editorDefinition.fields.length > 0;
  const flowSteps: FlowStep[] = [
    {
      number: "1",
      title: "Product details",
      description: "Name, SKU, department and family.",
      href: "#setup-step-details",
      status: hasProductDetails ? "Ready" : "Needs details"
    },
    {
      number: "2",
      title: "Components",
      description: "Materials, stock usage and labour behind the product.",
      href: "#setup-step-components",
      status: hasComponents ? `${editorDefinition.components.length} added` : "Add rules"
    },
    {
      number: "3",
      title: "Options",
      description: "Quote choices that drive components and quantities.",
      href: "#setup-step-options",
      status: hasOptions ? `${editorDefinition.fields.length} added` : "Add choices"
    }
  ];

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 16, minWidth: 0 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16, fontWeight: 800 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16, fontWeight: 800 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
            <h1 style={{ margin: "10px 0 8px", fontSize: 34 }}>Products</h1>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 900 }}>
              Set up each sellable product as a simple flow. Product details come first, components connect materials and labour, and options control the quote choices that trigger stock allocation.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={pillStyle}>{products.length} products</span>
            <span style={pillStyle}>{activeMaterials.length} active materials</span>
            <span style={pillStyle}>GST default hidden</span>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 350px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 16 }}>
          <details open style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 20, fontWeight: 900 }}>Add product</summary>
            <form action={createProductAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product name</span>
                <input name="name" required placeholder="5mm Corflute Sign" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>SKU</span>
                <input name="sku" placeholder="COR-5MM-SIGN" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Department</span>
                <select name="department" defaultValue="signage" style={inputStyle}>
                  <option value="signage">Signage</option>
                  <option value="small_format">Small format</option>
                  <option value="installation">Installation</option>
                  <option value="general">General</option>
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product family</span>
                <select name="productFamily" defaultValue="rigid_signage" style={inputStyle}>
                  <option value="rigid_signage">Rigid signage</option>
                  <option value="roll_media">Roll media</option>
                  <option value="banners">Banners</option>
                  <option value="stickers_labels">Stickers / labels</option>
                  <option value="window_wall_graphics">Window / wall graphics</option>
                  <option value="vehicle_graphics">Vehicle graphics</option>
                  <option value="display_products">Display products</option>
                  <option value="small_format_print">Small format print</option>
                </select>
              </label>
              <input type="hidden" name="status" value="draft" />
              <button type="submit" style={buttonStyle}>Create product</button>
              <p style={{ margin: 0, ...mutedTextStyle }}>Tax code is automatically saved as GST and is not shown here.</p>
            </form>
          </details>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Open product</h2>
                <p style={{ margin: "6px 0 0", color: "#475467", fontSize: 14 }}>Search and continue setup.</p>
              </div>
              <div style={{ fontSize: 13, color: "#667085" }}>{filteredProducts.length} shown</div>
            </div>
            <form method="GET" action="/products" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
              <input type="text" name="q" defaultValue={query} placeholder="Search products" style={inputStyle} />
              <button type="submit" style={secondaryButtonStyle}>Go</button>
            </form>
            <div style={{ display: "grid", gap: 8, maxHeight: 540, overflowY: "auto", paddingRight: 2 }}>
              {filteredProducts.map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                return (
                  <a
                    key={product.id}
                    href={selectedProductUrl(product.id, query)}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      border: isSelected ? "1px solid #4f46e5" : "1px solid #e5e7eb",
                      background: isSelected ? "#eef2ff" : "#fafafa",
                      color: "#111827",
                      borderRadius: 14,
                      padding: 13
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>{product.name}</strong>
                      <span style={{ border: "1px solid", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 900, ...statusTone(product.status) }}>{product.status}</span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 13, color: "#475467" }}>{product.sku || "No SKU"} · {formatFamily(product.productFamily)}</div>
                    <div style={{ marginTop: 5, fontSize: 12, color: "#667085" }}>{product.templateName ? "setup started" : "no setup yet"}</div>
                  </a>
                );
              })}
            </div>
          </section>
        </aside>

        <main style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {!selectedProduct ? (
            <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Select a product to edit</h2>
              <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
                Product setup now lives in one guided page. There are no separate Recipes or Configurators workflow pages.
              </p>
            </section>
          ) : (
            <>
              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Selected product</p>
                    <h2 style={{ margin: "8px 0 0", fontSize: 30 }}>{selectedProduct.name}</h2>
                    <p style={{ margin: "6px 0 0", color: "#667085" }}>{selectedProduct.sku || "No SKU"} · {formatFamily(selectedProduct.productFamily)} · GST default</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={pillStyle}>{editorDefinition.fields.length} options</span>
                    <span style={pillStyle}>{editorDefinition.components.length} components</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {flowSteps.map((step) => (
                    <a key={step.number} href={step.href} style={{ ...softCardStyle, textDecoration: "none", color: "#111827", display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <span style={stepNumberStyle}>{step.number}</span>
                        <span style={pillStyle}>{step.status}</span>
                      </div>
                      <strong style={{ fontSize: 17 }}>{step.title}</strong>
                      <span style={mutedTextStyle}>{step.description}</span>
                    </a>
                  ))}
                </div>
              </section>

              <section id="setup-step-details" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="1" title="Product details">
                  Keep this clean: product name, SKU, department, family and status. Tax is locked to GST behind the scenes.
                </StepHeading>

                <form action={updateProductAction} style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <input type="hidden" name="defaultTemplateId" value={selectedProduct.defaultTemplateId ?? ""} />
                  <div style={gridThreeStyle}>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Product name</span>
                      <input name="name" required defaultValue={selectedProduct.name} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>SKU</span>
                      <input name="sku" defaultValue={selectedProduct.sku ?? ""} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Status</span>
                      <select name="status" defaultValue={selectedProduct.status} style={inputStyle}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                  <div style={gridTwoStyle}>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Department</span>
                      <select name="department" defaultValue={selectedProduct.department} style={inputStyle}>
                        <option value="signage">Signage</option>
                        <option value="small_format">Small format</option>
                        <option value="installation">Installation</option>
                        <option value="general">General</option>
                      </select>
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Product family</span>
                      <select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}>
                        <option value="rigid_signage">Rigid signage</option>
                        <option value="roll_media">Roll media</option>
                        <option value="banners">Banners</option>
                        <option value="stickers_labels">Stickers / labels</option>
                        <option value="window_wall_graphics">Window / wall graphics</option>
                        <option value="vehicle_graphics">Vehicle graphics</option>
                        <option value="display_products">Display products</option>
                        <option value="small_format_print">Small format print</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <p style={{ margin: 0, ...mutedTextStyle }}>This is the sellable item that appears on quotes.</p>
                    <button type="submit" style={buttonStyle}>Save product details</button>
                  </div>
                </form>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Quick setup presets</h2>
                    <p style={{ margin: "7px 0 0", color: "#475467", lineHeight: 1.5 }}>
                      Use these to lay down the first sensible options and components, then adjust the rules in the flow below.
                    </p>
                  </div>
                </div>
                <form action={addStarterRulesAction} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 10 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <select name="starterType" defaultValue="rigid_signage" style={inputStyle}>
                    <option value="rigid_signage">Rigid signage: sheet + print + laminate + eyelets</option>
                    <option value="roll_print">Roll print: media metres + ink + laminate</option>
                    <option value="cards">Cards / flyers: sheet yield + sides + cello</option>
                    <option value="books">Books: pages + cover + binding</option>
                    <option value="carbon_books">Carbon books: duplicate/triplicate + copy colours + tape</option>
                  </select>
                  <button type="submit" style={secondaryButtonStyle}>Add preset</button>
                </form>
              </section>

              <section id="setup-step-components" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="2" title="Components">
                  Add the materials and labour that sit behind the product. Choose a common component first, then only fill what needs changing.
                </StepHeading>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.components.length === 0 ? (
                    <EmptyState>No components yet. Add a quick preset or create one simple component below.</EmptyState>
                  ) : (
                    editorDefinition.components.map((component, index) => {
                      const material = component.materialId ? materialMap.get(component.materialId) : null;
                      const supplier = component.supplierId ? supplierMap.get(component.supplierId) : null;
                      const usage = component.stockUsage ?? {};
                      return (
                        <article key={component.id ?? `${component.label}-${index}`} style={{ ...compactCardStyle, display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div>
                              <strong style={{ fontSize: 16 }}>{component.label}</strong>
                              <div style={{ marginTop: 4, ...mutedTextStyle }}>{rulePlainEnglish(component)}</div>
                            </div>
                            <span style={pillStyle}>{component.kind ?? "material"}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>Consumes</div>
                              <div style={mutedTextStyle}>{material?.name ?? "No material linked yet"}</div>
                            </div>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>Supplier</div>
                              <div style={mutedTextStyle}>{supplier?.displayName ?? "Material default / none"}</div>
                            </div>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>Allocation hint</div>
                              <div style={mutedTextStyle}>{usage.partsPerSheet ? `${usage.partsPerSheet} parts/sheet` : usage.metresPerUnit ? `${usage.metresPerUnit} lm/unit` : usage.sheetsPerUnit ? `${usage.sheetsPerUnit} sheets/unit` : usage.dimensionSource ? String(usage.dimensionSource).replace(/_/g, " ") : "Manual"}</div>
                            </div>
                          </div>
                          {component.notes ? <div style={mutedTextStyle}>{component.notes}</div> : null}
                        </article>
                      );
                    })
                  )}
                </div>

                <details open style={{ ...softCardStyle }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add simple component</summary>
                  <form action={addProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />

                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Common component</span>
                        <select name="componentPreset" defaultValue="sheet_substrate" style={inputStyle}>
                          <option value="sheet_substrate">Sheet substrate / board</option>
                          <option value="print_area">Print / ink area</option>
                          <option value="roll_media">Roll media meterage</option>
                          <option value="laminate">Laminate / cello coverage</option>
                          <option value="eyelets">Eyelets / fixings</option>
                          <option value="paper_stock">Paper / card sheet yield</option>
                          <option value="binding">Binding / tape / book consumable</option>
                          <option value="labour_time">Labour time</option>
                          <option value="custom">Custom component</option>
                        </select>
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Link material</span>
                        <select name="materialId" defaultValue="" style={inputStyle}>
                          <option value="">No material selected</option>
                          {materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                        </select>
                      </label>
                    </div>

                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Label override</span>
                        <input name="label" placeholder="Leave blank to use preset label" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>How it calculates</span>
                        <select name="ruleType" defaultValue="" style={inputStyle}>
                          <option value="">Use preset default</option>
                          <option value="fixed">Fixed qty</option>
                          <option value="per_unit">Per unit sold</option>
                          <option value="per_sqm">Per square metre</option>
                          <option value="per_linear_metre">Per linear metre</option>
                          <option value="per_sheet">Per parent sheet</option>
                          <option value="yield_based">Yield / parts per sheet</option>
                          <option value="selected_by_option">Only when option selected</option>
                        </select>
                      </label>
                    </div>

                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Only applies when option key</span>
                        <input name="triggerOptionKey" placeholder="laminate / cello / eyelets / binding_type" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Option values</span>
                        <input name="triggerOptionValuesCsv" placeholder="matte_laminate,gloss_laminate,yes" style={inputStyle} />
                      </label>
                    </div>

                    <details style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Advanced usage details</summary>
                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Kind</span>
                            <select name="componentKind" defaultValue="" style={inputStyle}>
                              <option value="">Use preset</option>
                              <option value="material">Material / stock</option>
                              <option value="labour">Labour</option>
                              <option value="machine">Machine time</option>
                              <option value="finishing">Finishing</option>
                            </select>
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Quantity / factor</span>
                            <input name="quantity" placeholder="Use preset" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Unit</span>
                            <input name="unit" placeholder="sheet, lm, sqm, min" style={inputStyle} />
                          </label>
                        </div>

                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Dimension source</span>
                            <select name="dimensionSource" defaultValue="" style={inputStyle}>
                              <option value="">Use preset</option>
                              <option value="finished_size">Finished size option</option>
                              <option value="manual">Manual dimensions below</option>
                              <option value="material_size">Material parent size</option>
                              <option value="quantity_only">Quantity only</option>
                            </select>
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Usage option key</span>
                            <input name="usageOptionKey" placeholder="finished_size / page_count / copy_set" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Waste %</span>
                            <input name="wastePercent" placeholder="Use preset" style={inputStyle} />
                          </label>
                        </div>

                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Width mm</span>
                            <input name="widthMm" placeholder="Manual width" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Height / length mm</span>
                            <input name="heightMm" placeholder="Manual height or length" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Roll width mm</span>
                            <input name="rollWidthMm" placeholder="1370" style={inputStyle} />
                          </label>
                        </div>

                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Parts per sheet</span>
                            <input name="partsPerSheet" placeholder="For yield rules" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Metres per unit</span>
                            <input name="metresPerUnit" placeholder="For rolls/cello/tape" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Sheets per unit</span>
                            <input name="sheetsPerUnit" placeholder="For paper/card" style={inputStyle} />
                          </label>
                        </div>

                        <div style={gridTwoStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Supplier override</span>
                            <select name="supplierId" defaultValue="" style={inputStyle}>
                              <option value="">Use material supplier / none</option>
                              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}
                            </select>
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Labour label</span>
                            <input name="labourRateName" placeholder="Print labour / bindery / install" style={inputStyle} />
                          </label>
                        </div>
                      </div>
                    </details>

                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Notes</span>
                      <textarea name="notes" rows={3} placeholder="Optional notes about yield, allocation, meterage or labour assumptions." style={textareaStyle} />
                    </label>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <p style={{ margin: 0, ...mutedTextStyle }}>Leave blank fields empty and the selected common component will apply sensible defaults.</p>
                      <button type="submit" style={buttonStyle}>Add component</button>
                    </div>
                  </form>
                </details>
              </section>

              <section id="setup-step-options" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="3" title="Options">
                  Add the quote choices customers or staff pick. Presets create the right key, field type and default values automatically.
                </StepHeading>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.fields.length === 0 ? (
                    <EmptyState>No options yet. Add a quick preset or create one option below.</EmptyState>
                  ) : (
                    editorDefinition.fields.map((field, index) => (
                      <article key={field.id ?? `${field.key}-${index}`} style={{ ...compactCardStyle, display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div>
                            <strong style={{ fontSize: 16 }}>{field.label}</strong>
                            <div style={{ marginTop: 4, ...mutedTextStyle }}>Key: {field.key} · Required: {field.required ? "Yes" : "No"}{field.defaultValue ? ` · Default: ${field.defaultValue}` : ""}</div>
                          </div>
                          <span style={pillStyle}>{labelForFieldType(field.type)}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                          <div style={softCardStyle}>
                            <div style={labelTextStyle}>Choices</div>
                            <div style={mutedTextStyle}>{choiceLabels(field)}</div>
                          </div>
                          <div style={softCardStyle}>
                            <div style={labelTextStyle}>Rule effect</div>
                            <div style={mutedTextStyle}>{optionPlainEnglish(field)}</div>
                          </div>
                        </div>
                        {field.helpText ? <div style={mutedTextStyle}>{field.helpText}</div> : null}
                      </article>
                    ))
                  )}
                </div>

                <details open style={{ ...softCardStyle }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add simple option</summary>
                  <form action={addProductOptionAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Option preset</span>
                        <select name="optionPreset" defaultValue="finished_size" style={inputStyle}>
                          <option value="finished_size">Finished size</option>
                          <option value="sides">Sides</option>
                          <option value="laminate">Laminate</option>
                          <option value="cello">Celloglaze</option>
                          <option value="binding_type">Binding type</option>
                          <option value="copy_set">Duplicate / triplicate</option>
                          <option value="copy_colours">Copy colours</option>
                          <option value="cover_colour">Cover colour</option>
                          <option value="tape_colour">Tape colour</option>
                          <option value="quantity">Quantity</option>
                          <option value="page_count">Page count</option>
                          <option value="material_choice">Material choice</option>
                          <option value="custom">Custom option</option>
                        </select>
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Label override</span>
                        <input name="label" placeholder="Leave blank to use preset label" style={inputStyle} />
                      </label>
                    </div>

                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Custom key</span>
                        <input name="key" placeholder="Leave blank to use preset key" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Choices</span>
                        <input name="optionsCsv" placeholder="Optional override: 600x900,450x600 or Matte=matte" style={inputStyle} />
                      </label>
                    </div>

                    <details style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Advanced option rule</summary>
                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Field type</span>
                            <select name="fieldType" defaultValue="" style={inputStyle}>
                              <option value="">Use preset</option>
                              <option value="select">Select list</option>
                              <option value="size_select">Size select</option>
                              <option value="yes_no">Yes / No</option>
                              <option value="quantity">Quantity</option>
                              <option value="number">Number</option>
                              <option value="text">Text</option>
                              <option value="color">Colour</option>
                              <option value="binding">Binding type</option>
                            </select>
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Required</span>
                            <select name="required" defaultValue="yes" style={inputStyle}>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Default value</span>
                            <input name="defaultValue" placeholder="Use preset default" style={inputStyle} />
                          </label>
                        </div>

                        <label style={labelStyle}>
                          <span style={labelTextStyle}>Help text</span>
                          <input name="helpText" placeholder="Shown beside this option during quoting." style={inputStyle} />
                        </label>

                        <div style={gridTwoStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Component link mode</span>
                            <select name="componentLinkMode" defaultValue="none" style={inputStyle}>
                              <option value="none">No direct link yet</option>
                              <option value="multiplies_component">Multiplies component quantity</option>
                              <option value="selects_material">Selects material</option>
                              <option value="toggles_component">Toggles component</option>
                              <option value="sets_meterage">Sets roll/cello/tape meterage</option>
                              <option value="sets_sheet_yield">Sets sheet/card/paper yield</option>
                            </select>
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Applies when values</span>
                            <input name="appliesWhenValuesCsv" placeholder="double_sided,matte_laminate" style={inputStyle} />
                          </label>
                        </div>

                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Effect type</span>
                            <select name="effectType" defaultValue="none" style={inputStyle}>
                              <option value="none">No linked rule yet</option>
                              <option value="set_quantity">Set quantity</option>
                              <option value="multiply_component">Multiply component</option>
                              <option value="toggle_component">Toggle component</option>
                              <option value="switch_material">Switch material</option>
                              <option value="add_labour">Add labour</option>
                              <option value="price_delta">Price delta</option>
                            </select>
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Effect target</span>
                            <input name="effectTarget" placeholder="Print face / laminate coverage" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Effect value / unit</span>
                            <input name="effectValue" placeholder="2 / lm / sheet" style={inputStyle} />
                          </label>
                        </div>
                      </div>
                    </details>
                    <input type="hidden" name="effectUnit" value="" />

                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <p style={{ margin: 0, ...mutedTextStyle }}>For normal fields, choose a preset and click Add. Use advanced only when linking rules directly.</p>
                      <button type="submit" style={buttonStyle}>Add option</button>
                    </div>
                  </form>
                </details>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
