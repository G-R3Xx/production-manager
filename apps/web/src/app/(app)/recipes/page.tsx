import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import { listSuppliersForTenant } from "@/server/suppliers";
import { listLabourRatesForTenant, listProductRecipesForTenant } from "@/server/recipes";
import { addRecipeComponentAction, createLabourRateAction, createRecipeAction } from "./actions";

type RecipesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 24 } as const;

export default async function RecipesPage({ searchParams }: RecipesPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect('/bootstrap');
  const [products, labourRates, recipes, suppliers] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listLabourRatesForTenant(activeTenant.tenantId),
    listProductRecipesForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId)
  ]);
  const params = (await searchParams) ?? {};
  const message = readParam(params, 'message');
  const error = readParam(params, 'error');
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 16 }}>
      {message ? <section style={{ border: '1px solid #abefc6', background: '#ecfdf3', color: '#067647', borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: '1px solid #fda29b', background: '#fff5f4', color: '#b42318', borderRadius: 16, padding: 16 }}>{error}</section> : null}
      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4f46e5' }}>Recipe foundations</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Product recipes, materials & labour</h1>
        <p style={{ margin: 0, color: '#475467', lineHeight: 1.6 }}>Build the recipe/BOM layer that sits behind sellable products. A product can resolve into supplier materials plus labour components when it is quoted or sold.</p>
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <form action={createLabourRateAction} style={{ ...cardStyle, display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Add labour rate</h2>
            <input name="name" required placeholder="Print labour" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <select name="unit" defaultValue="hour" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }}>
                <option value="hour">hour</option><option value="setup">setup</option><option value="item">item</option>
              </select>
              <input name="costRate" defaultValue="0" placeholder="Cost" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }} />
              <input name="sellRate" defaultValue="0" placeholder="Sell" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }} />
            </div>
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700 }}>Create labour rate</button>
          </form>

          <form action={createRecipeAction} style={{ ...cardStyle, display: 'grid', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Create recipe</h2>
            <select name="productId" defaultValue="" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }}>
              <option value="">Select product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
            <input name="name" required placeholder="Standard production recipe" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input name="yieldQty" defaultValue="1" placeholder="Yield qty" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }} />
              <input name="yieldUom" defaultValue="item" placeholder="Yield uom" style={{ minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px' }} />
            </div>
            <textarea name="notes" rows={2} placeholder="Notes about the product recipe" style={{ borderRadius: 12, border: '1px solid #d0d5dd', padding: 14 }} />
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700 }}>Create recipe</button>
          </form>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Current labour rates</h2>
            {labourRates.length === 0 ? <p style={{ color: '#475467' }}>No labour rates yet.</p> : <div style={{ display: 'grid', gap: 12 }}>{labourRates.map((rate) => <div key={rate.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa' }}><strong>{rate.name}</strong><div style={{ marginTop: 4, color: '#475467', fontSize: 14 }}>{rate.unit} · Cost ${rate.costRate} · Sell ${rate.sellRate}</div></div>)}</div>}
          </section>

          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><h2 style={{ margin: 0 }}>Current recipes</h2><div style={{ color: '#667085', fontSize: 14 }}>{recipes.length} total</div></div>
            {recipes.length === 0 ? <p style={{ color: '#475467' }}>No recipes yet.</p> : <div style={{ display: 'grid', gap: 14 }}>{recipes.map((recipe) => (
              <div key={recipe.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, background: '#fafafa', display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{recipe.name}</div>
                    <div style={{ marginTop: 4, color: '#475467', fontSize: 14 }}>{recipe.productName || 'Unknown product'} · v{recipe.version} · Yield {recipe.yieldQty} {recipe.yieldUom}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#667085', textTransform: 'uppercase', fontWeight: 700 }}>{recipe.status}</div>
                </div>
                <div style={{ color: '#667085', fontSize: 13 }}>Components: {recipe.componentCount}</div>
                <form action={addRecipeComponentAction} style={{ display: 'grid', gap: 10, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <select name="componentType" defaultValue="material" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }}>
                      <option value="material">material</option><option value="labour">labour</option>
                    </select>
                    <input name="name" placeholder="Component name" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }} />
                    <select name="supplierId" defaultValue="" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }}>
                      <option value="">No supplier</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                    <input name="qty" defaultValue="1" placeholder="Qty" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }} />
                    <input name="uom" defaultValue="ea" placeholder="UOM" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }} />
                    <input name="wastePercent" defaultValue="0" placeholder="Waste %" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }} />
                    <select name="labourRateId" defaultValue="" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }}>
                      <option value="">No labour link</option>
                      {labourRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}
                    </select>
                    <input name="costOverride" placeholder="Cost override" style={{ minHeight: 40, borderRadius: 10, border: '1px solid #d0d5dd', padding: '0 12px' }} />
                  </div>
                  <button type="submit" style={{ minHeight: 42, borderRadius: 10, border: '1px solid #111827', background: '#111827', color: '#fff', fontWeight: 700 }}>Add component</button>
                </form>
              </div>
            ))}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
