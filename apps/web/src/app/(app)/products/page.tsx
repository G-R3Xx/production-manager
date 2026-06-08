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
  components: Array<Record<string, any>>;
  fields: Array<Record<string, any>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase());
}

function labelForFieldType(value: string): string {
  switch (value) {
    case "yes_no": return "Yes / No";
    case "select": return "Select";
    case "quantity": return "Quantity";
    case "number": return "Number";
    case "color": return "Colour";
    case "binding": return "Binding";
    default: return value || "Text";
  }
}

function labelForRuleType(value: string): string {
  switch (value) {
    case "fixed": return "Fixed qty";
    case "per_unit": return "Per unit sold";
    case "per_sqm": return "Per sqm";
    case "per_linear_metre": return "Per linear metre";
    case "per_sheet": return "Per sheet";
    case "yield_based": return "Yield based";
    case "selected_by_option": return "Selected by option";
    default: return value || "Fixed qty";
  }
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

  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 };
  const inputStyle: React.CSSProperties = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 };
  const textareaStyle: React.CSSProperties = { borderRadius: 12, border: "1px solid #d0d5dd", padding: 14, fontSize: 15 };
  const pillStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 700 };

  return (
    <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Products</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Create a product, select it, then complete setup on the same page. <strong>Components</strong> can now use smarter rules like per unit, per sqm or option-triggered usage. <strong>Options</strong> can now define selectable production rules like sides, laminate, binding or duplicate/triplicate copy setups.
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
                  <input type="hidden" name="defaultTemplateId" value={selectedProduct.defaultTemplateId ?? ''} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Product name</span><input name="name" required defaultValue={selectedProduct.name} style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>SKU</span><input name="sku" defaultValue={selectedProduct.sku ?? ''} style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Department</span><select name="department" defaultValue={selectedProduct.department} style={inputStyle}><option value="signage">Signage</option><option value="small_format">Small format</option><option value="installation">Installation</option><option value="general">General</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Product family</span><select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}><option value="rigid_signage">Rigid signage</option><option value="roll_media">Roll media</option><option value="banners">Banners</option><option value="stickers_labels">Stickers / labels</option><option value="window_wall_graphics">Window / wall graphics</option><option value="vehicle_graphics">Vehicle graphics</option><option value="display_products">Display products</option><option value="small_format_print">Small format print</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Status</span><select name="status" defaultValue={selectedProduct.status} style={inputStyle}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
                  </div>
                  <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700 }}>Save product</button>
                </form>
              </>
            )}
          </section>

          {selectedProduct ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
              <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Components</h2>
                  <p style={{ margin: '8px 0 0', color: '#475467' }}>Define what this product uses, including fixed usage, per-sqm rules, roll metre usage and option-triggered components.</p>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {editorDefinition.components.length === 0 ? <p style={{ margin: 0, color: '#667085' }}>No components yet.</p> : editorDefinition.components.map((component) => {
                    const material = component.materialId ? materialMap.get(component.materialId) : null;
                    const supplier = component.supplierId ? supplierMap.get(component.supplierId) : null;
                    return (
                      <div key={component.id} style={{ border: '1px solid #e5e7eb', background: '#fafafa', borderRadius: 14, padding: 14, display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <div style={{ fontWeight: 700 }}>{component.label}</div>
                          <span style={pillStyle}>{component.kind}</span>
                        </div>
                        <div style={{ fontSize: 14, color: '#475467' }}>
                          {labelForRuleType(component.ruleType)} · {component.quantity} {component.unit} {component.wastePercent ? `· ${component.wastePercent}% waste` : ''}
                        </div>
                        <div style={{ fontSize: 13, color: '#667085' }}>
                          Material: {material?.name ?? '—'} · Supplier: {supplier?.displayName ?? '—'} · Labour: {component.labourRateName ?? '—'}
                        </div>
                        {component.trigger?.optionKey ? <div style={{ fontSize: 13, color: '#667085' }}>Trigger: {component.trigger.optionKey} = {component.trigger.optionValue || 'any selected value'}</div> : null}
                        {component.notes ? <div style={{ fontSize: 13, color: '#667085' }}>{component.notes}</div> : null}
                      </div>
                    );
                  })}
                </div>
                <form action={addProductComponentAction} style={{ display: 'grid', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <h3 style={{ margin: 0 }}>Add component rule</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Kind</span><select name="componentKind" defaultValue="material" style={inputStyle}><option value="material">Material</option><option value="labour">Labour</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Rule type</span><select name="ruleType" defaultValue="fixed" style={inputStyle}><option value="fixed">Fixed qty</option><option value="per_unit">Per unit sold</option><option value="per_sqm">Per sqm</option><option value="per_linear_metre">Per linear metre</option><option value="per_sheet">Per sheet</option><option value="yield_based">Yield based</option><option value="selected_by_option">Selected by option</option></select></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Material</span><select name="materialId" defaultValue="" style={inputStyle}><option value="">No material selected</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Supplier</span><select name="supplierId" defaultValue="" style={inputStyle}><option value="">No supplier selected</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}</select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Labour label</span><input name="labourRateName" placeholder="Print labour" style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Label</span><input name="label" placeholder="Printed ACM face" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Quantity</span><input name="quantity" defaultValue="1" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Unit</span><input name="unit" defaultValue="each" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Waste %</span><input name="wastePercent" defaultValue="0" style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Triggered by option key</span><input name="triggerOptionKey" placeholder="sides" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Triggered by option value</span><input name="triggerOptionValue" placeholder="double_sided" style={inputStyle} /></label>
                  </div>
                  <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Notes</span><textarea name="notes" rows={3} placeholder="Explain yield assumptions, sqm maths, parent sheet usage or stock logic." style={textareaStyle} /></label>
                  <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700 }}>Add component</button>
                </form>
              </section>

              <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Options</h2>
                  <p style={{ margin: '8px 0 0', color: '#475467' }}>Options can drive component selection, quantities, labour and finishing choices such as sides, laminate, binding, copy colours or duplicate/triplicate sets.</p>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {editorDefinition.fields.length === 0 ? <p style={{ margin: 0, color: '#667085' }}>No options yet.</p> : editorDefinition.fields.map((field) => (
                    <div key={field.id} style={{ border: '1px solid #e5e7eb', background: '#fafafa', borderRadius: 14, padding: 14, display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontWeight: 700 }}>{field.label}</div>
                        <span style={pillStyle}>{labelForFieldType(field.type)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#667085' }}>Key: {field.key} · Required: {field.required ? 'Yes' : 'No'} {field.defaultValue ? `· Default: ${field.defaultValue}` : ''}</div>
                      {Array.isArray(field.options) && field.options.length > 0 ? <div style={{ fontSize: 13, color: '#667085' }}>Choices: {field.options.map((option: any) => option.label).join(', ')}</div> : null}
                      {field.rule ? <div style={{ fontSize: 13, color: '#667085' }}>Rule: {field.rule.effectType || 'none'} → {field.rule.effectTarget || '—'} {field.rule.effectValue ? `(${field.rule.effectValue}${field.rule.effectUnit ? ` ${field.rule.effectUnit}` : ''})` : ''}</div> : null}
                      {field.helpText ? <div style={{ fontSize: 13, color: '#667085' }}>{field.helpText}</div> : null}
                    </div>
                  ))}
                </div>
                <form action={addProductOptionAction} style={{ display: 'grid', gap: 12, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <h3 style={{ margin: 0 }}>Add option rule</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Label</span><input name="label" placeholder="Sides" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Key</span><input name="key" placeholder="sides" style={inputStyle} /></label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Field type</span><select name="fieldType" defaultValue="select" style={inputStyle}><option value="select">Select list</option><option value="yes_no">Yes / No</option><option value="quantity">Quantity</option><option value="number">Number</option><option value="text">Text</option><option value="color">Colour</option><option value="binding">Binding type</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Required</span><select name="required" defaultValue="yes" style={inputStyle}><option value="yes">Yes</option><option value="no">No</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Default value</span><input name="defaultValue" placeholder="single_sided" style={inputStyle} /></label>
                  </div>
                  <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Select options (CSV)</span><input name="optionsCsv" placeholder="single_sided,double_sided" style={inputStyle} /></label>
                  <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Help text</span><input name="helpText" placeholder="Used to drive print faces, laminate or copy colours." style={inputStyle} /></label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Effect type</span><select name="effectType" defaultValue="none" style={inputStyle}><option value="none">No linked rule yet</option><option value="set_quantity">Set quantity</option><option value="multiply_component">Multiply component</option><option value="toggle_component">Toggle component</option><option value="switch_material">Switch material</option><option value="add_labour">Add labour</option><option value="price_delta">Price delta</option></select></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Effect target</span><input name="effectTarget" placeholder="Printed ACM face" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Effect value</span><input name="effectValue" placeholder="2" style={inputStyle} /></label>
                    <label style={{ display: 'grid', gap: 8 }}><span style={{ fontWeight: 600 }}>Effect unit</span><input name="effectUnit" placeholder="faces, qty, minutes" style={inputStyle} /></label>
                  </div>
                  <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#111827', color: '#fff', fontWeight: 700 }}>Add option</button>
                </form>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
