import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { previewWorkflowResetForTenant, WORKFLOW_RESET_CONFIRMATION } from "@/server/workflow-reset";
import { resetWorkflowDataAction } from "./actions";

const card: CSSProperties = {
  border: "1px solid #dbe4f0",
  borderRadius: 20,
  background: "#fff",
  boxShadow: "0 10px 28px rgba(15,23,42,.05)",
  padding: 22
};

const counts: Array<{ key: keyof Awaited<ReturnType<typeof previewWorkflowResetForTenant>>; label: string }> = [
  { key: "enquiries", label: "Enquiries" },
  { key: "surveys", label: "Surveys" },
  { key: "quotes", label: "Quotes" },
  { key: "artworkApprovals", label: "Artwork approvals" },
  { key: "productionJobs", label: "Production jobs" },
  { key: "workspaceJobs", label: "Dashboard jobs" },
  { key: "calendarTasks", label: "Calendar / job tasks" },
  { key: "invoices", label: "Local invoices" },
  { key: "websiteOrders", label: "Imported WooCommerce order records" },
  { key: "myobTransactionMappings", label: "MYOB quote / order / invoice mappings" },
  { key: "workflowNotifications", label: "Workflow notifications" },
  { key: "legacyQuotes", label: "Legacy quote records" }
];

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function DataResetPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = firstParam(params.message);
  const error = firstParam(params.error);
  const isAdmin = new Set(["owner", "manager"]).has(String(tenant.tenantRole).toLowerCase());
  const preview = isAdmin ? await previewWorkflowResetForTenant(tenant.tenantId) : null;
  const total = preview ? Object.values(preview).reduce((sum, value) => sum + value, 0) : 0;

  return (
    <main style={{ display: "grid", gap: 20, maxWidth: 1080 }}>
      <header style={{ display: "grid", gap: 8 }}>
        <Link href="/settings" style={{ color: "#475569", fontWeight: 850, textDecoration: "none", width: "fit-content" }}>← Settings</Link>
        <div style={{ fontSize: 12, fontWeight: 950, color: "#b42318", textTransform: "uppercase", letterSpacing: ".08em" }}>Danger zone</div>
        <h1 style={{ margin: 0, fontSize: 38 }}>Reset workflow test data</h1>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6, maxWidth: 900 }}>
          Clears the active operational workflow for <strong>{tenant.tenantName}</strong> while keeping the master data you have configured.
          This is a local Production Manager reset only; it does not delete records from MYOB or Install Scheduler.
        </p>
      </header>

      {message ? <div style={{ ...card, borderColor: "#86efac", background: "#f0fdf4", color: "#166534", fontWeight: 850 }}>{message}</div> : null}
      {error ? <div style={{ ...card, borderColor: "#fda29b", background: "#fff1f0", color: "#b42318", fontWeight: 850 }}>{error}</div> : null}

      {!isAdmin ? (
        <section style={{ ...card, borderColor: "#fda29b", background: "#fff7ed" }}>
          <h2 style={{ marginTop: 0 }}>Owner or manager access required</h2>
          <p style={{ marginBottom: 0, color: "#7c2d12" }}>Your current role is {tenant.tenantRole}. Only workspace owners and managers can run a destructive reset.</p>
        </section>
      ) : (
        <>
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 950, color: "#475569", textTransform: "uppercase", letterSpacing: ".08em" }}>Current operational data</div>
                <h2 style={{ margin: "7px 0 0", fontSize: 25 }}>{total} tracked workflow records will be removed</h2>
              </div>
              <span style={{ borderRadius: 999, background: total ? "#fff1f0" : "#f0fdf4", color: total ? "#b42318" : "#166534", padding: "8px 12px", fontWeight: 950 }}>{total ? "Reset available" : "Already clean"}</span>
            </div>
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
              {counts.map((item) => (
                <div key={item.key} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "13px 14px", background: "#f8fafc" }}>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800 }}>{item.label}</div>
                  <div style={{ marginTop: 4, fontSize: 24, color: "#0f172a", fontWeight: 950 }}>{preview?.[item.key] ?? 0}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...card, borderColor: "#bbf7d0", background: "#f7fff9" }}>
            <h2 style={{ marginTop: 0, color: "#166534" }}>Kept exactly as configured</h2>
            <p style={{ margin: 0, color: "#365314", lineHeight: 1.65 }}>
              Clients, suppliers, materials, products, product options/configurators, manufacturing methods, production steps, machines, labour/rates,
              company settings and branding, staff/roles, MYOB connection and tokens, master-data MYOB links, WordPress connection/product publishing,
              and purchase orders are retained.
            </p>
          </section>

          <section style={{ ...card, borderColor: "#fda29b", background: "#fff7f6" }}>
            <h2 style={{ marginTop: 0, color: "#b42318" }}>Permanent reset</h2>
            <p style={{ color: "#7a271a", lineHeight: 1.65 }}>
              This deletes the records above plus workflow-only files from Artwork Approvals, Production, enquiry correspondence and enquiry-specific client assets.
              It will not run automatically during deployment.
            </p>
            <form action={resetWorkflowDataAction} style={{ marginTop: 18, display: "grid", gap: 12, maxWidth: 620 }}>
              <label style={{ display: "grid", gap: 7, fontWeight: 900, color: "#7a271a" }}>
                Type <code style={{ background: "#fee4e2", padding: "3px 6px", borderRadius: 6 }}>{WORKFLOW_RESET_CONFIRMATION}</code> to confirm
                <input
                  name="confirmation"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={WORKFLOW_RESET_CONFIRMATION}
                  style={{ minHeight: 46, border: "1px solid #f04438", borderRadius: 12, padding: "0 13px", fontSize: 15, background: "#fff" }}
                />
              </label>
              <button type="submit" style={{ minHeight: 48, border: 0, borderRadius: 13, background: "#b42318", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 18px", width: "fit-content" }}>
                Wipe workflow test data
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
