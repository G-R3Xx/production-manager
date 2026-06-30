import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  canManageStaff,
  getTenantStaffSummary,
  listUsersForTenant,
  MEMBERSHIP_STATUS_OPTIONS,
  staffStatusLabel,
  TENANT_ROLE_OPTIONS
} from "@/server/users";
import { updateStaffMemberAction } from "./actions";

type UsersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function domainBadge(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return "Email";
  if (domain === "tenderedge.com.au") return "Tender Edge Google";
  return domain;
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 22,
  boxShadow: "0 18px 45px rgba(15,23,42,0.06)"
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const [users, summary] = await Promise.all([
    listUsersForTenant(activeTenant.tenantId),
    getTenantStaffSummary(activeTenant.tenantId)
  ]);
  const canEdit = canManageStaff(activeTenant.tenantRole) && activeTenant.membershipStatus === "active";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 }}>
      <section style={{ ...cardStyle, padding: 26 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Staff & roles
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", marginTop: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 36, letterSpacing: "-0.04em" }}>Registered staff access</h1>
            <p style={{ margin: "10px 0 0", color: "#475467", lineHeight: 1.6, maxWidth: 760 }}>
              Review everyone who has joined <strong>{activeTenant.tenantName}</strong>, change their role, or disable access without deleting their history.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "8px 12px", fontWeight: 900 }}>{summary.activeUsers} active</span>
            <span style={{ border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", borderRadius: 999, padding: "8px 12px", fontWeight: 900 }}>{summary.pendingUsers} pending</span>
            <span style={{ border: "1px solid #e5e7eb", background: "#f8fafc", color: "#475467", borderRadius: 999, padding: "8px 12px", fontWeight: 900 }}>{summary.disabledUsers} disabled</span>
            <span style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d", borderRadius: 999, padding: "8px 12px", fontWeight: 900 }}>{summary.activeAdmins} admins</span>
          </div>
        </div>
      </section>

      {message ? (
        <section style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", borderRadius: 16, padding: 14, fontWeight: 800 }}>
          {message}
        </section>
      ) : null}

      {error ? (
        <section style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 16, padding: 14, fontWeight: 800 }}>
          {error}
        </section>
      ) : null}

      {!canEdit ? (
        <section style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 16, padding: 16, lineHeight: 1.55 }}>
          You can view registered staff, but only an active owner or manager can edit roles and access.
        </section>
      ) : null}

      <section style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {users.length === 0 ? (
          <div style={{ padding: 24, color: "#475467" }}>No users found for this workspace yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  <th style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>Staff member</th>
                  <th style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>Google / email</th>
                  <th style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>Role</th>
                  <th style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>Status</th>
                  <th style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>Joined</th>
                  <th style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const isCurrentUser = row.userProfileId === activeTenant.userProfileId;
                  const isDisabled = row.membershipStatus === "disabled";

                  return (
                    <tr key={row.membershipId} style={{ background: isDisabled ? "#f8fafc" : "#ffffff" }}>
                      <td style={{ padding: 16, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                        <div style={{ fontWeight: 950, color: "#0f172a" }}>{row.fullName || row.email}</div>
                        <div style={{ marginTop: 5, color: "#64748b", fontSize: 13 }}>
                          Short name: <strong>{row.shortName || "—"}</strong>
                          {isCurrentUser ? <span style={{ marginLeft: 8, color: "#2563eb", fontWeight: 900 }}>(you)</span> : null}
                        </div>
                      </td>
                      <td style={{ padding: 16, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                        <div style={{ fontWeight: 800, color: "#334155" }}>{row.email}</div>
                        <div style={{ marginTop: 7, display: "inline-flex", border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 900 }}>
                          {domainBadge(row.email)}
                        </div>
                      </td>
                      <td style={{ padding: 16, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                        <form id={`staff-${row.membershipId}`} action={updateStaffMemberAction} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="membershipId" value={row.membershipId} />
                          <select
                            name="tenantRole"
                            defaultValue={row.tenantRole}
                            disabled={!canEdit}
                            style={{ minHeight: 42, borderRadius: 12, border: "1px solid #cbd5e1", background: canEdit ? "#fff" : "#f8fafc", padding: "0 12px", fontWeight: 800, textTransform: "capitalize" }}
                          >
                            {TENANT_ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </form>
                      </td>
                      <td style={{ padding: 16, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                        <select
                          form={`staff-${row.membershipId}`}
                          name="membershipStatus"
                          defaultValue={row.membershipStatus}
                          disabled={!canEdit}
                          style={{ minHeight: 42, borderRadius: 12, border: "1px solid #cbd5e1", background: canEdit ? "#fff" : "#f8fafc", padding: "0 12px", fontWeight: 800 }}
                        >
                          {MEMBERSHIP_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <div style={{ marginTop: 7, color: "#64748b", fontSize: 12 }}>
                          {staffStatusLabel(row.membershipStatus)}
                        </div>
                      </td>
                      <td style={{ padding: 16, borderBottom: "1px solid #e5e7eb", color: "#475467", fontSize: 13, verticalAlign: "top", lineHeight: 1.45 }}>
                        <div>{formatDate(row.membershipCreatedAt)}</div>
                        <div style={{ marginTop: 4, color: "#94a3b8" }}>Updated {formatDate(row.membershipUpdatedAt)}</div>
                      </td>
                      <td style={{ padding: 16, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                        <button
                          type="submit"
                          form={`staff-${row.membershipId}`}
                          disabled={!canEdit}
                          style={{
                            minHeight: 42,
                            borderRadius: 13,
                            border: canEdit ? "1px solid #1d4ed8" : "1px solid #cbd5e1",
                            background: canEdit ? "#2563eb" : "#f8fafc",
                            color: canEdit ? "#fff" : "#94a3b8",
                            fontWeight: 950,
                            padding: "0 16px",
                            cursor: canEdit ? "pointer" : "not-allowed"
                          }}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 18, padding: 18, color: "#1e3a8a", lineHeight: 1.6 }}>
        <strong>Safe setup:</strong> new matching Google sign-ins appear here and can be left as Staff, changed to Manager/Installer/Accounts, marked Pending, or Disabled. Disabled users keep their history but cannot access the workspace.
      </section>
    </div>
  );
}
