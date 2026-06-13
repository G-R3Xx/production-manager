import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";
import { addProductComponentAction, addProductOptionAction, createProductAction, updateProductAction } from "./actions";

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
    .replace(/(\d+)x(\d+)/i, "$1 × $2 mm");
}

function selectedProductUrl(productId: string, query: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  return `/products?selected=${productId}${q}`;
}

const pageStyle: CSSProperties = {
  maxWidth: 1240,
  margin: "0 auto",
  display: "grid",
  gap: 16,
  minWidth: 0
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
  minWidth: 0
};

const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 22 };
const mutedStyle: CSSProperties = { margin: 0, color: "#667085", lineHeight: 1.5 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px", boxSizing: "border-box", fontSize: 14 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 92, padding: 12 };
const labelStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 800, fontSize: 13, color: "#344054" };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, minWidth: 0 };
const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, minWidth: 0 };
const btnStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, padding: "0 16px", cursor: "pointer" };
const ghostBtnStyle: CSSProperties = { minHeight: 38, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, padding: "0 14px", cursor: "pointer" };
const pillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "6px 10px", fontSize: 12, fontWeight: 900 };
const itemCardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 16, padding: 14, background: "#fcfcfd", display: "grid", gap: 8 };

function MessageBanner({ tone, children }: { tone: "success" | "error"; children: string }) {
  const success = tone === "success";
  return (
    <section style={{
      border: `1px solid ${success ? "#abefc6" : "#fda29b"}`,
      background: success ? "#ecfdf3" : "#fff5f4",
      color: success ? "#067647" : "#b42318",
      borderRadius: 16,
      padding: 14,
      fontWeight: 800
    }}>
      {children}
    </section>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
            <h1 style={{ margin: "8px 0 6px", fontSize: 34 }}>Products</h1>
            <p style={{ ...mutedStyle, maxWidth: 820 }}>
              Create or select a sellable product, then manage its details, components and quote options in one place.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={pillStyle}>{products.length} products</span>
            <span style={pillStyle}>{activeMaterials.length} active materials</span>
            <span style={pillStyle}>GST default</span>
          </div>
        </div>

        <div style={grid2}>
          <form action={createProductAction} style={{ ...cardStyle, padding: 16, display: "grid", gap: 12, background: "#f8fafc" }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Create product</h2>
            <p style={mutedStyle}>Add the base sellable product first. It will open in the editor immediately after saving.</p>
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
            <button type="submit" style={btnStyle}>Create product</button>
          </form>

          <section style={{ ...cardStyle, padding: 16, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Find product</h2>
            <p style={mutedStyle}>Search and open an existing product to edit its details, components and options.</p>
            <form method="get" style={{ display: "grid", gap: 10 }}>
              <input name="q" defaultValue={query} placeholder="Search by product name, SKU or family" style={inputStyle} />
              <button type="submit" style={ghostBtnStyle}>Search</button>
            </form>
            {selectedProduct ? (
              <div style={{ ...itemCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
                <div style={{ fontWeight: 900 }}>{selectedProduct.name}</div>
                <div style={mutedStyle}>{selectedProduct.sku || "No SKU"} · {humanize(selectedProduct.department)} · {humanize(selectedProduct.productFamily)}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={pillStyle}>{components.length} components</span>
                  <span style={pillStyle}>{fields.length} options</span>
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
                    <span style={pillStyle}>{humanize(product.status)}</span>
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
            <h2 style={sectionTitleStyle}>Selected product details</h2>
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
              <button type="submit" style={btnStyle}>Save product details</button>
            </form>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <h2 style={sectionTitleStyle}>Components</h2>
              <p style={mutedStyle}>Add the materials or labour this product uses. Keep it simple: one row per stock item or labour item.</p>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {components.length === 0 ? <div style={{ ...itemCardStyle, background: "#fcfcfd" }}>No components yet.</div> : components.map((component: any) => (
                <div key={component.id ?? component.label} style={itemCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{component.label ?? "Component"}</strong>
                    <span style={pillStyle}>{humanize(component.ruleType ?? component.stockUsage?.usageBasis ?? "fixed")}</span>
                  </div>
                  <div style={mutedStyle}>
                    {component.kind === "labour" ? "Labour" : "Material"}
                    {component.materialId ? ` · ${materials.find((m) => m.id === component.materialId)?.name ?? "Linked material"}` : ""}
                    {component.quantity ? ` · Qty ${component.quantity}` : ""}
                    {component.unit ? ` ${component.unit}` : ""}
                  </div>
                  {component.notes ? <div style={mutedStyle}>{component.notes}</div> : null}
                </div>
              ))}
            </div>
            <form action={addProductComponentAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Component label</span>
                  <input name="label" placeholder="eg 3mm ACM sheet" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Linked material</span>
                  <select name="materialId" defaultValue="" style={inputStyle}>
                    <option value="">No linked material</option>
                    {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                  </select>
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Usage rule</span>
                  <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
                    <option value="part_sheet">Part of sheet / yield</option>
                    <option value="whole_sheet">Whole sheet</option>
                    <option value="roll_metres">Roll metres</option>
                    <option value="area">Area / sqm</option>
                    <option value="paper_yield">Paper yield</option>
                    <option value="each">Each / per unit</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Quantity</span>
                  <input name="quantity" defaultValue="1" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Waste %</span>
                  <input name="wastePercent" defaultValue="10" style={inputStyle} />
                </label>
              </div>
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Only used when option key is</span>
                  <input name="triggerOptionKey" placeholder="eg size or laminate" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Option values (CSV)</span>
                  <input name="triggerOptionValuesCsv" placeholder="eg gloss_laminate,matt_laminate" style={inputStyle} />
                </label>
              </div>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Notes</span>
                <textarea name="notes" rows={3} placeholder="How this component is used or allocated" style={textareaStyle} />
              </label>
              <button type="submit" style={btnStyle}>Add component</button>
            </form>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <h2 style={sectionTitleStyle}>Options</h2>
              <p style={mutedStyle}>Add the preset choices staff can pick while quoting this product.</p>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {fields.length === 0 ? <div style={{ ...itemCardStyle, background: "#fcfcfd" }}>No options yet.</div> : fields.map((field: any) => (
                <div key={field.id ?? field.key} style={itemCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{field.label}</strong>
                    <span style={pillStyle}>{humanize(field.type)}</span>
                  </div>
                  <div style={mutedStyle}>Key: {field.key} · Default: {field.defaultValue ? humanize(field.defaultValue) : "None"}</div>
                  {Array.isArray(field.options) && field.options.length > 0 ? <div style={mutedStyle}>Choices: {field.options.map((option: any) => String(option.label ?? option.value ?? "")).join(", ")}</div> : null}
                </div>
              ))}
            </div>
            <form action={addProductOptionAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Option label</span>
                  <input name="label" placeholder="eg Size" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Internal key</span>
                  <input name="key" placeholder="eg size" style={inputStyle} />
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Field type</span>
                  <select name="fieldType" defaultValue="select" style={inputStyle}>
                    <option value="select">Select</option>
                    <option value="size_select">Size select</option>
                    <option value="quantity">Quantity</option>
                    <option value="number">Number</option>
                    <option value="color">Colour</option>
                    <option value="text">Text</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Required?</span>
                  <select name="required" defaultValue="yes" style={inputStyle}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Default answer</span>
                  <input name="defaultAnswer" placeholder="eg 600x900 or None" style={inputStyle} />
                </label>
              </div>
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Other answers (CSV)</span>
                  <input name="otherOptionsCsv" placeholder="eg 450x600,600x900,1200x2400" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Help text</span>
                  <input name="helpText" placeholder="Shown to staff while quoting" style={inputStyle} />
                </label>
              </div>
              <button type="submit" style={btnStyle}>Add option</button>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
