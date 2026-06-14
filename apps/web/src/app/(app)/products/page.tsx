import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";
import {
  addProductComponentAction,
  addProductOptionAction,
  applyQuoteBehaviourPresetAction,
  createProductAction,
  deleteProductComponentAction,
  deleteProductOptionAction,
  moveProductOptionAction,
  updateProductAction,
  updateProductComponentAction,
  updateProductOptionAction
} from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type Choice = {
  label?: string | null;
  value?: string | null;
};

type StarterType = {
  value: string;
  label: string;
  description: string;
  defaultUsage: string;
};

const starterTypes: StarterType[] = [
  { value: "sign_acm", label: "Sign - ACM / sheet", description: "Rigid sign with size, print type, laminate and finishing options.", defaultUsage: "part_sheet" },
  { value: "sign_corflute", label: "Sign - Corflute", description: "Corflute style rigid sign with common print and finishing options.", defaultUsage: "part_sheet" },
  { value: "sign_acrylic", label: "Sign - Acrylic / PVC", description: "Rigid product where the quoted size consumes sheet stock.", defaultUsage: "part_sheet" },
  { value: "banner", label: "Banner", description: "Roll stock banner with size, hem, eyelet and finishing choices.", defaultUsage: "roll_metres" },
  { value: "roll_print", label: "Roll print / sticker", description: "Roll media print with media, laminate and quantity choices.", defaultUsage: "area" },
  { value: "business_cards", label: "Business cards", description: "Small format card product with sides, cello/GSM and quantity.", defaultUsage: "paper_yield" },
  { value: "flyers", label: "Brochures / flyers", description: "Small format print with sides, folds, cello/GSM and quantity.", defaultUsage: "paper_yield" },
  { value: "books", label: "Books / pads", description: "Pads/books with page count, cover and binding choices.", defaultUsage: "paper_yield" },
  { value: "carbon_books", label: "Duplicate / triplicate books", description: "Carbonless books with copies, colours, tape and numbering.", defaultUsage: "paper_yield" }
];

const usageModes = [
  { value: "part_sheet", label: "Part sheet", help: "Finished size allocates part of a parent sheet." },
  { value: "whole_sheet", label: "Whole sheet", help: "One or more full sheets are consumed." },
  { value: "roll_metres", label: "Linear metres", help: "Finished size consumes length from a roll." },
  { value: "area", label: "Square metres", help: "Finished size consumes area." },
  { value: "paper_yield", label: "Paper/card yield", help: "Finished size and quantity drive sheet yield." },
  { value: "each", label: "Each", help: "Fixed item, labour step or consumable per quantity." }
];

const optionTypes = [
  { value: "select", label: "Select list" },
  { value: "size_select", label: "Size list" },
  { value: "yes_no", label: "Yes / No" },
  { value: "quantity", label: "Quantity" },
  { value: "number", label: "Number" },
  { value: "text", label: "Text" },
  { value: "color", label: "Colour" }
];

const productFamilies = [
  { value: "rigid_signage", label: "Rigid signage" },
  { value: "roll_media", label: "Roll media" },
  { value: "banners", label: "Banners" },
  { value: "stickers_labels", label: "Stickers & labels" },
  { value: "small_format_print", label: "Small format print" },
  { value: "display_products", label: "Display products" }
];

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function matchesQuery(value: string | null | undefined, query: string): boolean {
  return String(value ?? "").toLowerCase().includes(query.toLowerCase());
}

function humanize(value: string | null | undefined): string {
  if (!value) return "Not set";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2");
}

function selectedProductUrl(productId: string, query: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  return `/products?selected=${productId}${q}`;
}

function editProductUrl(productId: string, query: string, kind: "component" | "option", id: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  const param = kind === "component" ? "editComponent" : "editOption";
  return `/products?selected=${productId}${q}&${param}=${id}`;
}

function baseUsageFromComponent(component: any): string {
  const ruleType = String(component?.ruleType ?? component?.stockUsage?.usageBasis ?? "yield_based");
  const role = String(component?.role ?? "");
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_sqm") return "area";
  if (ruleType === "per_unit" && String(component?.unit ?? "") === "sheet") return "whole_sheet";
  if (ruleType === "per_unit") return "each";
  if (ruleType === "yield_based" && role !== "base_material") return "paper_yield";
  return "part_sheet";
}

