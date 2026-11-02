import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  canManageStaff,
  getTenantStaffSummary,
  listUsersForTenant,
  MEMBERSHIP_STATUS_OPTIONS,
  QUOTE_ENTRY_LAYOUT_OPTIONS,
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

const fieldStyle = {
  display: "grid",
  alignContent: "start",
  gap: 7,
  minWidth: 0,
  fontSize: 12,
  fontWeight: 800,
  color: "#475467"
} as const;

const inputStyle = {
  width: "100%",
  minWidth: 0,
  minHeight: 42,
  boxSizing: "border-box",
  borderRadius: 11,
  border: "1px solid #cbd5e1",
  padding: "0 11px",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 700
} as const;

const helpStyle = { color: "#64748b", fontSize: 12, fontWeight: 400, lineHeight: 1.4 } as const;

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
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18, minWidth: 0 }}>
      <section style={{ ...cardStyle, padding: 26 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Staff & roles
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", marginTop: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 36, letterSpacing: "-0.04em" }}>Registered staff access</h1>
            <p style={{ margin: "10px 0 0", color: "#475467", lineHeight: 1.6, maxWidth: 760 }}>
              Review everyone who has joined <strong>{activeTenant.tenantName}</strong>, edit their names and role, or disable access without deleting their history.
            </p>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
              Short names appear in staff assignments. Internal quote cost access is controlled individually and is off by default.
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
        <section role="status" style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", borderRadius: 16, padding: 14, fontWeight: 800 }}>
          {message}
        </section>
      ) : null}

      {error ? (
        <section role="alert" style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 16, padding: 14, fontWeight: 800 }}>
          {error}
        </section>
      ) : null}

      {!canEdit ? (
        <section style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: 16, padding: 16, lineHeight: 1.55 }}>
          You can view registered staff, but only an active owner or manager can edit roles and access.
        </section>
      ) : null}

      {/* Independent staff cards replace the wide table: the cost permission and Save button
          remain visible without sideways scrolling, even at laptop and mobile widths. */}
      <section aria-label="Staff accounts" style={{ ...cardStyle, padding: 0, overflow: "hidden", minWidth: 0 }}>
        {users.length === 0 ? (
          <div style={{ padding: 24, color: "#475467" }}>No users found for this workspace yet.</div>
        ) : (
          <div style={{ display: "grid" }}>
            {users.map((row, index) => {
              const isCurrentUser = row.userProfileId === activeTenant.userProfileId;
              const isDisabled = row.membershipStatus === "disabled";
              const canEditRow = canEdit && (activeTenant.tenantRole === "owner" || row.tenantRole !== "owner");

              return (
                <form
                  key={row.membershipId}
                  id={`staff-${row.membershipId}`}
                  action={updateStaffMemberAction}
                  style={{
                    minWidth: 0,
                    display: "grid",
                    gap: 18,
                    padding: "22px 24px",
                    borderBottom: index === users.length - 1 ? "none" : "1px solid #e5e7eb",
                    background: isDisabled ? "#f8fafc" : "#fff"
                  }}
                >
                  <input type="hidden" name="membershipId" value={row.membershipId} />
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                    <div style={{ display: "grid", gap: 7, minWidth: 0, flex: "1 1 220px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                        <strong style={{ color: "#0f172a", fontSize: 18 }}>{row.fullName || row.email}</strong>
                        {isCurrentUser ? <span style={{ color: "#2563eb", fontSize: 12, fontWeight: 900 }}>(you)</span> : null}
                        <span style={{ fontSize: 11, color: isDisabled ? "#991b1b" : "#475467", background: isDisabled ? "#fef2f2" : "#f1f5f9", borderRadius: 999, padding: "4px 8px", fontWeight: 800 }}>
                          {staffStatusLabel(row.membershipStatus)}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#475467", fontSize: 13, overflowWrap: "anywhere" }}>{row.email}</span>
                        <span style={{ border: "1px solid #dbeafe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 800 }}>
                          {domainBadge(row.email)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: canEditRow ? "pointer" : "not-allowed", color: "#1e293b" }}>
                        <input
                          name="quoteCostBreakdownEnabled"
                          type="checkbox"
                          defaultChecked={row.quoteCostBreakdownEnabled}
                          disabled={!canEditRow}
                          style={{ width: 19, height: 19, margin: 0, flexShrink: 0, accentColor: "#2563eb", cursor: canEditRow ? "pointer" : "not-allowed" }}
                        />
                        <span style={{ display: "grid", gap: 2 }}>
                          <strong style={{ fontSize: 13 }}>Show cost breakdown</strong>
                          <span style={{ fontSize: 11, color: "#64748b" }}>Internal quote cost access</span>
                        </span>
                      </label>
                      <button
                        type="submit"
                        disabled={!canEditRow}
                        style={{ minHeight: 42, borderRadius: 12, border: canEditRow ? "1px solid #1d4ed8" : "1px solid #cbd5e1", background: canEditRow ? "#2563eb" : "#f8fafc", color: canEditRow ? "#fff" : "#94a3b8", fontWeight: 900, padding: "0 20px", cursor: canEditRow ? "pointer" : "not-allowed" }}
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: "16px 18px", minWidth: 0 }}>
                    <label style={fieldStyle}>
                      Full name
                      {canEditRow ? (
                        <input name="fullName" defaultValue={row.fullName} required maxLength={200} style={inputStyle} />
                      ) : (
                        <span style={{ color: "#334155", fontSize: 14, fontWeight: 700 }}>{row.fullName || "—"}</span>
                      )}
                    </label>
                    <label style={fieldStyle}>
                      Short name
                      {canEditRow ? (
                        <input name="shortName" defaultValue={row.shortName} required maxLength={50} placeholder="e.g. Glen" style={inputStyle} />
                      ) : (
                        <span style={{ color: "#334155", fontSize: 14, fontWeight: 700 }}>{row.shortName || "—"}</span>
                      )}
                    </label>
                    <label style={fieldStyle}>
                      Role
                      <select name="tenantRole" defaultValue={row.tenantRole} disabled={!canEditRow} style={{ ...inputStyle, background: canEditRow ? "#fff" : "#f8fafc" }}>
                        {TENANT_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldStyle}>
                      Status
                      <select name="membershipStatus" defaultValue={row.membershipStatus} disabled={!canEditRow} style={{ ...inputStyle, background: canEditRow ? "#fff" : "#f8fafc" }}>
                        {MEMBERSHIP_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldStyle}>
                      Labour $/hr
                      <input name="quoteLabourRate" defaultValue={row.quoteLabourRate ?? ""} disabled={!canEditRow} type="number" min="0" step="0.01" placeholder="Global rate" style={{ ...inputStyle, background: canEditRow ? "#fff" : "#f8fafc" }} />
                      <span style={helpStyle}>Blank uses the company rate.</span>
                    </label>
                    <label style={fieldStyle}>
                      Quote layout
                      <select name="quoteEntryLayout" defaultValue={row.quoteEntryLayout ?? "list"} disabled={!canEditRow} style={{ ...inputStyle, background: canEditRow ? "#fff" : "#f8fafc" }}>
                        {QUOTE_ENTRY_LAYOUT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <span style={helpStyle}>{QUOTE_ENTRY_LAYOUT_OPTIONS.find((option) => option.value === row.quoteEntryLayout)?.description ?? QUOTE_ENTRY_LAYOUT_OPTIONS[0]?.description}</span>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "6px 18px", flexWrap: "wrap", fontSize: 11, color: "#94a3b8" }}>
                    <span>Joined {formatDate(row.membershipCreatedAt)}</span>
                    <span>Updated {formatDate(row.membershipUpdatedAt)}</span>
                  </div>
                </form>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 18, padding: 18, color: "#1e3a8a", lineHeight: 1.6 }}>
        <strong>Safe setup:</strong> new matching Google sign-ins appear here and can be left as Staff, changed to Manager/Installer/Accounts, marked Pending, or Disabled. Disabled users keep their history but cannot access the workspace.
      </section>
    </div>
  );
}
