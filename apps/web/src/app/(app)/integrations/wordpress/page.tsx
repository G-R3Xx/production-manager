import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listPublishedWebsiteProductsForTenant } from "@/server/products";
import { getWordPressConnectionForTenant } from "@/server/wordpress";
import { rotateWordPressApiKeyAction, saveWordPressConnectionAction } from "./actions";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const read = (p: Record<string, string | string[] | undefined>, key: string) => Array.isArray(p[key]) ? p[key]?.[0] ?? "" : p[key] ?? "";
const card = { border: "1px solid #dbe4f0", borderRadius: 20, padding: 22, background: "#fff", boxShadow: "0 12px 34px rgba(15,23,42,.06)" };
const input = { width: "100%", minHeight: 46, border: "1px solid #cbd5e1", borderRadius: 12, padding: "0 13px", boxSizing: "border-box" as const };

export default async function WordPressIntegrationPage({ searchParams }: Props) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const [connection, products, requestHeaders, params] = await Promise.all([
    getWordPressConnectionForTenant(tenant.tenantId),
    listPublishedWebsiteProductsForTenant(tenant.tenantId),
    headers(),
    searchParams ?? Promise.resolve({})
  ]);
  const host = requestHeaders.get("host") ?? "your-production-manager-domain";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;
  const message = read(params, "message");

  return <main style={{ display: "grid", gap: 20 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 950, color: "#7c3aed", textTransform: "uppercase", letterSpacing: ".08em" }}>Website connection</div>
        <h1 style={{ margin: "7px 0", fontSize: 38 }}>WordPress & WooCommerce</h1>
        <p style={{ margin: 0, color: "#64748b", maxWidth: 800, lineHeight: 1.6 }}>Production Manager owns products, manufacturing methods and pricing. WordPress pulls the published catalogue and sends completed WooCommerce orders back with their exact configuration.</p>
      </div>
      <Link href="/settings" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 14px", color: "#334155", fontWeight: 850 }}>← Settings</Link>
    </header>

    {message ? <div style={{ padding: 14, borderRadius: 14, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", fontWeight: 850 }}>{message}</div> : null}

    <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(320px,.7fr)", gap: 18 }}>
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Connection details</h2>
        <form action={saveWordPressConnectionAction} style={{ display: "grid", gap: 15 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 850 }}>WordPress site URL
            <input name="siteUrl" defaultValue={connection?.siteUrl ?? ""} placeholder="https://your-site.com.au" style={input} />
          </label>
          <label style={{ display: "grid", gap: 7, fontWeight: 850 }}>Production Manager API key
            <input name="apiKey" defaultValue={connection?.apiKey ?? ""} placeholder="Created automatically when saved" style={{ ...input, fontFamily: "monospace" }} />
          </label>
          <button style={{ justifySelf: "start", minHeight: 44, border: 0, borderRadius: 12, background: "#7c3aed", color: "#fff", fontWeight: 950, padding: "0 18px", cursor: "pointer" }}>Save connection</button>
        </form>
        {connection ? <form action={rotateWordPressApiKeyAction} style={{ marginTop: 12 }}><button style={{ border: "1px solid #fca5a5", color: "#b91c1c", background: "#fff", borderRadius: 10, padding: "9px 12px", fontWeight: 850, cursor: "pointer" }}>Rotate API key</button></form> : null}
      </div>

      <div style={{ ...card, background: "linear-gradient(180deg,#faf5ff,#fff)" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#7c3aed", textTransform: "uppercase" }}>Published catalogue</div>
        <div style={{ fontSize: 48, fontWeight: 950, marginTop: 8 }}>{products.length}</div>
        <div style={{ color: "#64748b" }}>active products available to WordPress</div>
        <div style={{ display: "grid", gap: 8, marginTop: 18, fontSize: 13 }}>
          <div><b>Last catalogue pull:</b> {connection?.lastCatalogPullAt ? new Date(connection.lastCatalogPullAt).toLocaleString("en-AU") : "Not yet"}</div>
          <div><b>Last order received:</b> {connection?.lastOrderReceivedAt ? new Date(connection.lastOrderReceivedAt).toLocaleString("en-AU") : "Not yet"}</div>
        </div>
        <Link href="/products" style={{ marginTop: 18, display: "inline-block", color: "#6d28d9", fontWeight: 900 }}>Manage website products →</Link>
      </div>
    </section>

    <section style={card}>
      <h2 style={{ marginTop: 0 }}>WordPress plugin settings</h2>
      <p style={{ color: "#64748b", lineHeight: 1.6 }}>In WordPress, open <b>Tender Edge V2 → Production Manager</b>, then enter these values and run <b>Sync catalogue</b>.</p>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ padding: 14, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>Production Manager URL</div><code style={{ display: "block", marginTop: 7, overflowWrap: "anywhere" }}>{baseUrl}</code></div>
        <div style={{ padding: 14, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><div style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>API key</div><code style={{ display: "block", marginTop: 7, overflowWrap: "anywhere" }}>{connection?.apiKey ?? "Save the connection to create a key"}</code></div>
      </div>
      <div style={{ marginTop: 14, color: "#64748b", fontSize: 13 }}>Catalogue endpoint: <code>{baseUrl}/api/wordpress/catalog</code></div>
    </section>
  </main>;
}