function defaultAnswerFromField(field: any): string {
  const defaultValue = String(field?.defaultValue ?? "");
  if (!defaultValue) return "";
  const matched = Array.isArray(field?.options)
    ? field.options.find((option: Choice) => String(option?.value ?? "") === defaultValue)
    : null;
  return String(matched?.label ?? defaultValue).replace(/_/g, " ");
}

function otherChoicesCsvFromField(field: any): string {
  if (!Array.isArray(field?.options) || field.options.length === 0) return "";
  const defaultValue = String(field?.defaultValue ?? "");
  return field.options
    .filter((option: Choice) => String(option?.value ?? "") !== defaultValue)
    .map((option: Choice) => String(option?.label ?? option?.value ?? ""))
    .join(", ");
}

function showWhenOptionKeyFromField(field: any): string {
  return String(field?.showWhen?.optionKey ?? "");
}

function showWhenValuesCsvFromField(field: any): string {
  return Array.isArray(field?.showWhen?.optionValues) ? field.showWhen.optionValues.join(", ") : "";
}

function optionChoicesSummary(field: any): string {
  if (!Array.isArray(field?.options) || field.options.length === 0) return "No choice list";
  return field.options.map((option: Choice) => String(option.label ?? option.value ?? "")).filter(Boolean).join(", ");
}

function conditionSummary(component: any, fields: any[]): string {
  const optionKey = String(component?.trigger?.optionKey ?? component?.stockUsage?.optionKey ?? "");
  const values = Array.isArray(component?.trigger?.optionValues)
    ? component.trigger.optionValues
    : Array.isArray(component?.stockUsage?.optionValues)
      ? component.stockUsage.optionValues
      : [];

  if (!optionKey || ["finished_size", "quantity"].includes(optionKey)) return "Always used";

  const field = fields.find((item) => String(item?.key ?? "") === optionKey);
  const fieldLabel = field?.label ?? optionKey;
  return values.length > 0 ? `Used when ${fieldLabel}: ${values.join(", ")}` : `Used when ${fieldLabel} is selected`;
}

function materialDetails(material: any): string {
  const pieces = [humanize(material.materialType), material.sku ? `SKU ${material.sku}` : null];
  if (material.widthMm || material.lengthMm) pieces.push(`${material.widthMm ?? "?"} × ${material.lengthMm ?? "?"} mm`);
  if (material.rollWidthMm) pieces.push(`${material.rollWidthMm} mm roll`);
  return pieces.filter(Boolean).join(" · ");
}

function stepState(done: boolean): string {
  return done ? "Ready" : "Needs setup";
}

