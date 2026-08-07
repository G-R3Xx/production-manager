import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { defaultSignageSizePresets, defaultSmallSizePresets, getCompanySettingsByTenantId, type QuoteSizePreset } from "@/server/company";
import { getEmailDomain, getTenantDomainAccessSettingsByTenantId } from "@/server/auth/domainJoin";
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

function sizePresetText(presets: QuoteSizePreset[] | null | undefined, fallback: QuoteSizePreset[]): string {
  const list = presets && presets.length > 0 ? presets : fallback;
  return list.map((preset) => `${preset.label} | ${preset.width} | ${preset.height}`).join("\n");
}

export default async function CompanyPage({ searchParams }: CompanyPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const [settings, teamDomainAccess] = await Promise.all([
    getCompanySettingsByTenantId(activeTenant.tenantId),
    getTenantDomainAccessSettingsByTenantId(activeTenant.tenantId)
  ]);
  const defaultTeamDomain =
    teamDomainAccess?.emailDomain ||
    getEmailDomain(settings?.email) ||
    getEmailDomain(user.email) ||
    "tenderedge.com.au";
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

      <form action={saveCompanySettingsAction} encType="multipart/form-data" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 16 }}>
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

        <section style={{ border: "1px solid #dbeafe", background: "#f8fbff", borderRadius: 18, padding: 18, display: "grid", gap: 14 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2563eb" }}>Client correspondence branding</p>
            <h2 style={{ margin: "6px 0 6px", fontSize: 20 }}>Workspace company logo</h2>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
              This logo is used on client-facing correspondence such as public quote links and artwork approval pages.
            </p>
          </div>

          {settings?.companyLogoUrl ? (
            <div style={{ border: "1px solid #d0d5dd", background: "#fff", borderRadius: 16, padding: 14, display: "inline-grid", width: "fit-content", gap: 8 }}>
              <img src={settings.companyLogoUrl} alt="Current workspace company logo" style={{ maxWidth: 240, maxHeight: 120, objectFit: "contain", display: "block" }} />
              <small style={{ color: "#667085" }}>Current client correspondence logo</small>
            </div>
          ) : null}

          <input type="hidden" name="companyLogoStoragePath" defaultValue={settings?.companyLogoStoragePath ?? ""} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Upload / change logo</span>
              <input type="file" name="companyLogoFile" accept="image/*" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #bfdbfe", padding: "10px 14px", fontSize: 15, background: "#fff" }} />
              <small style={{ color: "#475467" }}>PNG, SVG, JPG or WebP. Keep it under 5MB.</small>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Logo URL</span>
              <input name="companyLogoUrl" defaultValue={settings?.companyLogoUrl ?? ""} placeholder="or paste logo URL" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #bfdbfe", padding: "0 14px", fontSize: 16, background: "#fff" }} />
              <small style={{ color: "#475467" }}>Clear this field and save to remove the workspace logo.</small>
            </label>
          </div>
        </section>


        <section style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 18, padding: 18, display: "grid", gap: 14 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#15803d" }}>Staff Google access</p>
            <h2 style={{ margin: "6px 0 6px", fontSize: 20 }}>Auto-join team by email domain</h2>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
              Staff who sign in with this Google email domain will be added to this workspace automatically, instead of creating a new blank workspace.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr", gap: 16, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Allowed Google email domain</span>
              <input name="teamGoogleDomain" defaultValue={defaultTeamDomain} placeholder="tenderedge.com.au" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #86efac", padding: "0 14px", fontSize: 16, background: "#fff" }} />
              <small style={{ color: "#475467" }}>Use the domain only, eg tenderedge.com.au. Leave blank and save to turn this off.</small>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Default role</span>
              <select name="teamGoogleDefaultRole" defaultValue={teamDomainAccess?.defaultRole ?? "staff"} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #86efac", padding: "0 14px", fontSize: 16, background: "#fff" }}>
                <option value="staff">Staff</option>
                <option value="sales">Sales</option>
                <option value="installer">Installer</option>
                <option value="accounts">Accounts</option>
                <option value="manager">Manager</option>
              </select>
              <small style={{ color: "#475467" }}>New domain users are created with this workspace role.</small>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Auto join</span>
              <span style={{ minHeight: 46, borderRadius: 12, border: "1px solid #86efac", background: "#fff", padding: "0 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" name="teamGoogleAutoJoin" defaultChecked={teamDomainAccess?.autoJoin ?? true} />
                Enabled
              </span>
              <small style={{ color: "#475467" }}>Turn off to stop automatic staff access.</small>
            </label>
          </div>

          <div style={{ border: "1px solid #bbf7d0", background: "#ffffff", borderRadius: 14, padding: 12, color: "#166534", lineHeight: 1.55 }}>
            Current setup: <strong>{teamDomainAccess?.emailDomain || defaultTeamDomain}</strong> → this workspace as <strong>{teamDomainAccess?.defaultRole ?? "staff"}</strong>.
            Staff should sign out and back in with their Google account after this is saved.
          </div>
        </section>

        <section style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 18, padding: 18, display: "grid", gap: 14 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#2563eb" }}>Global quote pricing</p>
            <h2 style={{ margin: "6px 0 6px", fontSize: 20 }}>Markup and profit multipliers</h2>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
              Product, material, ink, labour and supplier values are treated as cost prices. Quotes use: calculated cost × markup × profit.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Global markup multiplier</span>
              <input name="globalMarkupMultiplier" defaultValue={settings?.globalMarkupMultiplier ?? "1.5"} placeholder="eg 1.5" inputMode="decimal" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #93c5fd", padding: "0 14px", fontSize: 16 }} />
              <small style={{ color: "#475467" }}>Example: x1.5 adds your standard overhead/markup to all quote items.</small>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Global profit multiplier</span>
              <input name="globalProfitMultiplier" defaultValue={settings?.globalProfitMultiplier ?? "1.2"} placeholder="eg 1.2" inputMode="decimal" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #93c5fd", padding: "0 14px", fontSize: 16 }} />
              <small style={{ color: "#475467" }}>Example: x1.2 adds your profit after markup. x1.5 × x1.2 = x1.8 total.</small>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Factory labour rate / hr</span>
              <input name="quoteLabourRate" defaultValue={settings?.quoteLabourRate ?? "66"} placeholder="eg 66" inputMode="decimal" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #93c5fd", padding: "0 14px", fontSize: 16 }} />
              <small style={{ color: "#475467" }}>Used for artwork, laminate application, finishing and install time.</small>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>CMYK / white ink rate per m²</span>
              <input name="quoteInkRatePerSqm" defaultValue={settings?.quoteInkRatePerSqm ?? "10"} placeholder="eg 10" inputMode="decimal" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #93c5fd", padding: "0 14px", fontSize: 16 }} />
              <small style={{ color: "#475467" }}>CMYK uses this rate. White ink adds this rate again.</small>
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Ink billing increment (m²)</span>
              <select name="quoteInkBillingIncrementSqm" defaultValue={settings?.quoteInkBillingIncrementSqm ?? "0.5"} style={{ minHeight: 46, borderRadius: 12, border: "1px solid #93c5fd", padding: "0 14px", fontSize: 16 }}>
                <option value="0">Exact calculated area</option>
                <option value="0.25">0.25m² increments</option>
                <option value="0.5">0.5m² increments</option>
                <option value="1">1m² increments</option>
              </select>
              <small style={{ color: "#475467" }}>Applied once to the total ink area for the quote line. Default is 0.5m².</small>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Mono print rate per m²</span>
              <input name="quoteMonoRatePerSqm" defaultValue={settings?.quoteMonoRatePerSqm ?? "4"} placeholder="eg 4" inputMode="decimal" style={{ minHeight: 46, borderRadius: 12, border: "1px solid #93c5fd", padding: "0 14px", fontSize: 16 }} />
              <small style={{ color: "#475467" }}>Used by the small-format print colour step.</small>
            </label>
          </div>
        </section>

        <section style={{ border: "1px solid #ddd6fe", background: "#faf5ff", borderRadius: 18, padding: 18, display: "grid", gap: 14 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7c3aed" }}>Quote card presets</p>
            <h2 style={{ margin: "6px 0 6px", fontSize: 20 }}>Editable size buttons</h2>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
              These control the quick size cards shown on the quote-side builder. Use one preset per line in the format: Label | width mm | height mm.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Signage size presets</span>
              <textarea name="quoteSignageSizePresetsText" defaultValue={sizePresetText(settings?.quoteSignageSizePresets, defaultSignageSizePresets)} rows={8} style={{ borderRadius: 12, border: "1px solid #c4b5fd", padding: 14, fontSize: 14, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }} />
              <small style={{ color: "#475467" }}>Example: 600 × 900 mm | 600 | 900</small>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Small-format size presets</span>
              <textarea name="quoteSmallSizePresetsText" defaultValue={sizePresetText(settings?.quoteSmallSizePresets, defaultSmallSizePresets)} rows={8} style={{ borderRadius: 12, border: "1px solid #c4b5fd", padding: 14, fontSize: 14, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }} />
              <small style={{ color: "#475467" }}>Example: A5 | 148 | 210</small>
            </label>
          </div>
        </section>

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
