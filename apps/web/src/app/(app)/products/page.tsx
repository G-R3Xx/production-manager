import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listConfiguratorTemplatesForTenant } from "@/server/configurators";
import { getProductById, listProductsForTenant } from "@/server/products";
import { createProductAction, updateProductAction } from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedId = readParam(params, "selected");
  const query = readParam(params, "q");

  const [products, templates] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listConfiguratorTemplatesForTenant(activeTenant.tenantId)
  ]);

  const filteredProducts = query
    ? products.filter((product) =>
        matchesQuery(product.name, query) ||
        matchesQuery(product.sku ?? "", query) ||
        matchesQuery(product.productFamily, query)
      )
    : products;

  const selectedProduct = selectedId
    ? await getProductById(activeTenant.tenantId, selectedId)
    : null;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 16 }}>
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

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Catalog
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Products</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Manage sellable products in one place. Select a product to edit its details, then use <strong>Components</strong> and <strong>Options</strong> as the next workflow steps.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
        <form action={createProductAction} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0 }}>Add product</h2>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Product name</span>
            <input name="name" required placeholder="5mm Corflute Sign" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>SKU</span>
            <input name="sku" placeholder="COR-5MM-SIGN" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Department</span>
              <select name="department" defaultValue="signage" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
                <option value="signage">Signage</option>
                <option value="small_format">Small format</option>
                <option value="installation">Installation</option>
                <option value="general">General</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Status</span>
              <select name="status" defaultValue="draft" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Product family</span>
            <select name="productFamily" defaultValue="rigid_signage" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
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
            <span style={{ fontWeight: 600 }}>Default option set</span>
            <select name="defaultTemplateId" defaultValue="" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
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
            <input name="taxCode" placeholder="GST" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>

          <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Create product
          </button>
        </form>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>Find product</h2>
                <p style={{ margin: "6px 0 0", color: "#475467" }}>Search and open one product at a time instead of working from a huge always-open list.</p>
              </div>
              <div style={{ fontSize: 13, color: "#667085" }}>{products.length} total</div>
            </div>

            <form method="GET" action="/products" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <input type="text" name="q" defaultValue={query} placeholder="Search by name, SKU, or family" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
              <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>Search</button>
            </form>

            {filteredProducts.length === 0 ? (
              <p style={{ margin: 0, color: "#475467" }}>No products matched your search.</p>
            ) : (
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
            )}

            <details style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>All products</summary>
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {products.map((product) => (
                  <a key={product.id} href={`/products?selected=${product.id}`} style={{ display: "block", textDecoration: "none", border: "1px solid #e5e7eb", background: "#fafafa", color: "#111827", borderRadius: 14, padding: 14 }}>
                    <div style={{ fontWeight: 700 }}>{product.name}</div>
                    <div style={{ marginTop: 6, fontSize: 14, color: "#475467" }}>{product.sku || "No SKU"} · {product.department} · {product.status}</div>
                  </a>
                ))}
              </div>
            </details>
          </section>

          <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0 }}>Selected product</h2>
            {!selectedProduct ? (
              <p style={{ margin: 0, color: "#475467" }}>Select a product above to edit its details and continue to components and options.</p>
            ) : (
              <>
                <form action={updateProductAction} style={{ display: "grid", gap: 14 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>Product name</span>
                      <input name="name" required defaultValue={selectedProduct.name} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
                    </label>
                    <label style={{ display: "grid", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>SKU</span>
                      <input name="sku" defaultValue={selectedProduct.sku ?? ""} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>Department</span>
                      <select name="department" defaultValue={selectedProduct.department} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
                        <option value="signage">Signage</option>
                        <option value="small_format">Small format</option>
                        <option value="installation">Installation</option>
                        <option value="general">General</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>Product family</span>
                      <select name="productFamily" defaultValue={selectedProduct.productFamily} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
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
                      <span style={{ fontWeight: 600 }}>Status</span>
                      <select name="status" defaultValue={selectedProduct.status} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label style={{ display: "grid", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>Options set</span>
                      <select name="defaultTemplateId" defaultValue={selectedProduct.defaultTemplateId ?? ""} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
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
                      <input name="taxCode" defaultValue={selectedProduct.taxCode ?? ""} style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
                    </label>
                  </div>

                  <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    Save product
                  </button>
                </form>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fafafa" }}>
                    <div style={{ fontWeight: 700 }}>Components</div>
                    <p style={{ margin: "8px 0 0", color: "#475467", lineHeight: 1.5 }}>Materials and labour should be managed as the per-product build structure here next, instead of on a separate Recipes workflow page.</p>
                  </section>
                  <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fafafa" }}>
                    <div style={{ fontWeight: 700 }}>Options</div>
                    <p style={{ margin: "8px 0 0", color: "#475467", lineHeight: 1.5 }}>Use the linked option set as the variable configuration layer for this product. Separate Configurators pages are now secondary and redirect here.</p>
                  </section>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
