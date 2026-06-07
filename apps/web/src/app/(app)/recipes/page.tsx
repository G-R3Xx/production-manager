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
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Recipe foundations</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Product recipes, materials & labour</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Build recipes using purchased materials plus labour components. The goal is supplier → material → recipe → sellable product, so stock allocates from raw materials rather than the final product line.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Products</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{products.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Sellable products available for recipes</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Materials</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{materials.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Purchased stock records</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Labour rates</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{labourRates.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Internal cost and sell rates</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Recipes</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{recipes.length}</div><div style={{ marginTop: 8, color: "#475467" }}>BOM foundations ready for quote snapshots</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, alignItems: "start" }}>
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
          <h2 style={{ margin: 0 }}>2. Create recipe</h2>
          <select name="productId" defaultValue="" style={inputStyle}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
          <input name="name" required placeholder="Standard production recipe" style={inputStyle} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input name="yieldQty" defaultValue="1" placeholder="Yield qty" style={inputStyle} />
            <input name="yieldUom" defaultValue="item" placeholder="Yield uom" style={inputStyle} />
          </div>
          <textarea name="notes" rows={3} placeholder="Notes about the recipe, supplier assumptions and waste rules" style={textareaStyle} />
          <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Create recipe</button>
        </form>

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0 }}>Current foundations</h2>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#fafafa" }}>
            <div style={{ fontWeight: 700 }}>Materials page</div>
            <div style={{ marginTop: 6, color: "#475467", lineHeight: 1.5 }}>Create purchased stock items on the Materials page first, then attach them to recipes here.</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#fafafa" }}>
            <div style={{ fontWeight: 700 }}>Labour rates</div>
            <div style={{ marginTop: 6, color: "#475467", lineHeight: 1.5 }}>{labourRates.length === 0 ? "No labour rates yet." : `${labourRates.length} labour rates ready to use in recipes.`}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#fafafa" }}>
            <div style={{ fontWeight: 700 }}>Suppliers available</div>
            <div style={{ marginTop: 6, color: "#475467", lineHeight: 1.5 }}>{suppliers.length} supplier records imported from MYOB are available to link to materials and recipe components.</div>
          </div>
        </section>
      </div>

      <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Current recipes</h2>
            <p style={{ margin: '6px 0 0', color: '#475467' }}>Each recipe can consume materials and labour. Keep the recipe builder in a single vertical flow so it is actually usable.</p>
          </div>
          <div style={{ color: '#667085', fontSize: 14 }}>{recipes.length} total</div>
        </div>
        {recipes.length === 0 ? <div style={{ borderRadius: 16, border: '1px dashed #d0d5dd', padding: 24, color: '#475467' }}>No recipes yet. Create a labour rate, create a material, then build the first recipe for a sellable product.</div> : (
          <div style={{ display: 'grid', gap: 16 }}>
            {recipes.map((recipe) => {
              const components = componentMap.get(recipe.id) ?? [];
              return (
                <article key={recipe.id} style={{ border: '1px solid #e5e7eb', borderRadius: 18, padding: 20, background: '#fafafa', display: 'grid', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{recipe.name}</div>
                      <div style={{ marginTop: 6, color: '#475467', fontSize: 14 }}>{recipe.productName || 'Unknown product'} · Version {recipe.version} · Yield {recipe.yieldQty} {recipe.yieldUom}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>{recipe.status}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div style={{ fontWeight: 700 }}>Current components</div>
                      {components.length === 0 ? <div style={{ color: '#667085' }}>No components yet.</div> : components.map((component) => (
                        <div key={component.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: '#fff' }}>
                          <div style={{ fontWeight: 700 }}>{component.name}</div>
                          <div style={{ marginTop: 4, color: '#475467', fontSize: 14 }}>{component.componentType} · Qty {component.qty} {component.uom} · Waste {component.wastePercent}%</div>
                          <div style={{ marginTop: 4, color: '#667085', fontSize: 13 }}>Supplier link: {component.supplierId ?? '—'} · Material link: {component.materialId ?? '—'} · Labour link: {component.labourRateId ?? '—'}</div>
                        </div>
                      ))}
                    </div>

                    <form action={addRecipeComponentAction} style={{ display: 'grid', gap: 10, border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: '#fff' }}>
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <div style={{ fontWeight: 700 }}>Add component</div>
                      <select name="componentType" defaultValue="material" style={inputStyle}><option value="material">material</option><option value="labour">labour</option></select>
                      <input name="name" placeholder="Component name" style={inputStyle} />
                      <select name="materialId" defaultValue="" style={inputStyle}><option value="">No material link</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select>
                      <select name="supplierId" defaultValue="" style={inputStyle}><option value="">No supplier link</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select>
                      <select name="labourRateId" defaultValue="" style={inputStyle}><option value="">No labour link</option>{labourRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}</select>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <input name="qty" defaultValue="1" placeholder="Qty" style={inputStyle} />
                        <input name="uom" defaultValue="ea" placeholder="UOM" style={inputStyle} />
                        <input name="wastePercent" defaultValue="0" placeholder="Waste %" style={inputStyle} />
                      </div>
                      <input name="costOverride" placeholder="Cost override (optional)" style={inputStyle} />
                      <textarea name="notes" rows={2} placeholder="Component notes" style={textareaStyle} />
                      <button type="submit" style={{ minHeight: 42, borderRadius: 10, border: '1px solid #111827', background: '#111827', color: '#fff', fontWeight: 700 }}>Add component</button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
