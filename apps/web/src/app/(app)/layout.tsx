import type { ReactNode } from "react";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listMembershipsForAuthUser } from "@/server/bootstrap/memberships";
import { AppNavLink } from "@/components/AppNavLink";
import { signOutAction, switchTenantAction, markAllNotificationsReadAction } from "./actions";
import { countUnreadNotificationsForTenant, listNotificationsForTenant } from "@/server/notifications";

type AppLayoutProps = {
  children: ReactNode;
};

const APP_VERSION = "V26.08.12.01";

const navItems = [
  { href: "/dashboard", label: "Dashboard", emoji: "⌂" },
  { href: "/enquiries", label: "Enquiries", emoji: "?" },
  { href: "/surveys", label: "Surveys", emoji: "⌖" },
  { href: "/quotes", label: "Quotes", emoji: "$" },
  { href: "/artwork-approvals", label: "Artwork", emoji: "▧" },
  { href: "/production", label: "Production", emoji: "⚒" },
  { href: "/clients", label: "Clients", emoji: "◉" },
  { href: "/materials", label: "Materials", emoji: "▥" },
  { href: "/products", label: "Products", emoji: "◇" },
  { href: "/settings", label: "Settings", emoji: "⚙" }
];

export default async function AppLayout({ children }: AppLayoutProps) {
  const user = await getRequiredSessionUser();
  const [memberships, activeTenant] = await Promise.all([
    listMembershipsForAuthUser(user.id),
    resolveActiveTenantForAuthUserId(user.id)
  ]);
  const [notifications, unreadCount] = activeTenant ? await Promise.all([
    listNotificationsForTenant(activeTenant.tenantId),
    countUnreadNotificationsForTenant(activeTenant.tenantId)
  ]) : [[], 0];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "264px minmax(0, 1fr)",
        background: "linear-gradient(180deg, #f7faff 0%, #f3f6fb 320px, #eef2f7 100%)"
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #e4e9f2",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(12px)",
          padding: 18,
          display: "grid",
          gridTemplateRows: "auto auto minmax(0, 1fr) auto",
          gap: 16,
          minHeight: 0,
          overflow: "hidden",
          position: "sticky",
          top: 0,
          height: "100vh",
          boxSizing: "border-box"
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            padding: "8px 8px 4px"
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 900, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "center" }}>
            {APP_VERSION}
          </div>
          <a href="/enquiries" style={{ display: "block", textDecoration: "none" }} aria-label="Production Manager home">
            <img
              src="/brand/production-manager-logo.svg"
              alt="Production Manager"
              style={{
                width: "100%",
                maxWidth: 206,
                height: "auto",
                display: "block",
                borderRadius: 16,
                boxShadow: "0 14px 28px rgba(15,23,42,0.08)"
              }}
            />
          </a>
        </div>

        <div
          style={{
            border: "1px solid #dbe4f0",
            borderRadius: 22,
            padding: 14,
            background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
            display: "grid",
            gap: 10
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 850 }}>Workspace</div>
              <div style={{ marginTop: 4, fontWeight: 950, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeTenant?.tenantName ?? "None selected"}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                {activeTenant ? `${activeTenant.tenantRole}` : "Create or select a tenant"}
              </div>
            </div>
            <span style={{ borderRadius: 999, background: "#e0f2fe", color: "#075985", padding: "5px 9px", fontSize: 11, fontWeight: 950 }}>
              {memberships.length}
            </span>
          </div>

          {memberships.length > 1 ? (
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 850, color: "#1d4ed8", fontSize: 13 }}>Switch workspace</summary>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {memberships.map((membership) => {
                  const isActive = activeTenant?.tenantId === membership.tenantId;

                  return (
                    <form action={switchTenantAction} key={`${membership.tenantId}-${membership.userProfileId}`}>
                      <input type="hidden" name="tenantId" value={membership.tenantId} />
                      <button
                        type="submit"
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: isActive ? "1px solid #93c5fd" : "1px solid #dbe4f0",
                          background: isActive ? "#eff6ff" : "#ffffff",
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{membership.tenantName}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                          {membership.tenantSlug} · {membership.tenantRole}
                        </div>
                      </button>
                    </form>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>

        <nav
          style={{
            display: "grid",
            gap: 4,
            alignContent: "start",
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 4,
            overscrollBehavior: "contain"
          }}
          aria-label="Primary navigation"
        >
          {navItems.map((item) => (
            <AppNavLink key={item.href} href={item.href} label={item.label} emoji={item.emoji} />
          ))}
        </nav>

        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis" }}>
            Signed in as <strong style={{ color: "#334155" }}>{user.email ?? "Unknown user"}</strong>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              style={{
                width: "100%",
                minHeight: 42,
                borderRadius: 15,
                border: "1px solid #dbe4f0",
                background: "#ffffff",
                color: "#334155",
                fontWeight: 850,
                cursor: "pointer"
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main style={{ padding: "24px 28px 36px", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, position: "relative", zIndex: 20 }}>
          <details style={{ position: "relative" }}>
            <summary style={{ listStyle: "none", cursor: "pointer", minHeight: 42, display: "flex", alignItems: "center", gap: 9, padding: "0 14px", border: "1px solid #cbd5e1", borderRadius: 14, background: "#fff", boxShadow: "0 8px 22px rgba(15,23,42,.08)", fontWeight: 900, color: "#0f172a" }}>
              <span aria-hidden="true" style={{ fontSize: 19 }}>●</span> Alerts
              {unreadCount > 0 ? <span style={{ minWidth: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: "#ef4444", color: "#fff", fontSize: 11 }}>{unreadCount}</span> : null}
            </summary>
            <div style={{ position: "absolute", right: 0, top: 50, width: "min(420px,calc(100vw - 40px))", maxHeight: 520, overflowY: "auto", border: "1px solid #dbe4f0", borderRadius: 18, background: "#fff", boxShadow: "0 24px 60px rgba(15,23,42,.18)", padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 6px 10px" }}>
                <strong>Recent alerts</strong>
                {unreadCount > 0 ? <form action={markAllNotificationsReadAction}><button style={{ border: 0, background: "transparent", color: "#2563eb", fontWeight: 850, cursor: "pointer" }}>Mark all read</button></form> : null}
              </div>
              <div style={{ display: "grid", gap: 7 }}>
                {notifications.length ? notifications.map((notification) => <a key={notification.id} href={notification.href ?? "#"} style={{ display: "grid", gap: 4, padding: 12, borderRadius: 13, border: notification.isRead ? "1px solid #e2e8f0" : "1px solid #93c5fd", background: notification.isRead ? "#fff" : "#eff6ff", textDecoration: "none", color: "inherit" }}>
                  <span style={{ fontWeight: 900 }}>{notification.title}</span>
                  {notification.message ? <span style={{ color: "#475569", fontSize: 13, lineHeight: 1.45 }}>{notification.message}</span> : null}
                  <span style={{ color: "#94a3b8", fontSize: 11 }}>{new Date(notification.createdAt).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</span>
                </a>) : <div style={{ padding: 18, color: "#64748b", textAlign: "center" }}>No alerts yet.</div>}
              </div>
            </div>
          </details>
        </div>
        {children}
      </main>
    </div>
  );
}
