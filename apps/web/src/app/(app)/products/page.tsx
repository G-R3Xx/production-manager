import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listConfiguratorTemplatesForTenant } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { listProductsForTenant } from "@/server/products";
import { listLabourRatesForTenant, listProductRecipesForTenant, listRecipeComponents } from "@/server/recipes";
import { listSuppliersForTenant } from "@/server/suppliers";
import {
  addComponentForProductAction,
  addOptionForProductAction,
  createOptionsForProductAction,
  createProductAction,
  createRecipeForProductAction
} from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ConfigField = {
  id?: string;
  key?: string;
  label?: string;
  type?: string;
  required?: boolean;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const inputStyle = {
  minHeight: 42,
  borderRadius: 10,
  border: "1px solid #d0d5dd",
  padding: "0 12px",
  fontSize: 15,
  width: "100%"
};

const textareaStyle = {
  borderRadius: 10,
  border: "1px solid #d0d5dd",
  padding: "10px 12px",
  fontSize: 15,
  width: "100%"
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedProductId = readParam(params, "product");
  const search = readParam(params, "search").toLowerCase();

  const [products, materials, suppliers, labourRates, recipes, templates] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId),
    listLabourRatesForTenant(activeTenant.tenantId),
    listProductRecipesForTenant(activeTenant.tenantId),
    listConfiguratorTemplatesForTenant(activeTenant.tenantId)
  ]);

  const filteredProducts = products.filter((product) => {
    if (!search) return true;
    return [product.name, product.sku ?? "", product.productFamily, product.department]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? filteredProducts[0] ?? null;
  const selectedRecipes = selectedProduct
    ? recipes.filter((recipe) => recipe.productId === selectedProduct.id)
    : [];
  const selectedTemplate = selectedProduct?.defaultTemplateId
    ? templates.find((template) => template.id === selectedProduct.defaultTemplateId) ?? null
    : null;

  const componentLists = await Promise.all(selectedRecipes.map((recipe) => listRecipeComponents(recipe.id)));
  const recipeComponentsById = Object.fromEntries(selectedRecipes.map((recipe, index) => [recipe.id, componentLists[index] ?? []]));
  const optionFields = Array.isArray(selectedTemplate?.definitionJson?.fields)
    ? (selectedTemplate?.definitionJson?.fields as ConfigField[])
    : [];

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Products</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Product setup workflow</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Materials are what you buy. Products are what you sell. For each selected product, set up <strong>Components</strong> and <strong>Options</strong> in one place.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <form action={createProductAction} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0 }}>Add product</h2>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Product name</span><input name="name" required placeholder="5mm Corflute Sign" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>SKU</span><input name="sku" placeholder="COR-5MM-SIGN" style={inputStyle} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Department</span><select name="department" defaultValue="signage" style={inputStyle}><option value="signage">Signage</option><option value="small_format">Small format</option><option value="installation">Installation</option><option value="general">General</option></select></label>
              <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Status</span><select name="status" defaultValue="draft" style={inputStyle}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
            </div>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Product family</span><select name="productFamily" defaultValue="rigid_signage" style={inputStyle}><option value="rigid_signage">Rigid signage</option><option value="roll_media">Roll media</option><option value="banners">Banners</option><option value="stickers_labels">Stickers / labels</option><option value="window_wall_graphics">Window / wall graphics</option><option value="vehicle_graphics">Vehicle graphics</option><option value="display_products">Display products</option><option value="small_format_print">Small format print</option></select></label>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Tax code</span><input name="taxCode" placeholder="GST" style={inputStyle} /></label>
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Create product</button>
          </form>

          <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0 }}>Find product</h2>
            <form method="get" action="/products" style={{ display: "grid", gap: 10 }}>
              <input name="search" defaultValue={search} placeholder="Search product name or SKU" style={inputStyle} />
              {selectedProduct ? <input type="hidden" name="product" value={selectedProduct.id} /> : null}
              <button type="submit" style={{ minHeight: 42, borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}>Search</button>
            </form>
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>All products ({filteredProducts.length})</summary>
              <div style={{ marginTop: 12, display: "grid", gap: 8, maxHeight: 360, overflow: "auto" }}>
                {filteredProducts.map((product) => {
                  const href = `/products?product=${product.id}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
                  const active = selectedProduct?.id === product.id;
                  return (
                    <a key={product.id} href={href} style={{ display: "block", padding: 12, borderRadius: 12, border: active ? "1px solid #4f46e5" : "1px solid #e5e7eb", background: active ? "#eef2ff" : "#fafafa", color: "#111827", textDecoration: "none" }}>
                      <div style={{ fontWeight: 700 }}>{product.name}</div>
                      <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>{product.sku ?? "No SKU"} · {product.productFamily} · {product.status}</div>
                    </a>
                  );
                })}
                {filteredProducts.length === 0 ? <div style={{ color: "#667085" }}>No products found.</div> : null}
              </div>
            </details>
          </section>
        </div>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 18 }}>
          {!selectedProduct ? (
            <p style={{ margin: 0, color: "#475467" }}>Create or select a product to manage its components and options.</p>
          ) : (
            <>
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Selected product</p>
                <h2 style={{ margin: 0 }}>{selectedProduct.name}</h2>
                <div style={{ color: "#475467" }}>{selectedProduct.sku ?? "No SKU"} · {selectedProduct.department} · {selectedProduct.productFamily} · {selectedProduct.status}</div>
              </div>

              <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, display: "grid", gap: 14 }}>
                <h3 style={{ margin: 0 }}>Components</h3>
                <p style={{ margin: 0, color: "#475467" }}>Add the materials and labour used to produce this product.</p>
                {selectedRecipes.length === 0 ? (
                  <form action={createRecipeForProductAction} style={{ display: "grid", gap: 10 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />
                    <input name="name" defaultValue={`${selectedProduct.name} components`} style={inputStyle} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input name="yieldQty" defaultValue="1" placeholder="Yield qty" style={inputStyle} />
                      <input name="yieldUom" defaultValue="item" placeholder="Yield UOM" style={inputStyle} />
                    </div>
                    <textarea name="notes" rows={2} placeholder="Notes" style={textareaStyle} />
                    <button type="submit" style={{ minHeight: 42, borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}>Create components set</button>
                  </form>
                ) : (
                  <div style={{ display: "grid", gap: 16 }}>
                    {selectedRecipes.map((recipe) => {
                      const components = recipeComponentsById[recipe.id] ?? [];
                      return (
                        <article key={recipe.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, display: "grid", gap: 12, background: "#fafafa" }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{recipe.name}</div>
                            <div style={{ marginTop: 4, color: "#667085", fontSize: 13 }}>Yield {recipe.yieldQty} {recipe.yieldUom} · {components.length} component(s)</div>
                          </div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {components.length === 0 ? <div style={{ color: "#667085", fontSize: 14 }}>No components yet.</div> : components.map((component) => (
                              <div key={component.id} style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", padding: 12 }}>
                                <div style={{ fontWeight: 700 }}>{component.name}</div>
                                <div style={{ marginTop: 4, fontSize: 13, color: "#667085" }}>{component.componentType} · Qty {component.qty} {component.uom} · Waste {component.wastePercent}%</div>
                              </div>
                            ))}
                          </div>
                          <form action={addComponentForProductAction} style={{ display: "grid", gap: 10 }}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="recipeId" value={recipe.id} />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              <select name="componentType" defaultValue="material" style={inputStyle}><option value="material">Material</option><option value="labour">Labour</option></select>
                              <input name="name" placeholder="Component name" style={inputStyle} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                              <select name="materialId" defaultValue="" style={inputStyle}><option value="">No material link</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select>
                              <select name="supplierId" defaultValue="" style={inputStyle}><option value="">No supplier link</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select>
                              <select name="labourRateId" defaultValue="" style={inputStyle}><option value="">No labour link</option>{labourRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}</select>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                              <input name="qty" defaultValue="1" placeholder="Qty" style={inputStyle} />
                              <input name="uom" defaultValue="ea" placeholder="UOM" style={inputStyle} />
                              <input name="wastePercent" defaultValue="0" placeholder="Waste %" style={inputStyle} />
                            </div>
                            <button type="submit" style={{ minHeight: 42, borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}>Add component</button>
                          </form>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 20, display: "grid", gap: 14 }}>
                <h3 style={{ margin: 0 }}>Options</h3>
                <p style={{ margin: 0, color: "#475467" }}>Set up selectable options that vary how this product is sold or priced.</p>
                {!selectedTemplate ? (
                  <form action={createOptionsForProductAction} style={{ display: "grid", gap: 10 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />
                    <input type="hidden" name="productName" value={selectedProduct.name} />
                    <input type="hidden" name="department" value={selectedProduct.department} />
                    <input type="hidden" name="productFamily" value={selectedProduct.productFamily} />
                    <button type="submit" style={{ minHeight: 42, borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}>Create options set</button>
                  </form>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ borderRadius: 12, border: "1px solid #e5e7eb", padding: 14, background: "#fafafa" }}>
                      <div style={{ fontWeight: 700 }}>{selectedTemplate.name}</div>
                      <div style={{ marginTop: 4, fontSize: 13, color: "#667085" }}>{optionFields.length} field(s)</div>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {optionFields.length === 0 ? <div style={{ color: "#667085", fontSize: 14 }}>No options yet.</div> : optionFields.map((field, index) => (
                        <div key={field.id ?? `${field.key}-${index}`} style={{ borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff", padding: 12 }}>
                          <div style={{ fontWeight: 700 }}>{field.label ?? field.key ?? "Field"}</div>
                          <div style={{ marginTop: 4, fontSize: 13, color: "#667085" }}>{field.type ?? "text"} · {field.required ? "required" : "optional"}</div>
                        </div>
                      ))}
                    </div>
                    <form action={addOptionForProductAction} style={{ display: "grid", gap: 10 }}>
                      <input type="hidden" name="productId" value={selectedProduct.id} />
                      <input type="hidden" name="templateId" value={selectedTemplate.id} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <input name="label" placeholder="Field label" style={inputStyle} />
                        <input name="key" placeholder="field_key" style={inputStyle} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <select name="type" defaultValue="select" style={inputStyle}><option value="select">Select</option><option value="text">Text</option><option value="quantity">Quantity</option></select>
                        <input name="defaultValue" placeholder="Default value (optional)" style={inputStyle} />
                      </div>
                      <input name="optionsCsv" placeholder="CSV options for select fields e.g. Single,Double" style={inputStyle} />
                      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" name="required" /> Required</label>
                      <button type="submit" style={{ minHeight: 42, borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}>Add option</button>
                    </form>
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
