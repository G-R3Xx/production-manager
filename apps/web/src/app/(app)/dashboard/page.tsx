import Link from "next/link";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import {
  getMyobConnectionByTenantId,
  getMyobOauthTokenByTenantId,
  listExternalMappingsByTenantId,
  listSyncRunsByTenantId
} from "@/server/integrations";
import { listCustomersForTenant } from "@/server/customers";
import { listSuppliersForTenant } from "@/server/suppliers";
import { listMaterialsForTenant } from "@/server/materials";

const pageStyle = { maxWidth: 1360, margin: "0 auto", display: "grid", gap: 18 } as const;
const panelStyle = {
  background: "rgba(255,255,255,0.92)",
  border: "1px solid #dfe7f2",
  borderRadius: 26,
  padding: 24,
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.06)"
} as const;
const softPanelStyle = {
  border: "1px solid #dfe7f2",
  borderRadius: 22,
  padding: 18,
  background: "#fbfdff"
} as const;
const eyebrowStyle = { margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" } as const;
const mutedStyle = { margin: 0, color: "#64748b", lineHeight: 1.55 } as const;
const pillStyle = { borderRadius: 999, background: "#eef4ff", color: "#1d4ed8", padding: "7px 11px", fontSize: 12, fontWeight: 950 } as const;
const actionStyle = { minHeight: 42, borderRadius: 14, background: "#0f172a", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontWeight: 900 } as const;
const ghostActionStyle = { ...actionStyle, background: "#fff", color: "#1e293b", border: "1px solid #dbe4f0" } as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(value: string | null | undefined) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("connect") || text.includes("success")) return { bg: "#ecfdf3", fg: "#067647" };
  if (text.includes("missing") || text.includes("disconnect") || text.includes("fail")) return { bg: "#fff5f4", fg: "#b42318" };
  return { bg: "#eef4ff", fg: "#1d4ed8" };
}

export default async function DashboardPage() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    return (
      <div style={panelStyle}>
        <h1 style={{ marginTop: 0 }}>No active workspace</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Create or select a workspace to continue.</p>
      </div>
    );
  }

  const [products, materials, myobConnection, myobToken, mappings, syncRuns, customers, suppliers] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    getMyobConnectionByTenantId(activeTenant.tenantId),
    getMyobOauthTokenByTenantId(activeTenant.tenantId),
    listExternalMappingsByTenantId(activeTenant.tenantId),
    listSyncRunsByTenantId(activeTenant.tenantId),
    listCustomersForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId)
  ]);

  const activeProducts = products.filter((product) => product.status === "active").length;
  const activeMaterials = materials.filter((material) => material.active).length;
  const latestReadOnlySummary = syncRuns.find((run) => run.summaryJson?.source === "runMyobReadOnlySync");
  const latestReadOnlyCustomerCount =
    latestReadOnlySummary && typeof latestReadOnlySummary.summaryJson?.customers === "object"
      ? String(((latestReadOnlySummary.summaryJson.customers as Record<string, unknown>).count ?? "—"))
      : "—";

  const cards = [
    { label: "Products", value: String(activeProducts), note: `${products.length} total product records`, href: "/products" },
    { label: "Materials", value: String(activeMaterials), note: `${materials.length} total stock records`, href: "/materials" },
    { label: "Customers", value: String(customers.length), note: "Imported local customers", href: "/clients" },
    { label: "Suppliers", value: String(suppliers.length), note: "Imported local suppliers", href: "/suppliers" },
    { label: "MYOB", value: myobConnection?.lastSuccessfulSyncAt ? "connected" : myobConnection?.status ?? "disconnected", note: myobConnection?.companyName ?? "No company selected yet", href: "/integrations" },
    { label: "Token", value: myobToken ? "stored" : "missing", note: formatDateTime(myobToken?.expiresAt) ?? "No OAuth token stored yet", href: "/integrations" },
    { label: "Mappings", value: String(mappings.length), note: "Local ↔ MYOB IDs", href: "/integrations" },
    { label: "Read-only Sync", value: latestReadOnlyCustomerCount, note: syncRuns[0]?.status ?? "No sync history yet", href: "/integrations" }
  ];

  const productionColumns = [
    { title: "New", note: "Enquiry, survey or walk-in", count: "—" },
    { title: "Quote", note: "Product answers + calculated cost", count: "—" },
    { title: "Artwork", note: "Proofing / approval", count: "—" },
    { title: "Print", note: "Rip, print, laminate", count: "—" },
    { title: "Finish", note: "Cut, trim, assemble", count: "—" },
    { title: "Ready", note: "Pickup or install", count: "—" }
  ];

  return (
    <div style={pageStyle}>
      <section style={{ ...panelStyle, display: "grid", gap: 18, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 54%, #eef6ff 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p style={eyebrowStyle}>Production dashboard</p>
            <h1 style={{ margin: "8px 0 8px", fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.04em" }}>{activeTenant.tenantName}</h1>
            <p style={{ ...mutedStyle, maxWidth: 760 }}>
              A cleaner production-hub style home for quotes, product setup, materials and MYOB. Signed in as {user.email ?? "Unknown user"}.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/quotes" style={actionStyle}>New quote</Link>
            <Link href="/products" style={ghostActionStyle}>Setup products</Link>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
          {productionColumns.map((column) => (
            <div key={column.title} style={{ ...softPanelStyle, background: "rgba(255,255,255,0.75)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong>{column.title}</strong>
                <span style={pillStyle}>{column.count}</span>
              </div>
              <p style={{ ...mutedStyle, marginTop: 8, fontSize: 13 }}>{column.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {cards.map((card) => {
          const tone = statusTone(card.value);
          return (
            <Link key={card.label} href={card.href} style={{ ...panelStyle, padding: 18, textDecoration: "none", color: "inherit", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <span style={{ ...eyebrowStyle, color: "#64748b" }}>{card.label}</span>
                <span style={{ borderRadius: 999, background: tone.bg, color: tone.fg, padding: "5px 9px", fontSize: 11, fontWeight: 950 }}>Open</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 950, letterSpacing: "-0.05em", color: "#0f172a" }}>{card.value}</div>
              <p style={mutedStyle}>{card.note}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
