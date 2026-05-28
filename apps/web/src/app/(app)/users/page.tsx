import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listUsersForTenant } from "@/server/users";

export default async function UsersPage() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const users = await listUsersForTenant(activeTenant.tenantId);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Users
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Tenant users</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Active tenant: <strong>{activeTenant.tenantName}</strong> ({activeTenant.tenantSlug})
        </p>
      </section>

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 0, overflow: "hidden" }}>
        {users.length === 0 ? (
          <div style={{ padding: 24, color: "#475467" }}>No users found for this tenant yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Name</th>
                <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Short name</th>
                <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Email</th>
                <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Role</th>
                <th style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.membershipId}>
                  <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>{row.fullName}</td>
                  <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>{row.shortName}</td>
                  <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>{row.email}</td>
                  <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb", textTransform: "capitalize" }}>{row.tenantRole}</td>
                  <td style={{ padding: 14, borderBottom: "1px solid #e5e7eb", textTransform: "capitalize" }}>{row.membershipStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
