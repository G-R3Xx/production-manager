
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
  updateProductAction,
  updateProductComponentAction,
  updateProductOptionAction
} from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_sqm") return "area";
  if (ruleType === "per_unit" && String(component?.unit ?? "") === "sheet") return "whole_sheet";
  if (ruleType === "per_unit") return "each";
  return "part_sheet";
}

function defaultAnswerFromField(field: any): string {
  const defaultValue = String(field?.defaultValue ?? "");
  if (!defaultValue) return "";
  const matched = Array.isArray(field?.options)
    ? field.options.find((option: any) => String(option?.value ?? "") === defaultValue)
    : null;
  return String(matched?.label ?? defaultValue).replace(/_/g, " ");
}

function otherChoicesCsvFromField(field: any): string {
  if (!Array.isArray(field?.options) || field.options.length === 0) return "";
  const defaultValue = String(field?.defaultValue ?? "");
  return field.options
    .filter((option: any) => String(option?.value ?? "") !== defaultValue)
    .map((option: any) => String(option?.label ?? option?.value ?? ""))
    .join(", ");
}

const pageStyle: CSSProperties = { maxWidth: 1180, margin: "0 auto", display: "grid", gap: 16, paddingBottom: 32 };
const cardStyle: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20, boxShadow: "0 1px 2px rgba(16,24,40,0.05)" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px", fontSize: 14, boxSizing: "border-box" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 92, padding: 12 };
const labelStyle: CSSProperties = { display: "grid", gap: 6 };
const labelTextStyle: CSSProperties = { fontWeight: 800, fontSize: 13, color: "#344054" };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 };
const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, padding: "0 16px", cursor: "pointer" };
const ghostStyle: CSSProperties = { minHeight: 40, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, padding: "0 14px", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const chipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "6px 10px", fontSize: 12, fontWeight: 900 };
const itemCardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#fcfcfd", display: "grid", gap: 8 };
const sectionHeadingStyle: CSSProperties = { margin: 0, fontSize: 22 };
const mutedStyle: CSSProperties = { margin: 0, color: "#667085", lineHeight: 1.5 };
const tableWrapStyle: CSSProperties = { overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 16 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 760 };
const cellStyle: CSSProperties = { padding: "12px 14px", borderBottom: "1px solid #e5e7eb", textAlign: "left", verticalAlign: "top", fontSize: 14 };

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

