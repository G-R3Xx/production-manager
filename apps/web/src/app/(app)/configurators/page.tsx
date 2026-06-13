import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listConfiguratorTemplatesForTenant } from "@/server/configurators";
import { createConfiguratorTemplateAction } from "./actions";

type ConfiguratorsPageProps = {
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

export default async function ConfiguratorsPage({ searchParams }: ConfiguratorsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    redirect("/bootstrap");
  }

  const templates = await listConfiguratorTemplatesForTenant(activeTenant.tenantId);
  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gap: 16 }}>
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
          Configurators
        </p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Configurator templates</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Build reusable configuration templates for <strong>{activeTenant.tenantName}</strong>. These templates become the basis for configurable products and quote line snapshots.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, alignItems: "start" }}>
        <form action={createConfiguratorTemplateAction} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0 }}>Add configurator</h2>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Template name</span>
            <input name="name" required placeholder="5mm Corflute Sign" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Department</span>
              <select name="department" defaultValue="signage" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
                <option value="signage">Signage</option>
                <option value="small_format">Small format</option>
                <option value="installation">Installation</option>
                <option value="general">General</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Status</span>
              <select name="status" defaultValue="draft" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>Product family</span>
            <select name="productFamily" defaultValue="rigid_signage" style={{ minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 16 }}>
              <option value="rigid_signage">Rigid signage</option>
              <option value="roll_media">Roll media</option>
              <option value="banners">Banners</option>
              <option value="stickers_labels">Stickers / labels</option>
              <option value="window_wall_graphics">Window / wall graphics</option>
              <option value="vehicle_graphics">Vehicle graphics</option>
              <option value="display_products">Display products</option>
              <option value="small_format_print">Small format print</option>
            </select>
          </label>

          <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Create configurator
          </button>
        </form>

        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Current templates</h2>
          {templates.length === 0 ? (
            <p style={{ color: "#475467" }}>No configurator templates yet. Add your first template from the form.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {templates.map((template) => {
                const definitionFieldCount = Array.isArray(template.definitionJson?.fields)
                  ? template.definitionJson.fields.length
                  : 0;

                return (
                  <div key={template.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{template.name}</div>
                        <div style={{ marginTop: 6, color: "#475467", fontSize: 14 }}>
                          {template.department} · {template.productFamily} · v{template.version}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase" }}>
                        {template.status}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, color: "#475467", fontSize: 14 }}>
                      Starter fields: {definitionFieldCount} · Ready to connect to products and later quote line snapshots.
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
