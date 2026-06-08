import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import { listSuppliersForTenant } from "@/server/suppliers";
import { listMaterialsForTenant } from "@/server/materials";
import { createMaterialAction } from "./actions";

type MaterialsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: 24 } as const;
const inputStyle = { minHeight: 44, borderRadius: 12, border: '1px solid #d0d5dd', padding: '0 14px', fontSize: 15 } as const;
const textareaStyle = { borderRadius: 12, border: '1px solid #d0d5dd', padding: 14, fontSize: 15 } as const;

export default async function MaterialsPage({ searchParams }: MaterialsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect('/bootstrap');

  const [materials, suppliers, products] = await Promise.all([
    listMaterialsForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId),
    listProductsForTenant(activeTenant.tenantId)
  ]);

  const params = (await searchParams) ?? {};
  const message = readParam(params, 'message');
  const error = readParam(params, 'error');

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gap: 20 }}>
      {message ? <section style={{ border: '1px solid #abefc6', background: '#ecfdf3', color: '#067647', borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: '1px solid #fda29b', background: '#fff5f4', color: '#b42318', borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4f46e5' }}>Materials foundation</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Purchased materials & stock units</h1>
        <p style={{ margin: 0, color: '#475467', lineHeight: 1.6 }}>
          Suppliers sell you materials, not finished sellable products. Use this layer to define the raw sheets, rolls, card, paper and consumables that product components will consume.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Materials</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{materials.length}</div><div style={{ marginTop: 8, color: '#475467' }}>Raw materials in stock model</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Suppliers</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{suppliers.length}</div><div style={{ marginTop: 8, color: '#475467' }}>Imported or linked supplier records</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Products</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{products.length}</div><div style={{ marginTop: 8, color: '#475467' }}>Sellable products available for components</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>Model</div><div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>Supplier → Material → Product component</div><div style={{ marginTop: 8, color: '#475467' }}>Allocate stock from materials when products are sold.</div></div>
      </div>

      <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Create material</h2>
          <p style={{ margin: '8px 0 0', color: '#475467' }}>Set up one purchased stock item at a time. Keep supplier, stock unit, cost and size information together here.</p>
        </div>
        <form action={createMaterialAction} style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Material name</span><input name="name" required placeholder="3mm ACM 2440 x 1220" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Supplier</span><select name="supplierId" defaultValue="" style={inputStyle}><option value="">No supplier linked</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Linked sellable product</span><select name="sourceProductId" defaultValue="" style={inputStyle}><option value="">No linked product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Supplier SKU</span><input name="sku" placeholder="ACM-3-2440" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Material type</span><select name="materialType" defaultValue="sheet_media" style={inputStyle}><option value="sheet_media">Sheet</option><option value="roll_media">Roll media</option><option value="roll_laminate">Roll laminate</option><option value="paper_stock">Paper stock</option><option value="card_stock">Card stock</option><option value="fixing">Hardware / fixing</option><option value="item">Consumable / item</option><option value="other">Other</option></select></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Purchase cost</span><input name="purchaseCost" defaultValue="0" style={inputStyle} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Stock UOM</span><input name="stockUom" defaultValue="sheet" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Purchase UOM</span><input name="purchaseUom" defaultValue="sheet" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Opening stock qty</span><input name="stockQuantity" defaultValue="0" style={inputStyle} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Width mm</span><input name="widthMm" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Length mm</span><input name="lengthMm" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Roll width mm</span><input name="rollWidthMm" style={inputStyle} /></label>
            <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>GSM</span><input name="gsm" style={inputStyle} /></label>
          </div>
          <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Notes</span><textarea name="notes" rows={3} placeholder="Purchased stock notes, parent sheet size, nesting notes, wastage assumptions" style={textareaStyle} /></label>
          <button type="submit" style={{ minHeight: 48, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700 }}>Create material</button>
        </form>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Current materials</h2>
            <p style={{ margin: '6px 0 0', color: '#475467' }}>These are the raw inputs that product components should consume when a product is quoted or sold.</p>
          </div>
          <div style={{ color: '#667085', fontSize: 14 }}>{materials.length} total</div>
        </div>
        {materials.length === 0 ? (
          <div style={{ borderRadius: 16, border: '1px dashed #d0d5dd', padding: 24, color: '#475467' }}>No materials yet. Create sheet, roll, paper and hardware materials here before attaching them to products.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {materials.map((material) => (
              <div key={material.id} style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 16, background: '#fafafa', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{material.name}</div>
                    <div style={{ marginTop: 4, color: '#475467', fontSize: 14 }}>{material.materialType} · Stock {material.stockQuantity} {material.stockUom} · Cost ${material.purchaseCost}/{material.purchaseUom}</div>
                  </div>
                  <div style={{ textTransform: 'uppercase', color: '#667085', fontSize: 12, fontWeight: 700 }}>{material.active ? 'active' : 'inactive'}</div>
                </div>
                <div style={{ color: '#667085', fontSize: 13 }}>Supplier: {material.supplierName ?? 'Not linked'} · Product link: {material.sourceProductName ?? 'Not linked'} · SKU: {material.sku ?? '—'}</div>
                <div style={{ color: '#667085', fontSize: 13 }}>Dimensions: {material.widthMm ?? '—'}w × {material.lengthMm ?? '—'}l · Roll width {material.rollWidthMm ?? '—'} · GSM {material.gsm ?? '—'}</div>
                {material.notes ? <div style={{ color: '#667085', fontSize: 13 }}>{material.notes}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
