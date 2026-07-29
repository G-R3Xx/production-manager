import Link from "next/link";
import { redirect } from "next/navigation";
import { NewEnquiryForm } from "@/app/(app)/enquiries/NewEnquiryForm";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listCustomersForTenant } from "@/server/customers";

type TabletEnquiriesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function TabletEnquiriesPage({ searchParams }: TabletEnquiriesPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const [clients, params] = await Promise.all([
    listCustomersForTenant(activeTenant.tenantId),
    searchParams ?? Promise.resolve({})
  ]);
  const message = readParam(params, "message");
  const error = readParam(params, "error");

  return (
    <main
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "clamp(18px, 3vw, 38px)",
        background: "radial-gradient(circle at top left, #e0edff 0%, #f7faff 38%, #eef2f7 100%)"
      }}
    >
      <style>{`
        @media (max-width: 760px) {
          .tablet-enquiry-two-column { grid-template-columns: 1fr !important; }
          .tablet-mode-header { align-items: flex-start !important; }
          .tablet-photo-heading { align-items: stretch !important; flex-direction: column !important; }
          .tablet-photo-heading button { width: 100% !important; }
        }
        @media (max-width: 520px) {
          .tablet-enquiry-form { padding: 20px !important; border-radius: 22px !important; }
          .tablet-mode-header { display: grid !important; }
          .tablet-photo-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ width: "min(920px, 100%)", margin: "0 auto", display: "grid", gap: 18 }}>
        <header
          className="tablet-mode-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 18,
            padding: "4px 4px 2px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <img
              src="/brand/production-manager-icon.svg"
              alt=""
              style={{ width: 62, height: 62, borderRadius: 18, boxShadow: "0 12px 30px rgba(15,23,42,0.12)" }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#155eef", fontSize: 13, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>Reception tablet mode</div>
              <h1 style={{ margin: "4px 0 0", fontSize: "clamp(26px, 4vw, 38px)", lineHeight: 1.1 }}>Add a new enquiry</h1>
              <p style={{ margin: "7px 0 0", color: "#64748b", fontSize: 15 }}>{activeTenant.tenantName}</p>
            </div>
          </div>

          <Link
            href="/enquiries"
            style={{
              minHeight: 48,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 18px",
              borderRadius: 15,
              border: "1px solid #cbd5e1",
              background: "rgba(255,255,255,0.86)",
              color: "#334155",
              fontWeight: 850,
              textDecoration: "none",
              whiteSpace: "nowrap"
            }}
          >
            Exit tablet mode
          </Link>
        </header>

        {message ? (
          <section style={{ border: "1px solid #86efac", background: "#f0fdf4", color: "#166534", borderRadius: 18, padding: "16px 18px", fontSize: 17, fontWeight: 850 }}>
            ✓ {message}. Ready for the next enquiry.
          </section>
        ) : null}

        {error ? (
          <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 18, padding: "16px 18px", fontSize: 17, fontWeight: 800 }}>
            {error}
          </section>
        ) : null}

        <NewEnquiryForm clients={clients} mode="tablet" returnTo="/enquiries/tablet" />

        <p style={{ margin: "0 0 8px", textAlign: "center", color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>
          V26.07.29.05
        </p>
      </div>
    </main>
  );
}
