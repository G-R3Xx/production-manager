import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";

export default async function QuotesPage() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const products = await listProductsForTenant(activeTenant.tenantId);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Quotes
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Quote builder scaffold</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          This page is the next handoff point. Products and configurator templates now exist, so the next batch can focus on creating quote headers and quote lines with preserved configurator snapshots.
        </p>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Ready products</h2>
        {products.length === 0 ? (
          <p style={{ color: "#475467" }}>No products created yet. Start on the Products page first.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20, color: "#475467", display: "grid", gap: 8 }}>
            {products.map((product) => (
              <li key={product.id}>
                <strong>{product.name}</strong>
                {product.templateName ? ` — linked template: ${product.templateName}` : " — no default template linked yet"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
