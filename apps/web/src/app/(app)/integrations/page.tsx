import Link from "next/link";
import {
  disconnectMyobConnectionAction,
  queueMyobSyncAction,
  runMyobReadOnlySyncAction,
  saveMyobConnectionAction,
  importMyobCustomersAction,
  importMyobItemsAction
} from "./actions";
import {
  getMyobConnectionByTenantId,
  getMyobOauthTokenByTenantId,
  listExternalMappingsByTenantId,
  listSyncRunsByTenantId,
  type ExternalMappingRecord,
  type SyncRunRecord
} from "@/server/integrations";
import { getRequiredSessionUser } from "@/server/auth/session";
import { listCustomersForTenant } from "@/server/customers";
import { listProductsForTenant } from "@/server/products";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";

function cardStyle() {
  return {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    padding: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)"
  } as const;
}

function maskToken(token: string | null | undefined) {
  if (!token) {
    return "Not stored";
  }
  if (token.length <= 12) {
    return "••••••••";
  }
  return `${token.slice(0, 6)}••••••${token.slice(-4)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default async function IntegrationsPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  const params = (await searchParams) ?? {};

  if (!activeTenant) {
    return (
      <div style={cardStyle()}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Integrations
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>No active tenant</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Create or select a workspace first before configuring MYOB integration.
        </p>
      </div>
    );
  }

  const [connection, tokenRecord, mappings, syncRuns, localCustomers, localProducts] = await Promise.all([
    getMyobConnectionByTenantId(activeTenant.tenantId),
    getMyobOauthTokenByTenantId(activeTenant.tenantId),
    listExternalMappingsByTenantId(activeTenant.tenantId),
    listSyncRunsByTenantId(activeTenant.tenantId),
    listCustomersForTenant(activeTenant.tenantId),
    listProductsForTenant(activeTenant.tenantId)
  ]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={cardStyle()}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Integrations
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>MYOB token exchange + company file capture</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          This page now supports the real MYOB OAuth callback token exchange and stores the selected company file from the callback when MYOB returns businessId and businessName.
        </p>
      </div>

      {params.message ? (
        <div style={{ ...cardStyle(), borderColor: "#86efac", background: "#f0fdf4", color: "#166534" }}>{params.message}</div>
      ) : null}
      {params.error ? (
        <div style={{ ...cardStyle(), borderColor: "#fda4af", background: "#fff1f2", color: "#9f1239" }}>{params.error}</div>
      ) : null}

      <div style={{ ...cardStyle(), display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Active workspace
          </div>
          <h2 style={{ margin: "8px 0 0" }}>{activeTenant.tenantName}</h2>
          <p style={{ margin: "8px 0 0", color: "#667085" }}>{activeTenant.tenantSlug} · {activeTenant.tenantRole}</p>
        </div>

        <form action={saveMyobConnectionAction} style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Environment</span>
              <select name="environment" defaultValue={connection?.environment ?? "sandbox"} style={{ minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px" }}>
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Status</span>
              <select name="status" defaultValue={connection?.status ?? "disconnected"} style={{ minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px" }}>
                <option value="disconnected">Disconnected</option>
                <option value="connected">Connected</option>
                <option value="error">Error</option>
              </select>
            </label>

            <div style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Last successful sync</span>
              <div style={{ minHeight: 42, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fafafa", padding: "10px 12px", color: "#667085" }}>
                {connection?.lastSuccessfulSyncAt ? formatDateTime(connection.lastSuccessfulSyncAt) : "Not synced yet"}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Company file ID</span>
              <input name="companyFileId" defaultValue={connection?.companyFileId ?? ""} placeholder="Will be filled from MYOB callback" style={{ minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px" }} />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Company name</span>
              <input name="companyName" defaultValue={connection?.companyName ?? ""} placeholder="Will be filled from MYOB callback" style={{ minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px" }} />
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="submit" style={{ justifySelf: "start", minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>
              Save connection metadata
            </button>
          </div>
        </form>
      </div>

      <div style={{ ...cardStyle(), display: "grid", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            OAuth connection
          </div>
          <h2 style={{ margin: "8px 0 0" }}>Exchange tokens and capture company file</h2>
          <p style={{ margin: "8px 0 0", color: "#667085", lineHeight: 1.6 }}>
            Start MYOB OAuth now performs a real authorization-code redirect. After MYOB redirects back, the callback exchanges the code for tokens and stores the selected company file returned by businessId and businessName.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/auth/myob/start" style={{ textDecoration: "none" }}>
            <span style={{ display: "inline-flex", alignItems: "center", minHeight: 44, borderRadius: 12, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>
              Start MYOB OAuth
            </span>
          </Link>

          <form action={runMyobReadOnlySyncAction}>
            <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>
              Run read-only MYOB sync
            </button>
          </form>



          <form action={importMyobCustomersAction}>
            <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #111827", background: "#fff", color: "#111827", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>
              Import customers + create mappings
            </button>
          </form>

          <form action={queueMyobSyncAction}>
            <input type="hidden" name="jobType" value="incremental_import" />
            <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>
              Queue sample sync run
            </button>
          </form>

          <form action={disconnectMyobConnectionAction}>
            <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #fecaca", background: "#fff1f2", color: "#b42318", fontWeight: 700, padding: "0 16px", cursor: "pointer" }}>
              Disconnect scaffold
            </button>
          </form>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fafafa" }}>
            <div style={{ fontWeight: 700 }}>Stored access token</div>
            <div style={{ marginTop: 6, color: "#667085", fontSize: 14 }}>{maskToken(tokenRecord?.accessToken)}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fafafa" }}>
            <div style={{ fontWeight: 700 }}>Stored refresh token</div>
            <div style={{ marginTop: 6, color: "#667085", fontSize: 14 }}>{maskToken(tokenRecord?.refreshToken)}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fafafa" }}>
            <div style={{ fontWeight: 700 }}>Granted scope</div>
            <div style={{ marginTop: 6, color: "#667085", fontSize: 14 }}>{tokenRecord?.scope ?? "No scope stored yet"}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fafafa" }}>
            <div style={{ fontWeight: 700 }}>Token expiry</div>
            <div style={{ marginTop: 6, color: "#667085", fontSize: 14 }}>{tokenRecord?.expiresAt ? formatDateTime(tokenRecord.expiresAt) : "No expiry stored yet"}</div>
          </div>
        </div>
      </div>

      {syncRuns[0]?.summaryJson ? (
        <div style={cardStyle()}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Latest read-only sync
          </div>
          <h2 style={{ marginTop: 10 }}>MYOB read summary</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>Customers</div>
              <div style={{ color: "#667085", marginTop: 6 }}>
                {typeof syncRuns[0].summaryJson.customers === "object" && syncRuns[0].summaryJson.customers && "count" in (syncRuns[0].summaryJson.customers as Record<string, unknown>)
                  ? String((syncRuns[0].summaryJson.customers as Record<string, unknown>).count ?? 0)
                  : "—"}
              </div>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>Suppliers</div>
              <div style={{ color: "#667085", marginTop: 6 }}>
                {typeof syncRuns[0].summaryJson.suppliers === "object" && syncRuns[0].summaryJson.suppliers && "count" in (syncRuns[0].summaryJson.suppliers as Record<string, unknown>)
                  ? String((syncRuns[0].summaryJson.suppliers as Record<string, unknown>).count ?? 0)
                  : "—"}
              </div>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>Items</div>
              <div style={{ color: "#667085", marginTop: 6 }}>
                {typeof syncRuns[0].summaryJson.items === "object" && syncRuns[0].summaryJson.items && "count" in (syncRuns[0].summaryJson.items as Record<string, unknown>)
                  ? String((syncRuns[0].summaryJson.items as Record<string, unknown>).count ?? 0)
                  : "—"}
              </div>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>Company</div>
              <div style={{ color: "#667085", marginTop: 6 }}>
                {typeof syncRuns[0].summaryJson.companyName === "string" ? syncRuns[0].summaryJson.companyName : connection?.companyName ?? "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}



      <div style={cardStyle()}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Customer import
        </div>
        <h2 style={{ marginTop: 10 }}>Local customer import + mapping</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>Local customers</div>
            <div style={{ color: "#667085", marginTop: 6 }}>{localCustomers.length}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>Customer mappings</div>
            <div style={{ color: "#667085", marginTop: 6 }}>{mappings.filter((mapping) => mapping.entityType === "customer").length}</div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>Latest company status</div>
            <div style={{ color: "#667085", marginTop: 6 }}>{connection?.status ?? "disconnected"}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={cardStyle()}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            External mappings
          </div>
          <h2 style={{ marginTop: 10 }}>Local ↔ MYOB IDs</h2>
          <p style={{ color: "#667085", lineHeight: 1.6 }}>
            These records will link local customers, suppliers, products, invoices, quotes, and orders to their MYOB equivalents.
          </p>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {mappings.length === 0 ? (
              <div style={{ color: "#667085" }}>No mappings recorded yet.</div>
            ) : (
              mappings.map((mapping: ExternalMappingRecord) => (
                <div key={mapping.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
                  <div style={{ fontWeight: 700 }}>{mapping.entityType}</div>
                  <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>Local: {mapping.localId}</div>
                  <div style={{ fontSize: 13, color: "#667085" }}>MYOB: {mapping.externalId}</div>
                  <div style={{ fontSize: 12, color: "#4f46e5", marginTop: 6 }}>{mapping.syncState}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Sync runs
          </div>
          <h2 style={{ marginTop: 10 }}>Integration job history</h2>
          <p style={{ color: "#667085", lineHeight: 1.6 }}>
            Every import, push, or reconcile job logs here so you can track status and failures per tenant.
          </p>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {syncRuns.length === 0 ? (
              <div style={{ color: "#667085" }}>No sync runs recorded yet.</div>
            ) : (
              syncRuns.map((run: SyncRunRecord) => (
                <div key={run.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafafa" }}>
                  <div style={{ fontWeight: 700 }}>{run.jobType}</div>
                  <div style={{ fontSize: 13, color: "#667085", marginTop: 4 }}>Status: {run.status}</div>
                  <div style={{ fontSize: 13, color: "#667085" }}>Started: {formatDateTime(run.startedAt)}</div>
                  <div style={{ fontSize: 13, color: "#667085" }}>Finished: {formatDateTime(run.finishedAt)}</div>
                  {run.errorMessage ? <div style={{ fontSize: 12, color: "#b42318", marginTop: 6 }}>{run.errorMessage}</div> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