const pageStyle: CSSProperties = { maxWidth: 1280, margin: "0 auto", display: "grid", gap: 16, paddingBottom: 32 };
const cardStyle: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20, boxShadow: "0 1px 2px rgba(16,24,40,0.05)" };
const softCardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 18, padding: 16, background: "#fcfcfd", display: "grid", gap: 10 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 92, padding: 12 };
const labelStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 800, fontSize: 13, color: "#344054" };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 };
const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, padding: "0 16px", cursor: "pointer" };
const ghostStyle: CSSProperties = { minHeight: 40, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, padding: "0 14px", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const dangerGhostStyle: CSSProperties = { ...ghostStyle, color: "#b42318", borderColor: "#fda29b" };
const chipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "6px 10px", fontSize: 12, fontWeight: 900, width: "fit-content" };
const successChipStyle: CSSProperties = { ...chipStyle, background: "#ecfdf3", color: "#067647" };
const warningChipStyle: CSSProperties = { ...chipStyle, background: "#fffaeb", color: "#b54708" };
const sectionHeadingStyle: CSSProperties = { margin: 0, fontSize: 22 };
const mutedStyle: CSSProperties = { margin: 0, color: "#667085", lineHeight: 1.5 };
const tinyLabelStyle: CSSProperties = { margin: 0, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4f46e5" };

function MessageBanner({ tone, children }: { tone: "success" | "error"; children: string }) {
  const success = tone === "success";
  return (
    <section
      style={{
        border: `1px solid ${success ? "#abefc6" : "#fda29b"}`,
        background: success ? "#ecfdf3" : "#fff5f4",
        color: success ? "#067647" : "#b42318",
        borderRadius: 16,
        padding: 14,
        fontWeight: 800
      }}
    >
      {children}
    </section>
  );
}

function GuideStep(props: { number: number; title: string; description: string; done: boolean; detail: string }) {
  return (
    <div style={{ ...softCardStyle, background: props.done ? "#f6fef9" : "#fffcf5", borderColor: props.done ? "#abefc6" : "#fedf89" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <span style={{ ...chipStyle, background: props.done ? "#dcfae6" : "#fef0c7", color: props.done ? "#067647" : "#b54708" }}>Step {props.number}</span>
        <span style={props.done ? successChipStyle : warningChipStyle}>{stepState(props.done)}</span>
      </div>
      <strong>{props.title}</strong>
      <p style={mutedStyle}>{props.description}</p>
      <div style={{ color: "#475467", fontWeight: 800 }}>{props.detail}</div>
    </div>
  );
}

function PresetForm(props: { productId: string; activeMaterials: any[] }) {
  return (
    <form action={applyQuoteBehaviourPresetAction} style={{ ...softCardStyle, background: "#f8fafc" }}>
      <input type="hidden" name="productId" value={props.productId} />
      <div>
        <h3 style={{ margin: 0, fontSize: 18 }}>Optional: add a common option pack</h3>
        <p style={{ ...mutedStyle, marginTop: 4 }}>
          This only adds starter rows. It does not lock anything; every option and component can be edited or removed below.
        </p>
      </div>
      <div style={grid3}>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Product type</span>
          <select name="starterType" defaultValue="sign_acm" style={inputStyle}>
            {starterTypes.map((starter) => (
              <option key={starter.value} value={starter.value}>{starter.label}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Main material</span>
          <select name="baseMaterialId" defaultValue="" style={inputStyle}>
            <option value="">Do not add a base material yet</option>
            {props.activeMaterials.map((material) => (
              <option key={material.id} value={material.id}>{material.name}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Stock usage</span>
          <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
            {usageModes.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" style={ghostStyle}>Add starter rows</button>
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
  const editComponentId = readParam(params, "editComponent");
  const editOptionId = readParam(params, "editOption");

  const [products, materials, selectedProduct] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    selectedId ? getProductById(activeTenant.tenantId, selectedId) : Promise.resolve(null)
  ]);

  const filteredProducts = query
    ? products.filter((product) => matchesQuery(product.name, query) || matchesQuery(product.sku, query) || matchesQuery(product.productFamily, query))
    : products;

  const editorTemplate = selectedProduct?.defaultTemplateId
    ? await getConfiguratorTemplateById(activeTenant.tenantId, selectedProduct.defaultTemplateId)
    : null;

  const definition = (editorTemplate?.definitionJson ?? {}) as Record<string, any>;
  const fields = Array.isArray(definition.fields) ? definition.fields : [];
  const components = Array.isArray(definition.components) ? definition.components : [];
  const activeMaterials = materials.filter((material) => material.active);

  return (
    <div style={pageStyle}>
      {message ? <MessageBanner tone="success">{message}</MessageBanner> : null}
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p style={tinyLabelStyle}>Guided catalogue setup</p>
            <h1 style={{ margin: "8px 0 6px", fontSize: 34 }}>Products</h1>
            <p style={{ ...mutedStyle, maxWidth: 820 }}>
              Build each sellable product in one place: first the product name, then the materials/components it uses, then the quote choices staff pick later. Product setup is not quoting.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={chipStyle}>{products.length} products</span>
            <span style={chipStyle}>{activeMaterials.length} active materials</span>
            <span style={chipStyle}>GST default hidden</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
          <GuideStep number={1} title="Base product" description="What are we selling? Example: Sign - ACM - 3mm." done={Boolean(selectedProduct)} detail={selectedProduct ? selectedProduct.name : "Create or open a product"} />
          <GuideStep number={2} title="Components" description="What does it use? Sheet, roll, laminate, hardware or labour." done={components.length > 0} detail={`${components.length} component${components.length === 1 ? "" : "s"}`} />
          <GuideStep number={3} title="Quote options" description="What choices will staff make later on a quote? Size, print type, laminate, finishing, quantity." done={fields.length > 0} detail={`${fields.length} option${fields.length === 1 ? "" : "s"}`} />
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.95fr) minmax(320px, 1.05fr)", gap: 16, alignItems: "start" }}>
        <form action={createProductAction} style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div>
            <h2 style={sectionHeadingStyle}>Create product</h2>
            <p style={{ ...mutedStyle, marginTop: 6 }}>Keep this simple. Pick a product type and main material if you already know it; both can be changed after creation.</p>
          </div>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Product name</span>
            <input name="name" required placeholder="eg Sign - ACM - 3mm" style={inputStyle} />
          </label>

          <div style={grid2}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>SKU / code</span>
              <input name="sku" placeholder="eg SIGN-ACM-3MM" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Product type</span>
              <select name="starterType" defaultValue="sign_acm" style={inputStyle}>
                {starterTypes.map((starter) => (
                  <option key={starter.value} value={starter.value}>{starter.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={grid2}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Main material</span>
              <select name="baseMaterialId" defaultValue="" style={inputStyle}>
                <option value="">Choose later</option>
                {activeMaterials.map((material) => (
                  <option key={material.id} value={material.id}>{material.name}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>How the main material is used</span>
              <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
                {usageModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </label>
          </div>

          <button type="submit" style={buttonStyle}>Create and open product</button>
        </form>

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div>
            <h2 style={sectionHeadingStyle}>Open product</h2>
            <p style={{ ...mutedStyle, marginTop: 6 }}>Find an existing product and continue setup on this same page.</p>
          </div>

          <form method="get" style={{ display: "grid", gap: 10 }}>
            <input name="q" defaultValue={query} placeholder="Search product name, SKU or family" style={inputStyle} />
            <button type="submit" style={ghostStyle}>Search products</button>
          </form>

          {selectedProduct ? (
            <div style={{ ...softCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <strong>{selectedProduct.name}</strong>
                  <div style={mutedStyle}>{selectedProduct.sku || "No SKU"} · {humanize(selectedProduct.department)} · {humanize(selectedProduct.productFamily)}</div>
                </div>
                <span style={successChipStyle}>Open</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={chipStyle}>{components.length} components</span>
                <span style={chipStyle}>{fields.length} quote options</span>
              </div>
            </div>
          ) : (
            <div style={{ ...softCardStyle, background: "#fcfcfd" }}>No product selected yet.</div>
          )}

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>All products ({filteredProducts.length})</summary>
            <div style={{ display: "grid", gap: 10, marginTop: 14, maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
              {filteredProducts.length === 0 ? (
                <div style={{ ...softCardStyle, background: "#fcfcfd" }}>No matching products.</div>
              ) : (
                filteredProducts.map((product) => (
                  <Link key={product.id} href={selectedProductUrl(product.id, query)} style={{ ...softCardStyle, textDecoration: "none", color: "inherit", background: selectedProduct?.id === product.id ? "#eef2ff" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{product.name}</strong>
                      <span style={chipStyle}>{humanize(product.status)}</span>
                    </div>
                    <div style={mutedStyle}>{product.sku || "No SKU"} · {humanize(product.department)} · {humanize(product.productFamily)}</div>
                  </Link>
                ))
              )}
            </div>
          </details>
        </section>
      </section>

      {selectedProduct ? (
        <>
          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <p style={tinyLabelStyle}>Step 1</p>
                <h2 style={sectionHeadingStyle}>Product details</h2>
                <p style={{ ...mutedStyle, marginTop: 6 }}>This is the base product only. Quoting choices are set in Step 3 below.</p>
              </div>
              <span style={chipStyle}>Tax: GST by default</span>
            </div>

            <form action={updateProductAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <input type="hidden" name="defaultTemplateId" value={selectedProduct.defaultTemplateId ?? ""} />
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Product name</span>
                  <input name="name" defaultValue={selectedProduct.name} required style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>SKU / code</span>
                  <input name="sku" defaultValue={selectedProduct.sku ?? ""} style={inputStyle} />
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Department</span>
                  <select name="department" defaultValue={selectedProduct.department} style={inputStyle}>
                    <option value="signage">Signage</option>
                    <option value="small_format">Small format</option>
                    <option value="general">General</option>
                    <option value="installation">Installation</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Product family</span>
                  <select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}>
                    {productFamilies.map((family) => (
                      <option key={family.value} value={family.value}>{family.label}</option>
                    ))}
                  </select>
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
              <button type="submit" style={buttonStyle}>Save product details</button>
            </form>

            <PresetForm productId={selectedProduct.id} activeMaterials={activeMaterials} />
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <p style={tinyLabelStyle}>Step 2</p>
                <h2 style={sectionHeadingStyle}>Components / materials</h2>
                <p style={{ ...mutedStyle, marginTop: 6 }}>Attach the real stock, media, laminate, hardware or labour this product can consume.</p>
              </div>
              <Link href="/materials" style={ghostStyle}>Manage materials</Link>
            </div>

            {activeMaterials.length === 0 ? (
              <div style={{ ...softCardStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
                <strong>No active materials yet</strong>
                <p style={mutedStyle}>Create materials first if you want components to allocate stock. You can still add labour or unlinked component rows now.</p>
              </div>
            ) : null}

            {components.length === 0 ? (
              <div style={{ ...softCardStyle, background: "#fcfcfd" }}>No components yet. Add the base material first, then add optional layers like roll stock, laminate or finishing labour.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {components.map((component: any, index: number) => {
                  const linkedMaterial = component.materialId ? materials.find((m) => m.id === component.materialId) : null;
                  const isEditing = String(component.id ?? "") === String(editComponentId);
                  const currentTriggerKey = String(component.trigger?.optionKey ?? "");
                  const missingTriggerOption = currentTriggerKey && !fields.some((field: any) => String(field.key ?? "") === currentTriggerKey);

                  return (
                    <div key={component.id ?? component.label} style={{ ...softCardStyle, background: isEditing ? "#f8fafc" : "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ display: "grid", gap: 5 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={chipStyle}>#{index + 1}</span>
                            <strong>{component.label ?? "Component"}</strong>
                          </div>
                          <div style={mutedStyle}>
                            {component.kind === "labour" ? "Labour" : "Material"} · {linkedMaterial?.name ?? component.labourRateName ?? "Not linked"}
                          </div>
                          {linkedMaterial ? <div style={mutedStyle}>{materialDetails(linkedMaterial)}</div> : null}
                          <div style={mutedStyle}>
                            {humanize(component.ruleType ?? component.stockUsage?.usageBasis ?? "fixed")} · {component.quantity ? `${component.quantity} ${component.unit ?? ""}`.trim() : (component.unit ?? "—")} · Waste {component.wastePercent ? `${component.wastePercent}%` : "0%"}
                          </div>
                          <div style={mutedStyle}>{conditionSummary(component, fields)}</div>
                          {component.notes ? <div style={mutedStyle}>{component.notes}</div> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link href={editProductUrl(selectedProduct.id, query, "component", String(component.id ?? ""))} style={ghostStyle}>Edit</Link>
                          <form action={deleteProductComponentAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="componentId" value={String(component.id ?? "")} />
                            <button type="submit" style={dangerGhostStyle}>Remove</button>
                          </form>
                        </div>
                      </div>

                      {isEditing ? (
                        <form action={updateProductComponentAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
                          <input type="hidden" name="productId" value={selectedProduct.id} />
                          <input type="hidden" name="componentId" value={String(component.id ?? "")} />
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Component type</span>
                              <select name="kind" defaultValue={component.kind === "labour" ? "labour" : "material"} style={inputStyle}>
                                <option value="material">Material / stock</option>
                                <option value="labour">Labour / process</option>
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Component name</span>
                              <input name="label" defaultValue={component.label ?? ""} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Linked material</span>
                              <select name="materialId" defaultValue={component.materialId ?? ""} style={inputStyle}>
                                <option value="">Not linked</option>
                                {activeMaterials.map((material) => (
                                  <option key={material.id} value={material.id}>{material.name}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Labour/process label</span>
                              <input name="labourRateName" defaultValue={component.labourRateName ?? ""} placeholder="eg Print labour" style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>How calculated</span>
                              <select name="baseUsage" defaultValue={baseUsageFromComponent(component)} style={inputStyle}>
                                {usageModes.map((mode) => (
                                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                                ))}
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Value / quantity</span>
                              <input name="quantity" defaultValue={String(component.quantity ?? "1")} style={inputStyle} />
                            </label>
                          </div>
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Waste %</span>
                              <input name="wastePercent" defaultValue={String(component.wastePercent ?? "10")} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Use this component when</span>
                              <select name="triggerOptionKey" defaultValue={currentTriggerKey} style={inputStyle}>
                                <option value="">Always used</option>
                                {missingTriggerOption ? <option value={currentTriggerKey}>{currentTriggerKey}</option> : null}
                                {fields.map((field: any) => (
                                  <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>
                                ))}
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Matching option values</span>
                              <input name="triggerOptionValuesCsv" defaultValue={Array.isArray(component.trigger?.optionValues) ? component.trigger.optionValues.join(", ") : ""} placeholder="eg gloss_laminate,matt_laminate" style={inputStyle} />
                            </label>
                          </div>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Notes</span>
                            <textarea name="notes" rows={3} defaultValue={String(component.notes ?? "")} style={textareaStyle} />
                          </label>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" style={buttonStyle}>Save component</button>
                            <Link href={selectedProductUrl(selectedProduct.id, query)} style={ghostStyle}>Cancel</Link>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <form action={addProductComponentAction} style={{ ...softCardStyle, background: "#f8fafc" }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Add component</h3>
                <p style={{ ...mutedStyle, marginTop: 4 }}>Add only what this product can actually use. Conditional rows can be tied to quote options like laminate or print type.</p>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Component type</span>
                  <select name="kind" defaultValue="material" style={inputStyle}>
                    <option value="material">Material / stock</option>
                    <option value="labour">Labour / process</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Component name</span>
                  <input name="label" placeholder="eg ACM sheet, gloss laminate, Jingwei cutting" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Linked material</span>
                  <select name="materialId" defaultValue="" style={inputStyle}>
                    <option value="">Not linked</option>
                    {activeMaterials.map((material) => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Labour/process label</span>
                  <input name="labourRateName" placeholder="eg Print labour" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>How calculated</span>
                  <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
                    {usageModes.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Value / quantity</span>
                  <input name="quantity" defaultValue="1" style={inputStyle} />
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Waste %</span>
                  <input name="wastePercent" defaultValue="10" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Use this component when</span>
                  <select name="triggerOptionKey" defaultValue="" style={inputStyle}>
                    <option value="">Always used</option>
                    {fields.map((field: any) => (
                      <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Matching option values</span>
                  <input name="triggerOptionValuesCsv" placeholder="eg gloss_laminate,matt_laminate" style={inputStyle} />
                </label>
              </div>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Notes</span>
                <textarea name="notes" rows={3} placeholder="Explain how this component is used" style={textareaStyle} />
              </label>
              <button type="submit" style={buttonStyle}>Add component</button>
            </form>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <p style={tinyLabelStyle}>Step 3</p>
              <h2 style={sectionHeadingStyle}>Quote options</h2>
              <p style={{ ...mutedStyle, marginTop: 6 }}>These are the choices staff pick later when quoting this product. They are not locked defaults; edit, remove or reorder them here.</p>
            </div>

            {fields.length === 0 ? (
              <div style={{ ...softCardStyle, background: "#fcfcfd" }}>No quote options yet. Add Size first, then print type, media, laminate, finishing and quantity as needed.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {fields.map((field: any, index: number) => {
                  const isEditing = String(field.id ?? "") === String(editOptionId);
                  const currentShowWhenKey = showWhenOptionKeyFromField(field);
                  const missingShowWhenOption = currentShowWhenKey && !fields.some((item: any) => String(item.key ?? "") === currentShowWhenKey);

                  return (
                    <div key={field.id ?? field.key} style={{ ...softCardStyle, background: isEditing ? "#f8fafc" : "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ display: "grid", gap: 5 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={chipStyle}>#{index + 1}</span>
                            <strong>{field.label}</strong>
                            <span style={chipStyle}>{humanize(field.type)}</span>
                          </div>
                          <div style={mutedStyle}>Key: {field.key} · Default: {defaultAnswerFromField(field) || "None"} · {field.required === false ? "Optional" : "Required"}</div>
                          <div style={mutedStyle}>Choices: {optionChoicesSummary(field)}</div>
                          {field.showWhen?.optionKey ? <div style={mutedStyle}>Only shown when {field.showWhen.optionKey}: {showWhenValuesCsvFromField(field) || "any value"}</div> : null}
                          {field.helpText ? <div style={mutedStyle}>{field.helpText}</div> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <form action={moveProductOptionAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                            <input type="hidden" name="direction" value="up" />
                            <button type="submit" style={ghostStyle}>Up</button>
                          </form>
                          <form action={moveProductOptionAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                            <input type="hidden" name="direction" value="down" />
                            <button type="submit" style={ghostStyle}>Down</button>
                          </form>
                          <Link href={editProductUrl(selectedProduct.id, query, "option", String(field.id ?? ""))} style={ghostStyle}>Edit</Link>
                          <form action={deleteProductOptionAction} style={{ display: "grid", gap: 6 }}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#667085" }}>
                              <input type="checkbox" name="deleteLinkedMaterials" value="yes" />
                              linked rows
                            </label>
                            <button type="submit" style={dangerGhostStyle}>Remove</button>
                          </form>
                        </div>
                      </div>

                      {isEditing ? (
                        <form action={updateProductOptionAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
                          <input type="hidden" name="productId" value={selectedProduct.id} />
                          <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Option label</span>
                              <input name="label" defaultValue={String(field.label ?? "")} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Key</span>
                              <input name="key" defaultValue={String(field.key ?? "")} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Type</span>
                              <select name="fieldType" defaultValue={String(field.type ?? "select")} style={inputStyle}>
                                {optionTypes.map((type) => (
                                  <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Default answer</span>
                              <input name="defaultAnswer" defaultValue={defaultAnswerFromField(field)} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Other choices</span>
                              <input name="otherOptionsCsv" defaultValue={otherChoicesCsvFromField(field)} placeholder="Comma separated" style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Required?</span>
                              <select name="required" defaultValue={field.required === false ? "no" : "yes"} style={inputStyle}>
                                <option value="yes">Required</option>
                                <option value="no">Optional</option>
                              </select>
                            </label>
                          </div>
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Only show after option</span>
                              <select name="showWhenOptionKey" defaultValue={currentShowWhenKey} style={inputStyle}>
                                <option value="">Always show</option>
                                {missingShowWhenOption ? <option value={currentShowWhenKey}>{currentShowWhenKey}</option> : null}
                                {fields.filter((item: any) => String(item.id ?? "") !== String(field.id ?? "")).map((item: any) => (
                                  <option key={item.id ?? item.key} value={String(item.key ?? "")}>{item.label}</option>
                                ))}
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Show when values</span>
                              <input name="showWhenOptionValuesCsv" defaultValue={showWhenValuesCsvFromField(field)} placeholder="eg roll_stock" style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Help text</span>
                              <input name="helpText" defaultValue={String(field.helpText ?? "")} style={inputStyle} />
                            </label>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" style={buttonStyle}>Save option</button>
                            <Link href={selectedProductUrl(selectedProduct.id, query)} style={ghostStyle}>Cancel</Link>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <form action={addProductOptionAction} style={{ ...softCardStyle, background: "#f8fafc" }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Add quote option</h3>
                <p style={{ ...mutedStyle, marginTop: 4 }}>Use plain business language: Size, Print type, Roll stock, Laminate, Finishing, Sides, GSM, Quantity.</p>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Option label</span>
                  <input name="label" placeholder="eg Size" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Type</span>
                  <select name="fieldType" defaultValue="select" style={inputStyle}>
                    {optionTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Default answer</span>
                  <input name="defaultAnswer" placeholder="eg 600x900 or None" style={inputStyle} />
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Other choices</span>
                  <input name="otherOptionsCsv" placeholder="eg 450x600,900x1200,Custom=custom" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Required?</span>
                  <select name="required" defaultValue="yes" style={inputStyle}>
                    <option value="yes">Required</option>
                    <option value="no">Optional</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Only show after option</span>
                  <select name="showWhenOptionKey" defaultValue="" style={inputStyle}>
                    <option value="">Always show</option>
                    {fields.map((field: any) => (
                      <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Show when values</span>
                  <input name="showWhenOptionValuesCsv" placeholder="eg roll_stock" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Help text</span>
                  <input name="helpText" placeholder="Explain how staff should use this option" style={inputStyle} />
                </label>
              </div>
              <button type="submit" style={buttonStyle}>Add quote option</button>
            </form>
          </section>
        </>
      ) : (
        <section style={{ ...cardStyle, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Start with one base product</h2>
          <p style={mutedStyle}>Create or open a product above. Once it is open, this page will show the guided setup sections for details, components/materials and quote options.</p>
        </section>
      )}
    </div>
  );
}
