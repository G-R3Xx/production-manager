import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getCompanySettingsByTenantId } from "@/server/company";
import { saveCompanySettingsAction } from "./actions";

type CompanyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function CompanyPage({ searchParams }: CompanyPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const settings = await getCompanySettingsByTenantId(activeTenant.tenantId);
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? (
        <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>
          {message}
        </section>
      ) : null}

      {error ? (
        <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>
          {error}
        </section>
      ) : null}

      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Company
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Company settings</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Editing tenant: <strong>{activeTenant.tenantName}</strong> ({activeTenant.tenantSlug})
        </p>
      </section>

      <form action={saveCompanySettingsAction} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Legal name</span>
            <input name="companyLegalName" defaultValue={settings?.companyLegalName ?? ""} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Trading name</span>
            <input name="tradingName" defaultValue={settings?.tradingName ?? activeTenant.tenantName} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 180px", gap: 16 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>ABN</span>
            <input name="abn" defaultValue={settings?.abn ?? ""} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Phone</span>
            <input name="phone" defaultValue={settings?.phone ?? ""} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Currency</span>
            <input name="defaultCurrency" maxLength={3} defaultValue={settings?.defaultCurrency ?? "AUD"} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16, textTransform: "uppercase" }} />
          </label>
        </div>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Email</span>
          <input type="email" name="email" defaultValue={settings?.email ?? activeTenant.email ?? ""} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Address</span>
          <textarea name="address" defaultValue={settings?.address ?? ""} rows={4} style={{ borderRadius: 12, border: "1px solid #d0d5dd", padding: 14, fontSize: 16, resize: "vertical" }} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Quote terms</span>
          <textarea name="quoteTerms" defaultValue={settings?.quoteTerms ?? ""} rows={4} style={{ borderRadius: 12, border: "1px solid #d0d5dd", padding: 14, fontSize: 16, resize: "vertical" }} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Proof terms</span>
          <textarea name="proofTerms" defaultValue={settings?.proofTerms ?? ""} rows={4} style={{ borderRadius: 12, border: "1px solid #d0d5dd", padding: 14, fontSize: 16, resize: "vertical" }} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Job terms</span>
          <textarea name="jobTerms" defaultValue={settings?.jobTerms ?? ""} rows={4} style={{ borderRadius: 12, border: "1px solid #d0d5dd", padding: 14, fontSize: 16, resize: "vertical" }} />
        </label>

        <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Save company settings
        </button>
      </form>
    </div>
  );
}
