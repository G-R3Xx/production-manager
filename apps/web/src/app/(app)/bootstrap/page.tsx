import { bootstrapTenantAction } from "./actions";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

type BootstrapPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  fallback = ""
): string {
  const value = params[key];

  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

const bootstrapSteps = [
  "Create or confirm authenticated user profile",
  "Create first tenant",
  "Create owner membership",
  "Write tenant settings row",
  "Redirect into dashboard"
];

export default async function BootstrapPage({ searchParams }: BootstrapPageProps) {
  const user = await requireAuthenticatedUser("/bootstrap");
  const params = (await searchParams) ?? {};
  const error = readParam(params, "error");

  return (
    <div
      style={{
        display: "grid",
        gap: 20
      }}
    >
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)"
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#4f46e5"
          }}
        >
          Tenant bootstrap
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12, fontSize: 34, lineHeight: 1.1 }}>
          First-tenant bootstrap flow
        </h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 780 }}>
          Signed in as <strong>{user.email ?? user.id}</strong>. This step writes the owner
          profile, tenant, membership, and tenant settings when the database connection is in
          place.
        </p>
      </section>

      {error ? (
        <section
          style={{
            border: "1px solid #fda29b",
            background: "#fff5f4",
            color: "#b42318",
            borderRadius: 16,
            padding: 16
          }}
        >
          {error}
        </section>
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 20,
          alignItems: "start"
        }}
      >
        <form
          action={bootstrapTenantAction}
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 20,
            padding: 24,
            display: "grid",
            gap: 16
          }}
        >
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Full name</span>
            <input
              type="text"
              name="fullName"
              defaultValue={user.user_metadata.full_name ?? ""}
              required
              style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Short name</span>
            <input
              type="text"
              name="shortName"
              placeholder="Glen"
              required
              style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Business name</span>
            <input
              type="text"
              name="tenantName"
              placeholder="Graphic Content"
              required
              style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Tenant slug</span>
            <input
              type="text"
              name="tenantSlug"
              placeholder="graphic-content"
              style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}
            />
          </label>

          <button
            type="submit"
            style={{
              minHeight: 46,
              borderRadius: 12,
              border: "none",
              background: "#111827",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            Create first tenant
          </button>
        </form>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 20,
            padding: 24
          }}
        >
          <h2 style={{ marginTop: 0 }}>Flow shape</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 12 }}>
            {bootstrapSteps.map((step) => (
              <li key={step} style={{ color: "#111827", lineHeight: 1.5 }}>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </section>
    </div>
  );
}
