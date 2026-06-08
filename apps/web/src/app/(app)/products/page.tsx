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
  const inputStyle: React.CSSProperties = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Products</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Create a product, select it, then complete setup on the same page. <strong>Components</strong> describe what the product uses. <strong>Options</strong> describe what can vary. Tax code defaults to GST.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <form action={createProductAction} style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0 }}>Add product</h2>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Product name</span><input name="name" required placeholder="5mm Corflute Sign" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>SKU</span><input name="sku" placeholder="COR-5MM-SIGN" style={inputStyle} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Department</span><select name="department" defaultValue="signage" style={inputStyle}><option value="signage">Signage</option><option value="small_format">Small format</option><option value="installation">Installation</option><option value="general">General</option></select></label>
              <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Status</span><select name="status" defaultValue="draft" style={inputStyle}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
            </div>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Product family</span><select name="productFamily" defaultValue="rigid_signage" style={inputStyle}><option value="rigid_signage">Rigid signage</option><option value="roll_media">Roll media</option><option value="banners">Banners</option><option value="stickers_labels">Stickers / labels</option><option value="window_wall_graphics">Window / wall graphics</option><option value="vehicle_graphics">Vehicle graphics</option><option value="display_products">Display products</option><option value="small_format_print">Small format print</option></select></label>
            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Create product</button>
          </form>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>Find product</h2>
                <p style={{ margin: "6px 0 0", color: "#475467" }}>Search and open one product at a time.</p>
              </div>
              <div style={{ fontSize: 13, color: "#667085" }}>{products.length} total</div>
            </div>
            <form method="GET" action="/products" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <input type="text" name="q" defaultValue={query} placeholder="Search by name, SKU, or family" style={inputStyle} />
              <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>Search</button>
            </form>
            <div style={{ display: "grid", gap: 10 }}>
              {filteredProducts.slice(0, 8).map((product) => {
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
              <div style={{ display: "grid", gap: 10, marginTop: 14, maxHeight: 360, overflowY: 'auto' }}>
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

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
            <h2 style={{ margin: 0 }}>Selected product</h2>
            {!selectedProduct ? <p style={{ margin: 0, color: '#475467' }}>Select a product above to edit its details, components and options.</p> : (
              <>
                <form action={updateProductAction} style={{ display: 'grid', gap: 14 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Product name</span><input name="name" required defaultValue={selectedProduct.name} style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>SKU</span><input name="sku" defaultValue={selectedProduct.sku ?? ''} style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Department</span><select name="department" defaultValue={selectedProduct.department} style={inputStyle}><option value="signage">Signage</option><option value="small_format">Small format</option><option value="installation">Installation</option><option value="general">General</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Product family</span><select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}><option value="rigid_signage">Rigid signage</option><option value="roll_media">Roll media</option><option value="banners">Banners</option><option value="stickers_labels">Stickers / labels</option><option value="window_wall_graphics">Window / wall graphics</option><option value="vehicle_graphics">Vehicle graphics</option><option value="display_products">Display products</option><option value="small_format_print">Small format print</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Status</span><select name="status" defaultValue={selectedProduct.status} style={inputStyle}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
                  </div>
                  <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Save product</button>
                </form>
              </>
            )}
          </section>

          {selectedProduct ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
              <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Components</h2>
                  <p style={{ margin: '6px 0 0', color: '#475467' }}>Add the materials and labour used by this product.</p>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {editorDefinition.components.length === 0 ? <p style={{ margin: 0, color: '#475467' }}>No components yet.</p> : editorDefinition.components.map((component) => {
                    const material = materials.find((item) => item.id === component.materialId);
                    const supplier = suppliers.find((item) => item.id === component.supplierId);
                    return (
                      <div key={component.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: '#fafafa' }}>
                        <div style={{ fontWeight: 700 }}>{component.label}</div>
                        <div style={{ marginTop: 6, fontSize: 14, color: '#475467' }}>{component.kind} · {component.quantity} {component.unit}</div>
                        {material ? <div style={{ marginTop: 6, fontSize: 14, color: '#475467' }}>Material: {material.name}</div> : null}
                        {supplier ? <div style={{ marginTop: 6, fontSize: 14, color: '#475467' }}>Supplier: {supplier.displayName}</div> : null}
                        {component.notes ? <div style={{ marginTop: 6, fontSize: 14, color: '#475467' }}>Notes: {component.notes}</div> : null}
                      </div>
                    );
                  })}
                </div>

                <form action={addProductComponentAction} style={{ display: 'grid', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Kind</span><select name="componentKind" defaultValue="material" style={inputStyle}><option value="material">Material</option><option value="labour">Labour</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Material</span><select name="materialId" defaultValue="" style={inputStyle}><option value="">Optional</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Supplier</span><select name="supplierId" defaultValue="" style={inputStyle}><option value="">Optional</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Label</span><input name="label" placeholder="Print labour" style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Quantity</span><input name="quantity" defaultValue="1" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Unit</span><input name="unit" defaultValue="each" style={inputStyle} /></label>
                  </div>
                  <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Notes</span><input name="notes" placeholder="Optional notes" style={inputStyle} /></label>
                  <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Add component</button>
                </form>
              </section>

              <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Options</h2>
                  <p style={{ margin: '6px 0 0', color: '#475467' }}>Define what can vary for this product, such as size, sides, finish or quantity.</p>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {editorDefinition.fields.length === 0 ? <p style={{ margin: 0, color: '#475467' }}>No options yet.</p> : editorDefinition.fields.map((field) => (
                    <div key={field.id} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, background: '#fafafa' }}>
                      <div style={{ fontWeight: 700 }}>{field.label}</div>
                      <div style={{ marginTop: 6, fontSize: 14, color: '#475467' }}>{field.type} · key: {field.key}{field.required ? ' · required' : ''}</div>
                      {Array.isArray(field.options) && field.options.length > 0 ? <div style={{ marginTop: 6, fontSize: 14, color: '#475467' }}>Options: {field.options.map((option: any) => option.label ?? option.value).join(', ')}</div> : null}
                    </div>
                  ))}
                </div>

                <form action={addProductOptionAction} style={{ display: 'grid', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Label</span><input name="label" placeholder="Sides" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Key</span><input name="key" placeholder="sides" style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Field type</span><select name="fieldType" defaultValue="select" style={inputStyle}><option value="select">Select</option><option value="text">Text</option><option value="quantity">Quantity</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Required</span><select name="required" defaultValue="yes" style={inputStyle}><option value="yes">Yes</option><option value="no">No</option></select></label>
                  </div>
                  <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Select options (CSV)</span><input name="optionsCsv" placeholder="Single sided, Double sided" style={inputStyle} /></label>
                  <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Add option</button>
                </form>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