function productPresetButton(props: { label: string; starterType: string; productId: string; baseMaterialId?: string | null; baseUsage?: string }) {
  return (
    <form action={applyQuoteBehaviourPresetAction}>
      <input type="hidden" name="productId" value={props.productId} />
      <input type="hidden" name="starterType" value={props.starterType} />
      <input type="hidden" name="baseMaterialId" value={props.baseMaterialId ?? ""} />
      <input type="hidden" name="baseUsage" value={props.baseUsage ?? "part_sheet"} />
      <button type="submit" style={ghostStyle}>{props.label}</button>
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
  const editingComponent = components.find((item: any) => String(item?.id ?? "") === editComponentId) ?? null;
  const editingOption = fields.find((item: any) => String(item?.id ?? "") === editOptionId) ?? null;

  return (
    <div style={pageStyle}>
      {message ? <MessageBanner tone="success">{message}</MessageBanner> : null}
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4f46e5" }}>Catalog</p>
            <h1 style={{ margin: "8px 0 6px", fontSize: 34 }}>Products</h1>
            <p style={{ ...mutedStyle, maxWidth: 760 }}>
              Keep product setup simple. Create or open a product, then set its details, add the components it uses, and add the quote options staff can choose.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={chipStyle}>{products.length} products</span>
            <span style={chipStyle}>{activeMaterials.length} active materials</span>
            <span style={chipStyle}>GST default</span>
          </div>
        </div>

        <div style={grid2}>
          <form action={createProductAction} style={{ ...cardStyle, padding: 16, display: "grid", gap: 12, background: "#f8fafc" }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Create product</h2>
            <p style={mutedStyle}>Add the basic sellable product first. It will open straight away so you can keep building it on this page.</p>
            <input type="hidden" name="starterType" value="sign_acm" />
            <input type="hidden" name="baseUsage" value="part_sheet" />
            <div style={grid2}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product name</span>
                <input name="name" required placeholder="eg ACM Sign" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>SKU (optional)</span>
                <input name="sku" placeholder="eg ACM-SIGN" style={inputStyle} />
              </label>
            </div>
            <div style={grid3}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Department</span>
                <select name="department" defaultValue="signage" style={inputStyle}>
                  <option value="signage">Signage</option>
                  <option value="small_format">Small format</option>
                  <option value="general">General</option>
                  <option value="installation">Installation</option>
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product family</span>
                <select name="productFamily" defaultValue="display_products" style={inputStyle}>
                  <option value="display_products">Display products</option>
                  <option value="rigid_signage">Rigid signage</option>
                  <option value="roll_media">Roll media</option>
                  <option value="banners">Banners</option>
                  <option value="stickers_labels">Stickers & labels</option>
                  <option value="small_format_print">Small format print</option>
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Base material (optional)</span>
                <select name="baseMaterialId" defaultValue="" style={inputStyle}>
                  <option value="">Choose later</option>
                  {activeMaterials.map((material) => (
                    <option key={material.id} value={material.id}>{material.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" style={buttonStyle}>Create product</button>
          </form>

          <section style={{ ...cardStyle, padding: 16, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Find product</h2>
            <p style={mutedStyle}>Open an existing product and continue editing it here.</p>
            <form method="get" style={{ display: "grid", gap: 10 }}>
              <input name="q" defaultValue={query} placeholder="Search by product name, SKU or family" style={inputStyle} />
              <button type="submit" style={ghostStyle}>Search</button>
            </form>
            {selectedProduct ? (
              <div style={{ ...itemCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
                <strong>{selectedProduct.name}</strong>
                <div style={mutedStyle}>{selectedProduct.sku || "No SKU"} · {humanize(selectedProduct.department)} · {humanize(selectedProduct.productFamily)}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={chipStyle}>{components.length} components</span>
                  <span style={chipStyle}>{fields.length} options</span>
                </div>
              </div>
            ) : (
              <div style={{ ...itemCardStyle, background: "#fcfcfd" }}>No product selected yet.</div>
            )}
          </section>
        </div>
      </section>

      <section style={{ ...cardStyle, padding: 16 }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 16 }}>All products ({filteredProducts.length})</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {filteredProducts.length === 0 ? (
              <div style={{ ...itemCardStyle, background: "#fcfcfd" }}>No matching products.</div>
            ) : (
              filteredProducts.map((product) => (
                <Link key={product.id} href={selectedProductUrl(product.id, query)} style={{ ...itemCardStyle, textDecoration: "none", color: "inherit", background: selectedProduct?.id === product.id ? "#eef2ff" : "#fff" }}>
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

      {selectedProduct ? (
        <>
          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <h2 style={sectionHeadingStyle}>Product details</h2>
              <p style={mutedStyle}>Keep the basics simple. Save the product first, then build up the components and quote options underneath.</p>
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
                  <span style={labelTextStyle}>SKU</span>
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
                    <option value="display_products">Display products</option>
                    <option value="rigid_signage">Rigid signage</option>
                    <option value="roll_media">Roll media</option>
                    <option value="banners">Banners</option>
                    <option value="stickers_labels">Stickers & labels</option>
                    <option value="small_format_print">Small format print</option>
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
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <h2 style={sectionHeadingStyle}>Quick start packs</h2>
              <p style={mutedStyle}>Use a starter pack to pre-load common options and components, then adjust what is needed.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {productPresetButton({ label: "Direct Print ACM Sign", starterType: "sign_acm", productId: selectedProduct.id, baseUsage: "part_sheet" })}
              {productPresetButton({ label: "Printed Corflute Sign", starterType: "sign_corflute", productId: selectedProduct.id, baseUsage: "part_sheet" })}
              {productPresetButton({ label: "Banner", starterType: "banner", productId: selectedProduct.id, baseUsage: "roll_metres" })}
              {productPresetButton({ label: "Sticker / Label", starterType: "roll_print", productId: selectedProduct.id, baseUsage: "area" })}
              {productPresetButton({ label: "Book", starterType: "books", productId: selectedProduct.id, baseUsage: "each" })}
              {productPresetButton({ label: "Carbon Book", starterType: "carbon_books", productId: selectedProduct.id, baseUsage: "each" })}
            </div>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <h2 style={sectionHeadingStyle}>Components</h2>
              <p style={mutedStyle}>What does this product use? Keep it simple: list the materials and labour, then edit only what needs changing.</p>
            </div>

            {components.length === 0 ? (
              <div style={{ ...itemCardStyle, background: "#fcfcfd" }}>No components yet. Use a quick start pack or add one below.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {components.map((component: any) => {
                  const linkedMaterial = component.materialId ? materials.find((m) => m.id === component.materialId) : null;
                  const isEditing = String(component.id ?? "") === String(editComponentId);
                  return (
                    <div key={component.id ?? component.label} style={itemCardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong>{component.label ?? "Component"}</strong>
                          <div style={mutedStyle}>
                            {component.kind === "labour" ? "Labour" : "Material"} · {linkedMaterial?.name ?? component.labourRateName ?? "Not linked"}
                          </div>
                          <div style={mutedStyle}>
                            {humanize(component.ruleType ?? component.stockUsage?.usageBasis ?? "fixed")} · {component.quantity ? `${component.quantity} ${component.unit ?? ""}`.trim() : (component.unit ?? "—")} · Waste {component.wastePercent ? `${component.wastePercent}%` : "0%"}
                          </div>
                          {component.notes ? <div style={mutedStyle}>{component.notes}</div> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link href={editProductUrl(selectedProduct.id, query, "component", String(component.id ?? ""))} style={{ ...ghostStyle, textDecoration: "none" }}>
                            Edit
                          </Link>
                          <form action={deleteProductComponentAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="componentId" value={String(component.id ?? "")} />
                            <button type="submit" style={ghostStyle}>Remove</button>
                          </form>
                        </div>
                      </div>

                      {isEditing ? (
                        <form action={updateProductComponentAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
                          <input type="hidden" name="productId" value={selectedProduct.id} />
                          <input type="hidden" name="componentId" value={String(component.id ?? "")} />
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Type</span>
                              <select name="kind" defaultValue={component.kind === "labour" ? "labour" : "material"} style={inputStyle}>
                                <option value="material">Material</option>
                                <option value="labour">Labour</option>
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Component name</span>
                              <input name="label" defaultValue={component.label ?? ""} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Material</span>
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
                              <span style={labelTextStyle}>Labour label</span>
                              <input name="labourRateName" defaultValue={component.labourRateName ?? ""} placeholder="eg Print labour" style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>How calculated</span>
                              <select name="baseUsage" defaultValue={baseUsageFromComponent(component)} style={inputStyle}>
                                <option value="part_sheet">Part sheet</option>
                                <option value="whole_sheet">Whole sheet</option>
                                <option value="roll_metres">Linear metres</option>
                                <option value="area">Square metres</option>
                                <option value="each">Each</option>
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Value</span>
                              <input name="quantity" defaultValue={String(component.quantity ?? "1")} style={inputStyle} />
                            </label>
                          </div>
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Waste %</span>
                              <input name="wastePercent" defaultValue={String(component.wastePercent ?? "10")} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Use when option key matches</span>
                              <input name="triggerOptionKey" defaultValue={String(component.trigger?.optionKey ?? "")} placeholder="eg laminate" style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Allowed values (CSV)</span>
                              <input name="triggerOptionValuesCsv" defaultValue={Array.isArray(component.trigger?.optionValues) ? component.trigger.optionValues.join(", ") : ""} placeholder="eg matte,gloss" style={inputStyle} />
                            </label>
                          </div>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Notes</span>
                            <textarea name="notes" rows={3} defaultValue={String(component.notes ?? "")} style={textareaStyle} />
                          </label>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" style={buttonStyle}>Save component</button>
                            <Link href={selectedProductUrl(selectedProduct.id, query)} style={{ ...ghostStyle, textDecoration: "none" }}>Cancel</Link>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <form action={addProductComponentAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>Add component</strong>
                <span style={mutedStyle}>Add only what this product actually uses.</span>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Type</span>
                  <select name="kind" defaultValue="material" style={inputStyle}>
                    <option value="material">Material</option>
                    <option value="labour">Labour</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Component name</span>
                  <input name="label" placeholder="eg ACM face" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Material</span>
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
                  <span style={labelTextStyle}>Labour label</span>
                  <input name="labourRateName" placeholder="eg Print labour" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>How calculated</span>
                  <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
                    <option value="part_sheet">Part sheet</option>
                    <option value="whole_sheet">Whole sheet</option>
                    <option value="roll_metres">Linear metres</option>
                    <option value="area">Square metres</option>
                    <option value="each">Each</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Value</span>
                  <input name="quantity" defaultValue="1" style={inputStyle} />
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Waste %</span>
                  <input name="wastePercent" defaultValue="10" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Use when option key matches (optional)</span>
                  <input name="triggerOptionKey" placeholder="eg laminate" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Allowed values (CSV)</span>
                  <input name="triggerOptionValuesCsv" placeholder="eg matte,gloss" style={inputStyle} />
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
              <h2 style={sectionHeadingStyle}>Options</h2>
              <p style={mutedStyle}>These are the choices staff pick when quoting, like size, sides, laminate, eyelets or binding.</p>
            </div>

            {fields.length === 0 ? (
              <div style={{ ...itemCardStyle, background: "#fcfcfd" }}>No options yet. Add the choices staff should pick when quoting.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {fields.map((field: any) => {
                  const isEditing = String(field.id ?? "") === String(editOptionId);
                  return (
                    <div key={field.id ?? field.key} style={itemCardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong>{field.label}</strong>
                          <div style={mutedStyle}>{humanize(field.type)} · Default: {defaultAnswerFromField(field) || "None"}</div>
                          {Array.isArray(field.options) && field.options.length > 0 ? (
                            <div style={mutedStyle}>Choices: {field.options.map((option: any) => String(option.label ?? option.value ?? "")).join(", ")}</div>
                          ) : null}
                          {field.helpText ? <div style={mutedStyle}>{field.helpText}</div> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link href={editProductUrl(selectedProduct.id, query, "option", String(field.id ?? ""))} style={{ ...ghostStyle, textDecoration: "none" }}>
                            Edit
                          </Link>
                          <form action={deleteProductOptionAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                            <button type="submit" style={ghostStyle}>Remove</button>
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
                                <option value="select">Select list</option>
                                <option value="yes_no">Yes / No</option>
                                <option value="quantity">Quantity</option>
                                <option value="number">Number</option>
                                <option value="text">Text</option>
                              </select>
                            </label>
                          </div>
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Default answer</span>
                              <input name="defaultAnswer" defaultValue={defaultAnswerFromField(field)} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Other choices (CSV)</span>
                              <input name="otherOptionsCsv" defaultValue={otherChoicesCsvFromField(field)} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Help text</span>
                              <input name="helpText" defaultValue={String(field.helpText ?? "")} style={inputStyle} />
                            </label>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" style={buttonStyle}>Save option</button>
                            <Link href={selectedProductUrl(selectedProduct.id, query)} style={{ ...ghostStyle, textDecoration: "none" }}>Cancel</Link>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <form action={addProductOptionAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>Add option</strong>
                <span style={mutedStyle}>Use plain business language like Size, Sides, Laminate or Eyelets.</span>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Option label</span>
                  <input name="label" placeholder="eg Size" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Type</span>
                  <select name="fieldType" defaultValue="select" style={inputStyle}>
                    <option value="select">Select list</option>
                    <option value="yes_no">Yes / No</option>
                    <option value="quantity">Quantity</option>
                    <option value="number">Number</option>
                    <option value="text">Text</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Default answer</span>
                  <input name="defaultAnswer" placeholder="eg 600x900 or yes" style={inputStyle} />
                </label>
              </div>
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Other choices (CSV)</span>
                  <input name="otherOptionsCsv" placeholder="eg 450x600,600x900,1200x2400" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Help text</span>
                  <input name="helpText" placeholder="Explain how staff should use this option" style={inputStyle} />
                </label>
              </div>
              <button type="submit" style={buttonStyle}>Add option</button>
            </form>
          </section>
        </>
      ) : (
        <section style={{ ...cardStyle, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Open a product to edit it</h2>
          <p style={mutedStyle}>Create a product first or use Find product / All products to open an existing one.</p>
        </section>
      )}
    </div>
  );
}
