import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listSuppliersForTenant } from "@/server/suppliers";
import { createSupplierAction, updateSupplierAction } from "./actions";

type SuppliersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function panelStyle() {
  return { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 } as const;
}

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const q = readParam(params, "q");
  const suppliers = await listSuppliersForTenant(activeTenant.tenantId, q);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={panelStyle()}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Suppliers</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Supplier management</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>View, add, and edit supplier records for <strong>{activeTenant.tenantName}</strong>.</p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
        <form action={createSupplierAction} style={{ ...panelStyle(), display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Add supplier</h2>
          <input name="displayName" placeholder="Supplier name" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px" }} />
          <input name="contactName" placeholder="Contact name" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px" }} />
          <input type="email" name="email" placeholder="Email" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px" }} />
          <input name="phone" placeholder="Phone" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px" }} />
          <textarea name="notes" placeholder="Notes" rows={4} style={{ borderRadius: 12, border: "1px solid #d0d5dd", padding: 14 }} />
          <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700 }}>Create supplier</button>
        </form>

        <section style={{ ...panelStyle(), display: "grid", gap: 16 }}>
          <form method="get" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
            <input name="q" defaultValue={q} placeholder="Search suppliers" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px" }} />
            <button type="submit" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", fontWeight: 700, padding: "0 16px" }}>Search</button>
          </form>
          <div style={{ display: "grid", gap: 12 }}>
            {suppliers.length === 0 ? (
              <div style={{ color: "#475467" }}>No suppliers found.</div>
            ) : (
              suppliers.map((supplier) => (
                <form key={supplier.id} action={updateSupplierAction} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
                  <input type="hidden" name="supplierId" value={supplier.id} />
                  <input name="displayName" defaultValue={supplier.displayName} style={{ minHeight: 40, borderRadius: 10, border: "1px solid #d0d5dd", padding: "0 12px" }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <input name="contactName" defaultValue={supplier.contactName ?? ""} placeholder="Contact name" style={{ minHeight: 40, borderRadius: 10, border: "1px solid #d0d5dd", padding: "0 12px" }} />
                    <input name="phone" defaultValue={supplier.phone ?? ""} placeholder="Phone" style={{ minHeight: 40, borderRadius: 10, border: "1px solid #d0d5dd", padding: "0 12px" }} />
                  </div>
                  <input type="email" name="email" defaultValue={supplier.email ?? ""} placeholder="Email" style={{ minHeight: 40, borderRadius: 10, border: "1px solid #d0d5dd", padding: "0 12px" }} />
                  <textarea name="notes" defaultValue={supplier.notes ?? ""} rows={3} style={{ borderRadius: 10, border: "1px solid #d0d5dd", padding: 12 }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "#667085" }}>{supplier.myobUid ? `MYOB linked · ${supplier.myobUid}` : "Local supplier"}</div>
                    <button type="submit" style={{ minHeight: 40, borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700, padding: "0 14px" }}>Save</button>
                  </div>
                </form>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
