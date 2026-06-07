import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import { listSuppliersForTenant } from "@/server/suppliers";
import { listMaterialsForTenant } from "@/server/materials";
import { listLabourRatesForTenant, listProductRecipesForTenant, listRecipeComponents } from "@/server/recipes";
import { addRecipeComponentAction, createLabourRateAction, createRecipeAction } from "./actions";

type RecipesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const cardStyle = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 } as const;
const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 15 } as const;
const textareaStyle = { borderRadius: 12, border: "1px solid #d0d5dd", padding: 14, fontSize: 15 } as const;

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const [products, materials, labourRates, recipes, suppliers] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    listLabourRatesForTenant(activeTenant.tenantId),
    listProductRecipesForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId)
  ]);
  const recipeComponents = await Promise.all(recipes.map(async (recipe) => [recipe.id, await listRecipeComponents(recipe.id)] as const));
  const componentMap = new Map(recipeComponents);

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 20 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Recipe component editor</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Materials + labour BOM builder</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Build recipes as a real single-flow BOM editor. Materials come from supplier-linked purchased stock. Labour stays separate. Sellable products point at these recipes later for quote and allocation snapshots.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Products</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{products.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Sellable products ready for recipes</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Materials</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{materials.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Purchased stock items to consume</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Labour rates</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{labourRates.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Internal cost + sell components</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Recipes</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{recipes.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Current BOM records</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 420px) 1fr", gap: 20, alignItems: "start" }}>
        <section style={{ display: "grid", gap: 16 }}>
          <form action={createLabourRateAction} style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0 }}>1. Add labour rate</h2>
            <input name="name" required placeholder="Print labour" style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <select name="unit" defaultValue="hour" style={inputStyle}><option value="hour">hour</option><option value="setup">setup</option><option value="item">item</option></select>
              <input name="costRate" defaultValue="0" placeholder="Cost" style={inputStyle} />
              <input name="sellRate" defaultValue="0" placeholder="Sell" style={inputStyle} />
            </div>
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Create labour rate</button>
          </form>

          <form action={createRecipeAction} style={{ ...cardStyle, display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0 }}>2. Create recipe shell</h2>
            <select name="productId" defaultValue="" style={inputStyle}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
            <input name="name" required placeholder="Standard production recipe" style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input name="yieldQty" defaultValue="1" placeholder="Yield qty" style={inputStyle} />
              <input name="yieldUom" defaultValue="item" placeholder="Yield uom" style={inputStyle} />
            </div>
            <textarea name="notes" rows={3} placeholder="Notes about assumptions, waste rules and usage" style={textareaStyle} />
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Create recipe</button>
          </form>
        </section>

        <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>3. Add materials and labour to recipes</h2>
            <p style={{ margin: "6px 0 0", color: "#475467" }}>This is the real editor flow: each recipe shows current components on the left, with a dedicated component form on the right.</p>
          </div>
          {recipes.length === 0 ? <div style={{ borderRadius: 16, border: "1px dashed #d0d5dd", padding: 24, color: "#475467" }}>No recipes yet. Create a recipe shell first.</div> : (
            <div style={{ display: "grid", gap: 16 }}>
              {recipes.map((recipe) => {
                const components = componentMap.get(recipe.id) ?? [];
                return (
                  <article key={recipe.id} style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, background: "#fafafa", display: "grid", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{recipe.name}</div>
                        <div style={{ marginTop: 6, color: "#475467", fontSize: 14 }}>{recipe.productName || "Unknown product"} · Yield {recipe.yieldQty} {recipe.yieldUom} · Version {recipe.version}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase" }}>{recipe.status}</div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
                      <section style={{ display: "grid", gap: 12 }}>
                        <div style={{ fontWeight: 700 }}>Current recipe components</div>
                        {components.length === 0 ? <div style={{ color: "#475467" }}>No components yet.</div> : components.map((component) => (
                          <div key={component.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div style={{ fontWeight: 700 }}>{component.name}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase" }}>{component.componentType}</div>
                            </div>
                            <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>Qty {component.qty} {component.uom} · Waste {component.wastePercent}%</div>
                            {component.notes ? <div style={{ marginTop: 6, color: "#667085", fontSize: 13 }}>{component.notes}</div> : null}
                          </div>
                        ))}
                      </section>

                      <form action={addRecipeComponentAction} style={{ display: "grid", gap: 12, border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fff" }}>
                        <input type="hidden" name="recipeId" value={recipe.id} />
                        <div style={{ fontWeight: 700 }}>Add recipe component</div>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Component type</span><select name="componentType" defaultValue="material" style={inputStyle}><option value="material">Material</option><option value="labour">Labour</option><option value="other">Other</option></select></label>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Name</span><input name="name" placeholder="Printed vinyl" style={inputStyle} /></label>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Material</span><select name="materialId" defaultValue="" style={inputStyle}><option value="">No linked material</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Labour rate</span><select name="labourRateId" defaultValue="" style={inputStyle}><option value="">No linked labour rate</option>{labourRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}</select></label>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Supplier</span><select name="supplierId" defaultValue="" style={inputStyle}><option value="">No supplier link</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select></label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                          <input name="qty" defaultValue="1" placeholder="Qty" style={inputStyle} />
                          <input name="uom" defaultValue="ea" placeholder="UOM" style={inputStyle} />
                          <input name="wastePercent" defaultValue="0" placeholder="Waste %" style={inputStyle} />
                        </div>
                        <input name="costOverride" placeholder="Optional cost override" style={inputStyle} />
                        <textarea name="notes" rows={2} placeholder="Component notes" style={textareaStyle} />
                        <button type="submit" style={{ minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Add component</button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
