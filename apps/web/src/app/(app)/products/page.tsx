import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";
import { listSuppliersForTenant } from "@/server/suppliers";
import { addProductComponentAction, addProductOptionAction, addStarterRulesAction, createProductAction, updateProductAction } from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type EditorDefinition = {
  components: Array<Record<string, any>>;
  fields: Array<Record<string, any>>;
};

type StarterCard = {
  value: string;
  title: string;
  description: string;
  includes: string;
};

type OptionCard = {
  preset: string;
  title: string;
  description: string;
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

function friendlyFieldType(value: string): string {
  switch (value) {
    case "yes_no":
      return "Yes / no";
    case "select":
      return "Pick one";
    case "size_select":
      return "Size list";
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

function friendlyUsage(component: Record<string, any>): string {
  const usage = component.stockUsage ?? {};
  const ruleType = String(component.ruleType ?? usage.usageBasis ?? "fixed");
  const quantity = component.quantity ?? "1";
  const unit = component.unit ?? "each";
  const trigger = component.trigger ?? {};

  let text = "Uses purchased stock";
  if (ruleType === "per_sheet") text = `Uses ${quantity} ${unit} from purchased sheet stock`;
  if (ruleType === "yield_based") text = `Uses parent sheet yield${usage.partsPerSheet ? ` (${usage.partsPerSheet} up)` : ""}`;
  if (ruleType === "per_linear_metre") text = `Uses ${quantity} ${unit} from a purchased roll`;
  if (ruleType === "per_sqm") text = `Uses ${quantity} ${unit} by area`;
  if (ruleType === "per_unit") text = `Uses ${quantity} ${unit} per quoted unit`;
  if (ruleType === "fixed") text = `Uses fixed ${quantity} ${unit}`;
  if (ruleType === "selected_by_option") text = `Only uses ${quantity} ${unit} when a choice is selected`;

  const source = usage.dimensionSource ? ` · based on ${String(usage.dimensionSource).replace(/_/g, " ")}` : "";
  const triggerText = trigger.optionKey
    ? ` · only when ${trigger.optionKey} is ${trigger.optionValue || (Array.isArray(trigger.optionValues) && trigger.optionValues.length > 0 ? trigger.optionValues.join(", ") : "selected")}`
    : "";

  return `${text}${source}${triggerText}`;
}

function choiceLabels(field: Record<string, any>): string {
  if (!Array.isArray(field.options) || field.options.length === 0) return "Entered during quote";
  return field.options.map((option: any) => option.label ?? option.value).join(", ");
}

function optionSummary(field: Record<string, any>): string {
  const defaultText = field.defaultValue ? `Default: ${field.defaultValue}` : "No default";
  return `${friendlyFieldType(field.type)} · ${defaultText}${field.required ? " · Required" : " · Optional"}`;
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
const labelTextStyle: CSSProperties = { fontWeight: 850, fontSize: 13, color: "#344054" };
const gridTwoStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 };
const gridThreeStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, cursor: "pointer", padding: "0 16px" };
const secondaryButtonStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 900, cursor: "pointer", padding: "0 14px" };
const pillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "5px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const mutedTextStyle: CSSProperties = { color: "#667085", fontSize: 13, lineHeight: 1.5 };
const sectionAnchorStyle: CSSProperties = { scrollMarginTop: 24 };

const starterCards: StarterCard[] = [
  {
    value: "rigid_signage",
    title: "Sheet sign / board sign",
    description: "ACM, corflute, foamboard, acrylic or similar sheet stock.",
    includes: "Size, front/back, laminate, eyelets, parent sheet, print area"
  },
  {
    value: "roll_print",
    title: "Roll print / vinyl / banner",
    description: "Anything mainly produced from roll media by metres.",
    includes: "Finished size, roll metres, print area, optional laminate"
  },
  {
    value: "cards",
    title: "Business cards / flyers",
    description: "Small format sheet work with front/back and cello choices.",
    includes: "Size, front/back, GSM, cello, quantity, sheet yield"
  },
  {
    value: "books",
    title: "Books / pads",
    description: "Printed books or pads with pages, covers and binding.",
    includes: "Size, pages, cover colour, binding type, quantity"
  },
  {
    value: "carbon_books",
    title: "Duplicate / triplicate books",
    description: "Carbonless books with copy colours, cover, tape and numbering.",
    includes: "Pages, copies, copy colours, cover colour, tape colour, numbering"
  }
];

const optionCards: OptionCard[] = [
  { preset: "finished_size", title: "Size", description: "Finished size such as 600 × 900, A4, A5 or 90 × 55." },
  { preset: "sides", title: "Front / back", description: "Front only or front and back printing." },
  { preset: "laminate", title: "Laminate", description: "None, matte, gloss, anti-graffiti or whiteboard laminate." },
  { preset: "cello", title: "Celloglaze", description: "None, matte cello or gloss cello for small format." },
  { preset: "page_count", title: "Pages", description: "Pages per book, pad or carbon book." },
  { preset: "copy_set", title: "Copies", description: "Duplicate, triplicate or quadruplicate carbon sets." },
  { preset: "copy_colours", title: "Copy colours", description: "Carbonless paper colours such as white/yellow/pink." },
  { preset: "cover_colour", title: "Cover colour", description: "Cover stock colour for books and pads." },
  { preset: "tape_colour", title: "Tape colour", description: "Binding tape colour for carbon books and pads." },
  { preset: "binding_type", title: "Binding", description: "Saddle stitch, wire bind, perfect bind, pad binding or tape." },
  { preset: "quantity", title: "Quantity", description: "Quoted quantity used by stock calculations." }
];

function StepHeading({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ width: 34, height: 34, borderRadius: 999, background: "#111827", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flex: "0 0 auto" }}>{number}</span>
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

function StarterButton({ productId, card }: { productId: string; card: StarterCard }) {
  return (
    <form action={addStarterRulesAction} style={{ minWidth: 0 }}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="starterType" value={card.value} />
      <button type="submit" style={{ ...compactCardStyle, textAlign: "left", width: "100%", cursor: "pointer", minHeight: 160 }}>
        <strong style={{ display: "block", fontSize: 17 }}>{card.title}</strong>
        <span style={{ display: "block", marginTop: 8, color: "#475467", lineHeight: 1.45 }}>{card.description}</span>
        <span style={{ display: "block", marginTop: 12, color: "#667085", fontSize: 12, lineHeight: 1.45 }}>{card.includes}</span>
      </button>
    </form>
  );
}

function OptionButton({ productId, option }: { productId: string; option: OptionCard }) {
  return (
    <form action={addProductOptionAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="optionPreset" value={option.preset} />
      <button type="submit" style={{ ...compactCardStyle, textAlign: "left", width: "100%", cursor: "pointer", minHeight: 118 }}>
        <strong style={{ display: "block", fontSize: 15 }}>{option.title}</strong>
        <span style={{ display: "block", marginTop: 8, color: "#667085", fontSize: 13, lineHeight: 1.45 }}>{option.description}</span>
      </button>
    </form>
  );
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

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 16, minWidth: 0 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16, fontWeight: 850 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16, fontWeight: 850 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
            <h1 style={{ margin: "10px 0 8px", fontSize: 34 }}>Products</h1>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 930 }}>
              Products are the sellable items on quotes. Each product is built from purchased materials, plus simple customer choices such as size, front/back, cello, laminate, pages, copies, cover colour, tape colour and numbering.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={pillStyle}>{products.length} products</span>
            <span style={pillStyle}>{activeMaterials.length} active materials</span>
            <span style={pillStyle}>GST locked</span>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 350px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 16 }}>
          <details open style={{ ...cardStyle }}>
            <summary style={{ cursor: "pointer", fontSize: 20, fontWeight: 900 }}>Create product</summary>
            <form action={createProductAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product name</span>
                <input name="name" required placeholder="Business cards / 5mm corflute sign" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>SKU</span>
                <input name="sku" placeholder="Optional" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Type</span>
                <select name="productFamily" defaultValue="rigid_signage" style={inputStyle}>
                  <option value="rigid_signage">Sheet sign / board sign</option>
                  <option value="roll_media">Roll print / vinyl / banner</option>
                  <option value="small_format_print">Business cards / flyers</option>
                  <option value="display_products">Books / pads / carbon books</option>
                  <option value="installation">Installation / labour</option>
                  <option value="general">General product</option>
                </select>
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
              <input type="hidden" name="status" value="draft" />
              <button type="submit" style={buttonStyle}>Create product</button>
              <p style={{ margin: 0, ...mutedTextStyle }}>Tax code is saved as GST automatically.</p>
            </form>
          </details>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>Open product</h2>
              <p style={{ margin: "6px 0 0", color: "#475467", fontSize: 14 }}>Search and continue setup.</p>
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
                    <div style={{ marginTop: 5, fontSize: 12, color: "#667085" }}>{product.templateName ? "materials/options started" : "needs setup"}</div>
                  </a>
                );
              })}
            </div>
          </section>
        </aside>

        <main style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {!selectedProduct ? (
            <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Select or create a product</h2>
              <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
                The setup page is now designed around plain production language: choose a starting product type, add the materials it uses, then add the customer choices staff need when quoting.
              </p>
            </section>
          ) : (
            <>
              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Selected product</p>
                    <h2 style={{ margin: "8px 0 0", fontSize: 30 }}>{selectedProduct.name}</h2>
                    <p style={{ margin: "6px 0 0", color: "#667085" }}>{selectedProduct.sku || "No SKU"} · {formatFamily(selectedProduct.productFamily)} · GST</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={pillStyle}>{editorDefinition.components.length} materials / labour rows</span>
                    <span style={pillStyle}>{editorDefinition.fields.length} customer choices</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <a href="#product-details" style={{ ...softCardStyle, textDecoration: "none", color: "#111827" }}><strong>1. Product details</strong><br /><span style={mutedTextStyle}>Name, SKU, family and status.</span></a>
                  <a href="#product-materials" style={{ ...softCardStyle, textDecoration: "none", color: "#111827" }}><strong>2. Materials used</strong><br /><span style={mutedTextStyle}>Full sheets, part sheets, roll metres, each items and labour.</span></a>
                  <a href="#product-options" style={{ ...softCardStyle, textDecoration: "none", color: "#111827" }}><strong>3. Customer choices</strong><br /><span style={mutedTextStyle}>Size, front/back, cello, pages, copies, colours and numbering.</span></a>
                </div>
              </section>

              <section id="product-details" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="1" title="Product details">
                  Keep this section simple. This is the sellable item staff select when quoting. The material and option setup happens below.
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
                      <span style={labelTextStyle}>Product type</span>
                      <select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}>
                        <option value="rigid_signage">Sheet sign / board sign</option>
                        <option value="roll_media">Roll print / vinyl / banner</option>
                        <option value="banners">Banners</option>
                        <option value="stickers_labels">Stickers / labels</option>
                        <option value="window_wall_graphics">Window / wall graphics</option>
                        <option value="vehicle_graphics">Vehicle graphics</option>
                        <option value="display_products">Books / pads / display products</option>
                        <option value="small_format_print">Business cards / flyers</option>
                        <option value="general">General product</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <p style={{ margin: 0, ...mutedTextStyle }}>GST is locked behind the scenes and not shown during product creation.</p>
                    <button type="submit" style={buttonStyle}>Save details</button>
                  </div>
                </form>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <StepHeading number="Start" title="Choose a product starting point">
                  This lays down a plain-English setup for staff. It adds common customer choices and starter material rows. You can still add or remove materials afterwards.
                </StepHeading>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {starterCards.map((card) => <StarterButton key={card.value} productId={selectedProduct.id} card={card} />)}
                </div>
              </section>

              <section id="product-materials" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="2" title="Materials used">
                  Every product should be made from one or more purchased materials. A material can be a whole sheet, part of a sheet, metres from a roll, area coverage, each items, or labour/machine time.
                </StepHeading>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.components.length === 0 ? (
                    <EmptyState>No materials added yet. Pick a starting point above or add the first material below.</EmptyState>
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
                              <div style={{ marginTop: 4, ...mutedTextStyle }}>{friendlyUsage(component)}</div>
                            </div>
                            <span style={pillStyle}>{component.kind === "labour" ? "Labour" : component.kind === "machine" ? "Machine" : "Material"}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>Purchased material</div>
                              <div style={mutedTextStyle}>{material?.name ?? "Not linked yet"}</div>
                            </div>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>Supplier</div>
                              <div style={mutedTextStyle}>{supplier?.displayName ?? "Uses material default / none"}</div>
                            </div>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>Stock allocation</div>
                              <div style={mutedTextStyle}>
                                {usage.partsPerSheet ? `${usage.partsPerSheet} per parent sheet` : usage.metresPerUnit ? `${usage.metresPerUnit} lm each` : usage.sheetsPerUnit ? `${usage.sheetsPerUnit} sheets each` : usage.dimensionSource ? String(usage.dimensionSource).replace(/_/g, " ") : "Manual"}
                              </div>
                            </div>
                          </div>
                          {component.notes ? <div style={mutedTextStyle}>{component.notes}</div> : null}
                        </article>
                      );
                    })
                  )}
                </div>

                <details open style={{ ...softCardStyle }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add material / labour row</summary>
                  <form action={addProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />

                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Purchased material</span>
                        <select name="materialId" defaultValue="" style={inputStyle}>
                          <option value="">Choose material later</option>
                          {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                        </select>
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>How is it used?</span>
                        <select name="componentPreset" defaultValue="part_sheet_material" style={inputStyle}>
                          <option value="full_sheet_material">Whole sheet / board per item</option>
                          <option value="part_sheet_material">Part sheet / nested from parent sheet</option>
                          <option value="roll_metres_material">Metres from a roll</option>
                          <option value="area_coverage_material">Area coverage: ink / laminate / cello</option>
                          <option value="paper_stock">Paper / card parent sheet yield</option>
                          <option value="each_material">Each item: eyelets / screws / boxes / staples</option>
                          <option value="binding">Binding / tape / book consumable</option>
                          <option value="labour_time">Labour or machine time</option>
                          <option value="custom">Custom material rule</option>
                        </select>
                      </label>
                    </div>

                    <div style={gridThreeStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Friendly name</span>
                        <input name="label" placeholder="eg 5mm ACM sheet, matte cello, yellow copy paper" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Quantity / factor</span>
                        <input name="quantity" placeholder="Leave blank for default" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Waste %</span>
                        <input name="wastePercent" placeholder="Leave blank for default" style={inputStyle} />
                      </label>
                    </div>

                    <details style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Only fill these when needed</summary>
                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Parts per parent sheet</span>
                            <input name="partsPerSheet" placeholder="eg 8 business cards up" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Metres per unit</span>
                            <input name="metresPerUnit" placeholder="eg 0.35" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Sheets per unit</span>
                            <input name="sheetsPerUnit" placeholder="eg 2" style={inputStyle} />
                          </label>
                        </div>
                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Manual width mm</span>
                            <input name="widthMm" placeholder="Optional" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Manual height / length mm</span>
                            <input name="heightMm" placeholder="Optional" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Roll width mm</span>
                            <input name="rollWidthMm" placeholder="eg 1370" style={inputStyle} />
                          </label>
                        </div>
                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Based on choice</span>
                            <input name="usageOptionKey" placeholder="finished_size / page_count / quantity" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Only when choice is</span>
                            <input name="triggerOptionKey" placeholder="cello / laminate / copy_set / tape_colour" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Choice values</span>
                            <input name="triggerOptionValuesCsv" placeholder="matte_cello,triplicate,black" style={inputStyle} />
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
                            <input name="labourRateName" placeholder="Print, bindery, install, finishing" style={inputStyle} />
                          </label>
                        </div>
                      </div>
                    </details>

                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Notes for staff</span>
                      <textarea name="notes" rows={3} placeholder="Example: this is a part sheet from 2440 × 1220 ACM, allow 10% waste." style={textareaStyle} />
                    </label>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <p style={{ margin: 0, ...mutedTextStyle }}>Normal staff should only need the material, how it is used, and maybe a friendly name.</p>
                      <button type="submit" style={buttonStyle}>Add material row</button>
                    </div>
                  </form>
                </details>
              </section>

              <section id="product-options" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="3" title="Customer choices">
                  These are the choices staff pick while quoting. Most choices either change which material is used, how much material is used, or whether a material row is active.
                </StepHeading>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.fields.length === 0 ? (
                    <EmptyState>No customer choices yet. Add a product starting point or click the common choices below.</EmptyState>
                  ) : (
                    editorDefinition.fields.map((field, index) => (
                      <article key={field.id ?? `${field.key}-${index}`} style={{ ...compactCardStyle, display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div>
                            <strong style={{ fontSize: 16 }}>{field.label}</strong>
                            <div style={{ marginTop: 4, ...mutedTextStyle }}>{optionSummary(field)}</div>
                          </div>
                          <span style={pillStyle}>{field.key}</span>
                        </div>
                        <div style={softCardStyle}>
                          <div style={labelTextStyle}>Available choices</div>
                          <div style={mutedTextStyle}>{choiceLabels(field)}</div>
                        </div>
                        {field.helpText ? <div style={mutedTextStyle}>{field.helpText}</div> : null}
                      </article>
                    ))
                  )}
                </div>

                <section style={{ display: "grid", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18 }}>Add common choice</h3>
                    <p style={{ margin: "6px 0 0", ...mutedTextStyle }}>Click the choices this product needs. Use the product starting point above when you want a full set.</p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {optionCards.map((option) => <OptionButton key={option.preset} productId={selectedProduct.id} option={option} />)}
                  </div>
                </section>

                <details style={{ ...softCardStyle }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add a custom choice</summary>
                  <form action={addProductOptionAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />
                    <input type="hidden" name="optionPreset" value="custom" />
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Choice name</span>
                        <input name="label" required placeholder="eg Numbering, rounded corners, install method" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Choice key</span>
                        <input name="key" placeholder="Auto-created if blank" style={inputStyle} />
                      </label>
                    </div>
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Choice type</span>
                        <select name="fieldType" defaultValue="select" style={inputStyle}>
                          <option value="select">Pick one from list</option>
                          <option value="yes_no">Yes / no</option>
                          <option value="size_select">Size list</option>
                          <option value="quantity">Quantity</option>
                          <option value="number">Number</option>
                          <option value="text">Text</option>
                          <option value="color">Colour</option>
                        </select>
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Choices</span>
                        <input name="optionsCsv" placeholder="Yes=yes,No=no or Matte=matte,Gloss=gloss" style={inputStyle} />
                      </label>
                    </div>
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Default value</span>
                        <input name="defaultValue" placeholder="Optional" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Required?</span>
                        <select name="required" defaultValue="yes" style={inputStyle}>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                    </div>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Help text</span>
                      <input name="helpText" placeholder="Shown to staff when quoting" style={inputStyle} />
                    </label>
                    <button type="submit" style={buttonStyle}>Add custom choice</button>
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
