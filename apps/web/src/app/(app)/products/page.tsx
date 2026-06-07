import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listConfiguratorTemplatesForTenant } from "@/server/configurators";
import { listProductsForTenant } from "@/server/products";
import { listMaterialsForTenant } from "@/server/materials";
import { listSuppliersForTenant } from "@/server/suppliers";
import {
  listLabourRatesForTenant,
  listProductRecipesForTenant,
  listRecipeComponents
} from "@/server/recipes";
import { createProductAction } from "./actions";
import {
  createLabourRateAction,
  createRecipeAction,
  addRecipeComponentAction
} from "../recipes/actions";
import {
  createConfiguratorTemplateAction,
  addConfiguratorFieldAction
} from "../configurators/actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 24
} as const;

const inputStyle = {
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "0 14px",
  fontSize: 15
} as const;

const textareaStyle = {
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: 14,
  fontSize: 15
} as const;

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const [products, templates, materials, suppliers, labourRates, recipes] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listConfiguratorTemplatesForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId),
    listLabourRatesForTenant(activeTenant.tenantId),
    listProductRecipesForTenant(activeTenant.tenantId)
  ]);
  const recipeComponents = await Promise.all(recipes.map(async (recipe) => [recipe.id, await listRecipeComponents(recipe.id)] as const));
  const componentMap = new Map(recipeComponents);

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const requestedProductId = readParam(params, "productId");
  const selectedProduct = products.find((product) => product.id === requestedProductId) ?? products[0] ?? null;
  const selectedRecipes = selectedProduct ? recipes.filter((recipe) => recipe.productId === selectedProduct.id) : [];
  const selectedTemplate = selectedProduct?.defaultTemplateId
    ? templates.find((template) => template.id === selectedProduct.defaultTemplateId) ?? null
    : null;
  const availableTemplates = templates.filter((template) =>
    selectedProduct ? template.department === selectedProduct.department : true
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 20 }}>
      {message ? (
        <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>
          {message}
        </section>
      ) : null}

      {error ? (
        <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>
          {error}
        </section>
      ) : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Product setup
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Products</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Keep setup simple: <strong>Materials</strong> are what you buy, <strong>Products</strong> are what you sell.
          Each product then has <strong>Components</strong> (materials + labour) and <strong>Options</strong> (configurator fields) managed here instead of separate pages.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
        <form action={createProductAction} style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0 }}>Add product</h2>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Product name</span>
            <input name="name" required placeholder="5mm Corflute Sign" style={inputStyle} />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>SKU</span>
            <input name="sku" placeholder="COR-5MM-SIGN" style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Department</span>
              <select name="department" defaultValue="signage" style={inputStyle}>
                <option value="signage">Signage</option>
                <option value="small_format">Small format</option>
                <option value="installation">Installation</option>
                <option value="general">General</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Status</span>
              <select name="status" defaultValue="draft" style={inputStyle}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Product family</span>
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

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Default configurator</span>
            <select name="defaultTemplateId" defaultValue="" style={inputStyle}>
              <option value="">None yet</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Tax code</span>
            <input name="taxCode" placeholder="GST" style={inputStyle} />
          </label>

          <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Create product
          </button>
        </form>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Current products</h2>
          {products.length === 0 ? (
            <p style={{ color: "#475467" }}>No products yet. Add your first product from the form.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {products.map((product) => {
                const productRecipeCount = recipes.filter((recipe) => recipe.productId === product.id).length;
                return (
                  <a
                    key={product.id}
                    href={`/products?productId=${product.id}`}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: selectedProduct?.id === product.id ? "#eef2ff" : "#fafafa", textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{product.name}</div>
                        <div style={{ marginTop: 6, color: "#475467", fontSize: 14 }}>
                          {product.sku || "No SKU"} · {product.department} · {product.productFamily}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase" }}>
                        {product.status}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, color: "#475467", fontSize: 14 }}>
                      Components: {productRecipeCount} recipe{productRecipeCount === 1 ? "" : "s"} · Options: {product.templateName ? product.templateName : "No configurator linked"}
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
              Product builder
            </p>
            <h2 style={{ marginTop: 8, marginBottom: 8 }}>
              {selectedProduct ? selectedProduct.name : "Select a product"}
            </h2>
            <p style={{ margin: 0, color: "#475467" }}>
              Manage <strong>Components</strong> and <strong>Options</strong> inside the product workflow.
            </p>
          </div>
          {selectedProduct ? (
            <div style={{ fontSize: 14, color: "#475467" }}>
              {selectedProduct.sku || "No SKU"} · {selectedProduct.department} · {selectedProduct.productFamily}
            </div>
          ) : null}
        </div>

        {!selectedProduct ? (
          <div style={{ borderRadius: 16, border: "1px dashed #d0d5dd", padding: 24, color: "#475467" }}>
            Create or select a product to set up components and options.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
            <section style={{ display: "grid", gap: 16 }}>
              <div style={{ ...cardStyle, padding: 20 }}>
                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Components</h3>
                <p style={{ margin: 0, color: "#475467" }}>Components replace the old Recipes page. Use recipes to define what materials and labour this product uses.</p>
              </div>

              <form action={createLabourRateAction} style={{ ...cardStyle, display: "grid", gap: 12 }}>
                <h3 style={{ margin: 0 }}>Add labour rate</h3>
                <input name="name" required placeholder="Print labour" style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <select name="unit" defaultValue="hour" style={inputStyle}><option value="hour">hour</option><option value="setup">setup</option><option value="item">item</option></select>
                  <input name="costRate" defaultValue="0" placeholder="Cost" style={inputStyle} />
                  <input name="sellRate" defaultValue="0" placeholder="Sell" style={inputStyle} />
                </div>
                <button type="submit" style={{ minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Create labour rate</button>
              </form>

              <form action={createRecipeAction} style={{ ...cardStyle, display: "grid", gap: 12 }}>
                <h3 style={{ margin: 0 }}>Create component set</h3>
                <input type="hidden" name="productId" value={selectedProduct.id} />
                <input name="name" required placeholder={`${selectedProduct.name} standard build`} style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <input name="yieldQty" defaultValue="1" placeholder="Yield qty" style={inputStyle} />
                  <input name="yieldUom" defaultValue="item" placeholder="Yield uom" style={inputStyle} />
                </div>
                <textarea name="notes" rows={3} placeholder="Assumptions, wastage and production notes" style={textareaStyle} />
                <button type="submit" style={{ minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Create component set</button>
              </form>

              <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
                <h3 style={{ margin: 0 }}>Current component sets</h3>
                {selectedRecipes.length === 0 ? <div style={{ color: "#475467" }}>No component sets for this product yet.</div> : selectedRecipes.map((recipe) => {
                  const components = componentMap.get(recipe.id) ?? [];
                  return (
                    <article key={recipe.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fafafa", display: "grid", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{recipe.name}</div>
                        <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>Yield {recipe.yieldQty} {recipe.yieldUom} · {components.length} components</div>
                      </div>
                      {components.length > 0 ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          {components.map((component) => (
                            <div key={component.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                                <div style={{ fontWeight: 600 }}>{component.name}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#667085" }}>{component.componentType}</div>
                              </div>
                              <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>Qty {component.qty} {component.uom} · Waste {component.wastePercent}%</div>
                            </div>
                          ))}
                        </div>
                      ) : <div style={{ color: "#475467" }}>No components yet.</div>}

                      <form action={addRecipeComponentAction} style={{ display: "grid", gap: 10, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                        <input type="hidden" name="recipeId" value={recipe.id} />
                        <div style={{ fontWeight: 700 }}>Add component</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <select name="componentType" defaultValue="material" style={inputStyle}><option value="material">Material</option><option value="labour">Labour</option><option value="supplier">Supplier</option><option value="other">Other</option></select>
                          <input name="name" placeholder="Printed vinyl" style={inputStyle} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <select name="materialId" defaultValue="" style={inputStyle}><option value="">Material (optional)</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select>
                          <select name="labourRateId" defaultValue="" style={inputStyle}><option value="">Labour rate (optional)</option>{labourRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}</select>
                        </div>
                        <select name="supplierId" defaultValue="" style={inputStyle}><option value="">Supplier (optional)</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                          <input name="qty" defaultValue="1" placeholder="Qty" style={inputStyle} />
                          <input name="uom" defaultValue="ea" placeholder="UOM" style={inputStyle} />
                          <input name="wastePercent" defaultValue="0" placeholder="Waste %" style={inputStyle} />
                        </div>
                        <textarea name="notes" rows={2} placeholder="Optional notes" style={textareaStyle} />
                        <button type="submit" style={{ minHeight: 40, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Add component</button>
                      </form>
                    </article>
                  );
                })}
              </section>
            </section>

            <section style={{ display: "grid", gap: 16 }}>
              <div style={{ ...cardStyle, padding: 20 }}>
                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Options</h3>
                <p style={{ margin: 0, color: "#475467" }}>Options replace the old Configurators page. Use them for customer/staff choices like size, finish, sides and quantity.</p>
              </div>

              {!selectedTemplate ? (
                <form action={createConfiguratorTemplateAction} style={{ ...cardStyle, display: "grid", gap: 12 }}>
                  <h3 style={{ margin: 0 }}>Create options template</h3>
                  <input type="hidden" name="name" value={selectedProduct.name} />
                  <input type="hidden" name="department" value={selectedProduct.department} />
                  <input type="hidden" name="productFamily" value={selectedProduct.productFamily} />
                  <input type="hidden" name="status" value="draft" />
                  <div style={{ color: "#475467" }}>No configurator linked yet. Create a starter options template for this product.</div>
                  <button type="submit" style={{ minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Create options template</button>
                </form>
              ) : (
                <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selectedTemplate.name}</h3>
                    <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>{selectedTemplate.department} · {selectedTemplate.productFamily}</div>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {Array.isArray(selectedTemplate.definitionJson?.fields) && selectedTemplate.definitionJson.fields.length > 0 ? selectedTemplate.definitionJson.fields.map((field: any) => (
                      <div key={field.id || field.key} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontWeight: 600 }}>{field.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#667085" }}>{field.type}</div>
                        </div>
                        <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>Key: {field.key} {field.required ? "· Required" : "· Optional"}</div>
                      </div>
                    )) : <div style={{ color: "#475467" }}>No fields yet.</div>}
                  </div>

                  <form action={addConfiguratorFieldAction} style={{ display: "grid", gap: 10, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                    <input type="hidden" name="templateId" value={selectedTemplate.id} />
                    <div style={{ fontWeight: 700 }}>Add option field</div>
                    <input name="label" placeholder="Finish" style={inputStyle} />
                    <input name="key" placeholder="finish" style={inputStyle} />
                    <select name="type" defaultValue="select" style={inputStyle}><option value="select">Select</option><option value="text">Text</option><option value="quantity">Quantity</option></select>
                    <textarea name="optionsCsv" rows={3} placeholder="Gloss, Matte, No laminate" style={textareaStyle} />
                    <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" name="required" defaultChecked /><span style={{ fontWeight: 600 }}>Required field</span></label>
                    <button type="submit" style={{ minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Add option field</button>
                  </form>
                </section>
              )}

              {availableTemplates.length > 1 ? (
                <section style={{ ...cardStyle, display: "grid", gap: 10 }}>
                  <h3 style={{ margin: 0 }}>Other option templates</h3>
                  {availableTemplates.filter((template) => template.id !== selectedTemplate?.id).map((template) => (
                    <div key={template.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
                      <div style={{ fontWeight: 600 }}>{template.name}</div>
                      <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>Use this as the product default template from the product form above if needed.</div>
                    </div>
                  ))}
                </section>
              ) : null}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
