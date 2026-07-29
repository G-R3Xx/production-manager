import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import { createProductAction } from "./actions";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const read = (p: Record<string, string | string[] | undefined>, key: string) => Array.isArray(p[key]) ? p[key]?.[0] ?? "" : p[key] ?? "";
const card = { border: "1px solid #dbe4f0", borderRadius: 19, background: "#fff", boxShadow: "0 10px 28px rgba(15,23,42,.05)" };
const input = { minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 11, padding: "0 12px", background: "#fff", boxSizing: "border-box" as const };

const starterTypes = [
  ["sign_acm", "Rigid sign — ACM"], ["sign_corflute", "Rigid sign — Corflute"],
  ["sign_acrylic", "Rigid sign — Acrylic"], ["sign_pvc", "Rigid sign — PVC"],
  ["banner", "Banner"], ["roll_print", "Roll print / sticker"],
  ["business_cards", "Business cards"], ["flyers", "Flyers / brochures"],
  ["books", "Books / pads"], ["carbon_books", "Duplicate / triplicate books"]
];

export default async function ProductsPage({ searchParams }: Props) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const params = await searchParams ?? {};
  const selected = read(params, "selected");
  if (selected) redirect(`/products/${selected}`);
  const q = read(params, "q").toLowerCase();
  const status = read(params, "status") || "current";
  const message = read(params, "message");
  const error = read(params, "error");
  const all = await listProductsForTenant(tenant.tenantId, { includeDeleted: true });
  const products = all.filter((product) => {
    if (status === "deleted" && product.status !== "deleted") return false;
    if (status === "website" && !product.websiteEnabled) return false;
    if (status === "draft" && product.status !== "draft") return false;
    if (status === "current" && product.status === "deleted") return false;
    return !q || `${product.name} ${product.sku ?? ""} ${product.websiteCategory ?? ""}`.toLowerCase().includes(q);
  });

  return <main style={{ display: "grid", gap: 20 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 950, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".08em" }}>Internal workflow first</div>
        <h1 style={{ margin: "7px 0", fontSize: 40, letterSpacing: "-.04em" }}>Products</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: 790, lineHeight: 1.6 }}>Create a reusable product for fast quoting and clear production instructions. Website publishing is optional and stays out of the normal workflow.</p>
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <Link href="/products/advanced" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 14px", color: "#334155", fontWeight: 850 }}>Advanced product tools</Link>
      </div>
    </header>

    {message ? <div style={{ padding: 13, borderRadius: 13, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", fontWeight: 850 }}>{message}</div> : null}
    {error ? <div style={{ padding: 13, borderRadius: 13, background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", fontWeight: 850 }}>{error}</div> : null}

    <section style={{ ...card, padding: 18 }}>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Quick product creation</div><h2 style={{ margin: "5px 0 0" }}>What do you quote repeatedly?</h2><p style={{ margin: "6px 0 0", color: "#64748b" }}>Name it, choose the closest starting type, then work through the guided material, print, ink, laminate and finishing tabs.</p>
      <form action={createProductAction} style={{ display: "grid", gridTemplateColumns: "minmax(220px,2fr) minmax(150px,1fr) minmax(230px,1.2fr) auto", gap: 10, marginTop: 16 }}>
        <input name="name" placeholder="eg Corflute yard sign" required style={input} />
        <input name="sku" placeholder="SKU (optional)" style={input} />
        <select name="starterType" defaultValue="sign_acm" style={input}>{starterTypes.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button style={{ minHeight: 44, border: 0, borderRadius: 12, background: "#2563eb", color: "#fff", fontWeight: 950, padding: "0 18px", cursor: "pointer" }}>Create product</button>
      </form>
    </section>

    <section style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <form method="get" style={{ display: "flex", gap: 8, flex: "1 1 460px" }}>
        <input name="q" defaultValue={read(params,"q")} placeholder="Search products" style={{ ...input, flex: 1 }} />
        <select name="status" defaultValue={status} style={input}>
          <option value="current">Current products</option><option value="website">Also published online</option><option value="draft">Drafts</option><option value="deleted">Deleted</option><option value="all">All products</option>
        </select>
        <button style={{ ...input, padding: "0 16px", fontWeight: 850, cursor: "pointer" }}>Filter</button>
      </form>
      <div style={{ color: "#64748b", fontWeight: 800 }}>{products.length} product{products.length === 1 ? "" : "s"}</div>
    </section>

    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
      {products.map(product => <Link key={product.id} href={`/products/${product.id}`} style={{ ...card, padding: 18, textDecoration: "none", color: "inherit", display: "grid", gap: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div><div style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>{product.sku || "No SKU"}</div><h2 style={{ margin: "5px 0 0", fontSize: 22 }}>{product.name}</h2></div>
          <span style={{ borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 950, background: product.status === "active" ? "#dcfce7" : product.status === "draft" ? "#fef3c7" : "#e2e8f0", color: product.status === "active" ? "#166534" : "#475569" }}>{product.status}</span>
        </div>
        <div style={{ display: "grid", gap: 7, color: "#475569", fontSize: 14 }}>
          <span>Production: <b>{product.productionRecipeName || "Setup not finished"}</b></span>
          <span>Quote template: <b>{product.templateName || "Automatic starter"}</b></span>
          <span>Online: <b>{product.websiteEnabled ? "Published as a bonus" : "Not published"}</b></span>
        </div>
        <div style={{ color: "#2563eb", fontWeight: 900 }}>Open guided builder →</div>
      </Link>)}
      {products.length === 0 ? <div style={{ ...card, padding: 28, color: "#64748b" }}>No products match this view.</div> : null}
    </section>
  </main>;
}
