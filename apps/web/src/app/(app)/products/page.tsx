import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listConfiguratorTemplatesForTenant } from "@/server/configurators";
import { listProductsForTenant } from "@/server/products";
import { createProductAction, updateProductAction } from "./actions";

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

function containsQuery(value: string | null | undefined, query: string) {
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

const inputStyle: React.CSSProperties = {
  minHeight: 42,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "0 14px",
  fontSize: 15,
  width: "100%"
};

const labelStyle: React.CSSProperties = { display: "grid", gap: 8 };
const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, padding: 20 };

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const [products, templates] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listConfiguratorTemplatesForTenant(activeTenant.tenantId)
  ]);

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedId = readParam(params, "selected");
  const query = readParam(params, "q");
  const showAll = readParam(params, "showAll") === "1";

  const filteredProducts = query
    ? products.filter((product) =>
        containsQuery(product.name, query) ||
        containsQuery(product.sku, query) ||
        containsQuery(product.productFamily, query)
      )
    : products;

  const selectedProduct =
    products.find((product) => product.id === selectedId) ?? filteredProducts[0] ?? products[0] ?? null;

  const searchAction = "/products";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
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

      <section style={{ ...panelStyle, display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Products workflow
        </p>
        <h1 style={{ margin: 0 }}>Products</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Create or find a sellable product, then manage its setup on the same page. Keep product setup simple:
          details first, then components and options.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, alignItems: "start" }}>
        <section style={{ display: "grid", gap: 16 }}>
          <form action={createProductAction} style={{ ...panelStyle, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0 }}>Create product</h2>

            <label style={labelStyle}>
              <span style={{ fontWeight: 600 }}>Product name</span>
              <input name="name" required placeholder="5mm Corflute Sign" style={inputStyle} />
            </label>

            <label style={labelStyle}>
              <span style={{ fontWeight: 600 }}>SKU</span>
              <input name="sku" placeholder="COR-5MM-SIGN" style={inputStyle} />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={labelStyle}>
                <span style={{ fontWeight: 600 }}>Department</span>
                <select name="department" defaultValue="signage" style={inputStyle}>
                  <option value="signage">Signage</option>
                  <option value="small_format">Small format</option>
                  <option value="installation">Installation</option>
                  <option value="general">General</option>
                </select>
              </label>

              <label style={labelStyle}>
                <span style={{ fontWeight: 600 }}>Status</span>
                <select name="status" defaultValue="draft" style={inputStyle}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>

            <label style={labelStyle}>
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

            <label style={labelStyle}>
              <span style={{ fontWeight: 600 }}>Default template</span>
              <select name="defaultTemplateId" defaultValue="" style={inputStyle}>
                <option value="">None yet</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Create and edit product
            </button>
          </form>

          <section style={{ ...panelStyle, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Find product</h2>
              <span style={{ color: "#667085", fontSize: 13 }}>{products.length} total</span>
            </div>

            <form action={searchAction} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="selected" value={selectedProduct?.id ?? ""} />
              <input type="hidden" name="showAll" value={showAll ? "1" : "0"} />
              <input name="q" defaultValue={query} placeholder="Search by name, SKU or family" style={inputStyle} />
              <button type="submit" style={{ minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", fontWeight: 600, cursor: "pointer" }}>
                Search
              </button>
            </form>

            {selectedProduct ? (
              <div style={{ border: "1px solid #d0d5dd", background: "#f8fafc", borderRadius: 14, padding: 14, display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>{selectedProduct.name}</div>
                <div style={{ color: "#475467", fontSize: 14 }}>
                  {selectedProduct.sku || "No SKU"} · {selectedProduct.department} · {selectedProduct.productFamily}
                </div>
                <div style={{ color: "#667085", fontSize: 13 }}>Currently selected for editing</div>
              </div>
            ) : (
              <div style={{ color: "#667085", fontSize: 14 }}>Create a product or select one from the list below.</div>
            )}

            <details open={showAll} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fafafa" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>All products</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 12, maxHeight: 320, overflow: "auto" }}>
                {filteredProducts.length === 0 ? (
                  <p style={{ margin: 0, color: "#667085" }}>No products match your search.</p>
                ) : (
                  filteredProducts.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    const href = `/products?selected=${product.id}${query ? `&q=${encodeURIComponent(query)}` : ""}&showAll=1`;
                    return (
                      <a
                        key={product.id}
                        href={href}
                        style={{
                          border: isSelected ? "1px solid #111827" : "1px solid #e5e7eb",
                          background: isSelected ? "#eef2ff" : "#fff",
                          borderRadius: 12,
                          padding: 12,
                          color: "inherit",
                          textDecoration: "none",
                          display: "grid",
                          gap: 4
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{product.name}</span>
                        <span style={{ color: "#475467", fontSize: 13 }}>
                          {product.sku || "No SKU"} · {product.department} · {product.productFamily}
                        </span>
                      </a>
                    );
                  })
                )}
              </div>
            </details>
          </section>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          {selectedProduct ? (
            <>
              <form action={updateProductAction} style={{ ...panelStyle, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Selected product</h2>
                    <p style={{ margin: "6px 0 0", color: "#667085" }}>Edit the product details here. Components and options stay underneath on the same page.</p>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase" }}>{selectedProduct.status}</div>
                </div>

                <input type="hidden" name="productId" value={selectedProduct.id} />

                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
                  <label style={labelStyle}>
                    <span style={{ fontWeight: 600 }}>Product name</span>
                    <input name="name" defaultValue={selectedProduct.name} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span style={{ fontWeight: 600 }}>SKU</span>
                    <input name="sku" defaultValue={selectedProduct.sku ?? ""} style={inputStyle} />
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <label style={labelStyle}>
                    <span style={{ fontWeight: 600 }}>Department</span>
                    <select name="department" defaultValue={selectedProduct.department} style={inputStyle}>
                      <option value="signage">Signage</option>
                      <option value="small_format">Small format</option>
                      <option value="installation">Installation</option>
                      <option value="general">General</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={{ fontWeight: 600 }}>Product family</span>
                    <select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}>
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
                  <label style={labelStyle}>
                    <span style={{ fontWeight: 600 }}>Status</span>
                    <select name="status" defaultValue={selectedProduct.status} style={inputStyle}>
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </div>

                <label style={labelStyle}>
                  <span style={{ fontWeight: 600 }}>Default template</span>
                  <select name="defaultTemplateId" defaultValue={selectedProduct.defaultTemplateId ?? ""} style={inputStyle}>
                    <option value="">None yet</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ color: "#667085", fontSize: 13 }}>Tax code defaults to GST and does not need to be set here.</div>
                  <button type="submit" style={{ minHeight: 44, padding: "0 18px", borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    Save product details
                  </button>
                </div>
              </form>

              <section style={{ ...panelStyle, display: "grid", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Components</h2>
                  <p style={{ margin: "6px 0 0", color: "#667085" }}>This section stays on the same page, ready for the streamlined component workflow rebuild.</p>
                </div>
                <div style={{ border: "1px dashed #d0d5dd", borderRadius: 14, padding: 16, background: "#fcfcfd", color: "#475467" }}>
                  Components editor placeholder for the selected product. Use this rebuild as the simpler create/find/select/edit foundation.
                </div>
              </section>

              <section style={{ ...panelStyle, display: "grid", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>Options</h2>
                  <p style={{ margin: "6px 0 0", color: "#667085" }}>Options remain attached to the selected product, not on a separate workflow page.</p>
                </div>
                <div style={{ border: "1px dashed #d0d5dd", borderRadius: 14, padding: 16, background: "#fcfcfd", color: "#475467" }}>
                  Options editor placeholder for the selected product.
                </div>
              </section>
            </>
          ) : (
            <section style={{ ...panelStyle, display: "grid", gap: 10, minHeight: 280, alignContent: "center" }}>
              <h2 style={{ margin: 0 }}>No product selected yet</h2>
              <p style={{ margin: 0, color: "#475467" }}>
                Create a new product or choose one from the product list to start editing details, components and options.
              </p>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
