import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuthenticatedUser } from "@/lib/supabase/server";
import { listMembershipsForAuthUser } from "@/server/bootstrap/memberships";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { signOutAction, switchTenantAction } from "./actions";

type AppLayoutProps = {
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/company", label: "Company" },
  { href: "/users", label: "Users" },
  { href: "/products", label: "Products" },
  { href: "/configurators", label: "Configurators" },
  { href: "/recipes", label: "Recipes" },
  { href: "/quotes", label: "Quotes" },
  { href: "/integrations", label: "Integrations" },
  { href: "/bootstrap", label: "Bootstrap" }
];

export default async function AppLayout({ children }: AppLayoutProps) {
  const user = await requireAuthenticatedUser("/dashboard");
  const memberships = await listMembershipsForAuthUser(user.id);
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "300px 1fr"
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #e5e7eb",
          background: "#ffffff",
          padding: 24,
          display: "grid",
          gridTemplateRows: "auto auto auto 1fr auto",
          gap: 20
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#4f46e5"
            }}
          >
            Production Manager
          </div>
          <h2 style={{ margin: "10px 0 0", fontSize: 22 }}>Office</h2>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            background: "#fafafa"
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>Signed in as</div>
          <div style={{ marginTop: 6, fontWeight: 700, wordBreak: "break-word" }}>{user.email ?? "Unknown user"}</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#667085" }}>
            Memberships found: {memberships.length}
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            background: "#fafafa",
            display: "grid",
            gap: 10
          }}
        >
          <div style={{ fontSize: 12, color: "#667085", fontWeight: 700 }}>Active tenant</div>
          <div style={{ fontWeight: 700 }}>{activeTenant?.tenantName ?? "None selected"}</div>
          <div style={{ fontSize: 13, color: "#667085" }}>
            {activeTenant ? `${activeTenant.tenantSlug} · ${activeTenant.tenantRole}` : "Create or select a tenant"}
          </div>

          {memberships.length > 0 ? (
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
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
                        borderRadius: 12,
                        border: isActive ? "1px solid #4f46e5" : "1px solid #d0d5dd",
                        background: isActive ? "#eef2ff" : "#ffffff",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{membership.tenantName}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: "#667085" }}>
                        {membership.tenantSlug} · {membership.tenantRole}
                      </div>
                    </button>
                  </form>
                );
              })}
            </div>
          ) : null}
        </div>

        <nav style={{ display: "grid", gap: 10, alignContent: "start" }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fafafa",
                color: "#111827",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              width: "100%",
              minHeight: 42,
              borderRadius: 12,
              border: "1px solid #d0d5dd",
              background: "#ffffff",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            Sign out
          </button>
        </form>
      </aside>

      <main style={{ padding: 32 }}>{children}</main>
    </div>
  );
}
