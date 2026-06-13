import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById, listConfiguratorTemplatesForTenant } from "@/server/configurators";
import { getProductById, listProductsForTenant } from "@/server/products";
import { addProductComponentAction, addProductOptionAction, createProductAction, updateProductAction } from "./actions";
import { listMaterialsForTenant } from "@/server/materials";
import { listSuppliersForTenant } from "@/server/suppliers";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type EditorDefinition = {
  components: Array<any>;
  fields: Array<any>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function niceCalcLabel(value: string): string {
  const labels: Record<string, string> = {
    fixed: "Fixed qty",
    per_unit: "Per unit sold",
    per_sqm: "Per sqm",
    per_lm: "Per linear metre",
    per_sheet: "Per sheet",
    yield_based: "Yield based"
  };
  return labels[value] ?? value;
}

function niceOptionTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    select: "Select list",
    yes_no: "Yes / No",
    quantity: "Quantity",
    number: "Number",
    text: "Text",
    colour: "Colour",
    binding: "Binding"
  };
  return labels[value] ?? value;
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

  const [products, templates, materials, suppliers] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listConfiguratorTemplatesForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId)
  ]);

  const filteredProducts = query
    ? products.filter((product) =>
        matchesQuery(product.name, query) ||
        matchesQuery(product.sku ?? "", query) ||
        matchesQuery(product.productFamily, query)
      )
    : products;

  const selectedProduct = selectedId ? await getProductById(activeTenant.tenantId, selectedId) : null;
  const editorTemplate = selectedProduct?.defaultTemplateId
    ? await getConfiguratorTemplateById(activeTenant.tenantId, selectedProduct.defaultTemplateId)
    : null;
  const editorDefinition: EditorDefinition = {
    components: Array.isArray(editorTemplate?.definitionJson?.components) ? editorTemplate!.definitionJson.components : [],
    fields: Array.isArray(editorTemplate?.definitionJson?.fields) ? editorTemplate!.definitionJson.fields : []
  };

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 };
  const inputStyle: React.CSSProperties = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16, width: "100%" };
  const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: 24 };
  const fieldLabelStyle: React.CSSProperties = { fontWeight: 600 };
  const helperStyle: React.CSSProperties = { margin: "6px 0 0", color: "#475467", lineHeight: 1.5 };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Products</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Keep this simple: create or find a product, then set up what it <strong>uses</strong> in <strong>Components</strong> and what can <strong>vary</strong> in <strong>Options</strong>. Tax defaults to GST automatically.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 360px) 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <form action={createProductAction} style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0 }}>Create product</h2>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={fieldLabelStyle}>Product name</span>
              <input name="name" required placeholder="5mm Corflute Sign" style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={fieldLabelStyle}>SKU</span>
              <input name="sku" placeholder="COR-5MM-SIGN" style={inputStyle} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={fieldLabelStyle}>Department</span>
                <select name="department" defaultValue="signage" style={inputStyle}>
                  <option value="signage">Signage</option>
                  <option value="small_format">Small format</option>
                  <option value="installation">Installation</option>
                  <option value="general">General</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={fieldLabelStyle}>Status</span>
                <select name="status" defaultValue="draft" style={inputStyle}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={fieldLabelStyle}>Product family</span>
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
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Create product</button>
          </form>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>Find product</h2>
                <p style={helperStyle}>Open one product and edit it on this same page.</p>
              </div>
              <div style={{ fontSize: 13, color: "#667085" }}>{products.length} total</div>
            </div>
            <form method="GET" action="/products" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <input type="text" name="q" defaultValue={query} placeholder="Search by name, SKU, or family" style={inputStyle} />
              <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>Search</button>
            </form>
            <div style={{ display: "grid", gap: 10 }}>
              {filteredProducts.slice(0, 6).map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                return (
                  <a key={product.id} href={`/products?selected=${product.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`} style={{ display: "block", textDecoration: "none", border: isSelected ? "1px solid #4f46e5" : "1px solid #e5e7eb", background: isSelected ? "#eef2ff" : "#fafafa", color: "#111827", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontWeight: 700 }}>{product.name}</div>
                    <div style={{ marginTop: 6, fontSize: 14, color: "#475467" }}>{product.sku || "No SKU"} · {product.productFamily}</div>
                  </a>
                );
              })}
            </div>
            <details style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>All products</summary>
              <div style={{ display: "grid", gap: 10, marginTop: 14, maxHeight: 360, overflowY: "auto" }}>
                {products.map((product) => (
                  <a key={product.id} href={`/products?selected=${product.id}`} style={{ display: "block", textDecoration: "none", border: "1px solid #e5e7eb", background: "#fafafa", color: "#111827", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontWeight: 700 }}>{product.name}</div>
                    <div style={{ marginTop: 6, fontSize: 14, color: "#475467" }}>{product.sku || "No SKU"} · {product.department} · {product.status}</div>
                  </a>
                ))}
              </div>
            </details>
          </section>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <div>
              <h2 style={sectionTitleStyle}>Selected product</h2>
              {!selectedProduct ? <p style={helperStyle}>Select a product from the left to edit its details, components and options.</p> : <p style={helperStyle}>Edit the basic product details here, then use Components and Options below.</p>}
            </div>
            {!selectedProduct ? null : (
              <form action={updateProductAction} style={{ display: "grid", gap: 14 }}>
                <input type="hidden" name="productId" value={selectedProduct.id} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Product name</span><input name="name" required defaultValue={selectedProduct.name} style={inputStyle} /></label>
                  <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>SKU</span><input name="sku" defaultValue={selectedProduct.sku ?? ""} style={inputStyle} /></label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Department</span><select name="department" defaultValue={selectedProduct.department} style={inputStyle}><option value="signage">Signage</option><option value="small_format">Small format</option><option value="installation">Installation</option><option value="general">General</option></select></label>
                  <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Product family</span><select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}><option value="rigid_signage">Rigid signage</option><option value="roll_media">Roll media</option><option value="banners">Banners</option><option value="stickers_labels">Stickers / labels</option><option value="window_wall_graphics">Window / wall graphics</option><option value="vehicle_graphics">Vehicle graphics</option><option value="display_products">Display products</option><option value="small_format_print">Small format print</option></select></label>
                  <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Status</span><select name="status" defaultValue={selectedProduct.status} style={inputStyle}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
                </div>
                <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer", justifySelf: "start", padding: "0 18px" }}>Save product</button>
              </form>
            )}
          </section>

          {selectedProduct ? (
            <>
              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <div>
                  <h2 style={sectionTitleStyle}>Components</h2>
                  <p style={helperStyle}>What does this product use? Add materials or labour here. Start simple. Use Advanced only when you need a trigger or more detailed rule.</p>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.components.length === 0 ? (
                    <div style={{ border: "1px dashed #d0d5dd", borderRadius: 16, padding: 18, color: "#475467", background: "#fafafa" }}>No components yet. Add the materials and labour this product uses.</div>
                  ) : (
                    editorDefinition.components.map((component) => {
                      const material = materials.find((item) => item.id === component.materialId);
                      const supplier = suppliers.find((item) => item.id === component.supplierId);
                      return (
                        <div key={component.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fafafa" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 12, alignItems: "start" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: component.kind === "labour" ? "#7c2d12" : "#065f46" }}>{component.kind}</div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 16 }}>{component.label}</div>
                              <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>
                                {niceCalcLabel(component.ruleType ?? "fixed")} · {component.quantity} {component.unit}
                                {component.wastePercent ? ` · ${component.wastePercent}% waste` : ""}
                              </div>
                            </div>
                            <div style={{ fontSize: 13, color: "#667085", textAlign: "right" }}>{component.optionTriggerKey ? "Triggered" : "Always used"}</div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12, fontSize: 14, color: "#475467" }}>
                            <div><strong>Material</strong><div>{material?.name ?? "—"}</div></div>
                            <div><strong>Supplier</strong><div>{supplier?.displayName ?? "—"}</div></div>
                            <div><strong>Trigger</strong><div>{component.optionTriggerKey ? `${component.optionTriggerKey} = ${component.optionTriggerValue ?? "yes"}` : "—"}</div></div>
                          </div>
                          {component.notes ? <div style={{ marginTop: 12, fontSize: 14, color: "#475467" }}><strong>Notes:</strong> {component.notes}</div> : null}
                        </div>
                      );
                    })
                  )}
                </div>

                <form action={addProductComponentAction} style={{ display: "grid", gap: 14, borderTop: "1px solid #e5e7eb", paddingTop: 18 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Type</span><select name="componentKind" defaultValue="material" style={inputStyle}><option value="material">Material</option><option value="labour">Labour</option></select></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Material</span><select name="materialId" defaultValue="" style={inputStyle}><option value="">Select material (optional)</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Supplier</span><select name="supplierId" defaultValue="" style={inputStyle}><option value="">Optional</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select></label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Component name</span><input name="label" placeholder="ACM panel" style={inputStyle} /></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>How calculated</span><select name="ruleType" defaultValue="fixed" style={inputStyle}><option value="fixed">Fixed qty</option><option value="per_unit">Per unit sold</option><option value="per_sqm">Per sqm</option><option value="per_lm">Per linear metre</option><option value="per_sheet">Per sheet</option><option value="yield_based">Yield based</option></select></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Value</span><input name="quantity" defaultValue="1" style={inputStyle} /></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Unit</span><input name="unit" defaultValue="each" style={inputStyle} /></label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Waste %</span><input name="wastePercent" defaultValue="0" style={inputStyle} /></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Notes</span><input name="notes" placeholder="Optional notes" style={inputStyle} /></label>
                  </div>
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>Advanced</summary>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                      <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Trigger option key</span><input name="optionTriggerKey" placeholder="laminate" style={inputStyle} /></label>
                      <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Trigger value</span><input name="optionTriggerValue" placeholder="yes" style={inputStyle} /></label>
                    </div>
                  </details>
                  <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer", justifySelf: "start", padding: "0 18px" }}>Add component</button>
                </form>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <div>
                  <h2 style={sectionTitleStyle}>Options</h2>
                  <p style={helperStyle}>What can vary on this product? Use options for size, sides, laminate, quantities, colours or other choices staff need during quoting.</p>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.fields.length === 0 ? (
                    <div style={{ border: "1px dashed #d0d5dd", borderRadius: 16, padding: 18, color: "#475467", background: "#fafafa" }}>No options yet. Add the choices that staff or customers can pick for this product.</div>
                  ) : (
                    editorDefinition.fields.map((field) => (
                      <div key={field.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fafafa" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{field.label}</div>
                            <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>{niceOptionTypeLabel(field.type)} · key: {field.key}{field.required ? " · required" : ""}</div>
                          </div>
                          <div style={{ fontSize: 13, color: "#667085" }}>{field.defaultValue ? `Default: ${field.defaultValue}` : ""}</div>
                        </div>
                        {Array.isArray(field.options) && field.options.length > 0 ? <div style={{ marginTop: 10, fontSize: 14, color: "#475467" }}><strong>Choices:</strong> {field.options.map((option: any) => option.label ?? option.value).join(", ")}</div> : null}
                        {field.helpText ? <div style={{ marginTop: 10, fontSize: 14, color: "#475467" }}>{field.helpText}</div> : null}
                      </div>
                    ))
                  )}
                </div>

                <form action={addProductOptionAction} style={{ display: "grid", gap: 14, borderTop: "1px solid #e5e7eb", paddingTop: 18 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Option name</span><input name="label" placeholder="Sides" style={inputStyle} /></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Key</span><input name="key" placeholder="sides" style={inputStyle} /></label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Field type</span><select name="fieldType" defaultValue="select" style={inputStyle}><option value="select">Select list</option><option value="yes_no">Yes / No</option><option value="quantity">Quantity</option><option value="number">Number</option><option value="text">Text</option><option value="colour">Colour</option><option value="binding">Binding</option></select></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Required</span><select name="required" defaultValue="yes" style={inputStyle}><option value="yes">Yes</option><option value="no">No</option></select></label>
                    <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Default value</span><input name="defaultValue" placeholder="Optional" style={inputStyle} /></label>
                  </div>
                  <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Choices (CSV)</span><input name="optionsCsv" placeholder="Single sided, Double sided" style={inputStyle} /></label>
                  <label style={{ display: "grid", gap: 8 }}><span style={fieldLabelStyle}>Help text</span><input name="helpText" placeholder="Shown to staff when quoting" style={inputStyle} /></label>
                  <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer", justifySelf: "start", padding: "0 18px" }}>Add option</button>
                </form>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
