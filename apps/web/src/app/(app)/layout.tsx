import type { ReactNode } from "react";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listMembershipsForAuthUser } from "@/server/bootstrap/memberships";
import { AppNavLink } from "@/components/AppNavLink";
import { signOutAction, switchTenantAction } from "./actions";

type AppLayoutProps = {
  children: ReactNode;
};

const APP_VERSION = "V26.07.15.01";

const navItems = [
  { href: "/dashboard", label: "Dashboard", emoji: "⌂" },
  { href: "/enquiries", label: "Enquiries", emoji: "?" },
  { href: "/surveys", label: "Surveys", emoji: "⌖" },
  { href: "/quotes", label: "Quotes", emoji: "$" },
  { href: "/artwork-approvals", label: "Artwork", emoji: "▧" },
  { href: "/production", label: "Production", emoji: "⚒" },
  { href: "/clients", label: "Clients", emoji: "◉" },
  { href: "/suppliers", label: "Suppliers", emoji: "▣" },
  { href: "/materials", label: "Materials", emoji: "▥" },
  { href: "/products", label: "Products", emoji: "◇" },
  { href: "/company", label: "Settings", emoji: "⚙" },
  { href: "/users", label: "Staff & roles", emoji: "♙" },
  { href: "/integrations", label: "Integrations", emoji: "↔" }
];

export default async function AppLayout({ children }: AppLayoutProps) {
  const user = await getRequiredSessionUser();
  const [memberships, activeTenant] = await Promise.all([
    listMembershipsForAuthUser(user.id),
    resolveActiveTenantForAuthUserId(user.id)
  ]);

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

      <main style={{ padding: "24px 28px 36px", minWidth: 0 }}>{children}</main>
    </div>
  );
}
