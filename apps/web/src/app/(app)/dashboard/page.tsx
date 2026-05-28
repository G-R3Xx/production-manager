import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductsForTenant } from "@/server/products";
import { listConfiguratorTemplatesForTenant } from "@/server/configurators";
import {
  getMyobConnectionByTenantId,
  getMyobOauthTokenByTenantId,
  listExternalMappingsByTenantId,
  listSyncRunsByTenantId
} from "@/server/integrations";

function cardStyle() {
  return {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)"
  } as const;
}

export default async function DashboardPage() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    return (
      <div style={cardStyle()}>
        <h1 style={{ marginTop: 0 }}>No active tenant</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Create or select a workspace to continue.
        </p>
      </div>
    );
  }

  const [products, configurators, myobConnection, myobToken, mappings, syncRuns] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listConfiguratorTemplatesForTenant(activeTenant.tenantId),
    getMyobConnectionByTenantId(activeTenant.tenantId),
    getMyobOauthTokenByTenantId(activeTenant.tenantId),
    listExternalMappingsByTenantId(activeTenant.tenantId),
    listSyncRunsByTenantId(activeTenant.tenantId)
  ]);

  const cards = [
    { label: "Products", value: String(products.length), note: "Tenant product records" },
    { label: "Configurators", value: String(configurators.length), note: "Template definitions" },
    { label: "MYOB", value: myobConnection?.status ?? "disconnected", note: myobConnection?.companyName ?? "No company selected yet" },
    { label: "Token", value: myobToken ? "stored" : "missing", note: myobToken?.expiresAt ?? "No OAuth token stored yet" },
    { label: "Mappings", value: String(mappings.length), note: "Local ↔ MYOB IDs" },
    { label: "Sync Runs", value: String(syncRuns.length), note: syncRuns[0]?.status ?? "No sync history yet" }
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={cardStyle()}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Dashboard
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>{activeTenant.tenantName}</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Signed in as {user.email ?? "Unknown user"}. This dashboard now includes operational counts and real MYOB OAuth/token status.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {cards.map((card) => (
          <div key={card.label} style={cardStyle()}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
              {card.label}
            </div>
            <div style={{ marginTop: 10, fontSize: 30, fontWeight: 700 }}>{card.value}</div>
            <p style={{ marginTop: 8, marginBottom: 0, color: "#475467", lineHeight: 1.5 }}>{card.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
