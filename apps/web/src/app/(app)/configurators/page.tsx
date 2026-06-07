import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listConfiguratorTemplatesForTenant } from "@/server/configurators";
import { createConfiguratorTemplateAction, addConfiguratorFieldAction } from "./actions";

type ConfiguratorsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const cardStyle = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 24 } as const;
const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", fontSize: 15 } as const;
const textareaStyle = { borderRadius: 12, border: "1px solid #d0d5dd", padding: 14, fontSize: 15 } as const;

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
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 20 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16 }}>{error}</section> : null}

      <section style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Configurator builder</p>
        <h1 style={{ marginTop: 12, marginBottom: 12 }}>Template builder for sellable products</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
          Build configurable product templates in a single flow. Start with the template shell, then add the fields a customer will actually choose from in a quote.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Templates</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{templates.length}</div><div style={{ marginTop: 8, color: "#475467" }}>Configurator shells created</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Active</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{templates.filter((t) => t.status === "active").length}</div><div style={{ marginTop: 8, color: "#475467" }}>Ready for quoting</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Draft</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{templates.filter((t) => t.status === "draft").length}</div><div style={{ marginTop: 8, color: "#475467" }}>Still being built</div></div>
        <div style={cardStyle}><div style={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", textTransform: "uppercase" }}>Fields total</div><div style={{ marginTop: 10, fontSize: 32, fontWeight: 700 }}>{templates.reduce((sum, t) => sum + (Array.isArray(t.definitionJson?.fields) ? t.definitionJson.fields.length : 0), 0)}</div><div style={{ marginTop: 8, color: "#475467" }}>All customer-facing options across templates</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 420px) 1fr", gap: 20, alignItems: "start" }}>
        <form action={createConfiguratorTemplateAction} style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0 }}>1. Create template shell</h2>
          <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Template name</span><input name="name" required placeholder="5mm Corflute Sign" style={inputStyle} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Department</span><select name="department" defaultValue="signage" style={inputStyle}><option value="signage">Signage</option><option value="small_format">Small format</option><option value="installation">Installation</option><option value="general">General</option></select></label>
            <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Status</span><select name="status" defaultValue="draft" style={inputStyle}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
          </div>
          <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Product family</span><select name="productFamily" defaultValue="rigid_signage" style={inputStyle}><option value="rigid_signage">Rigid signage</option><option value="roll_media">Roll media</option><option value="banners">Banners</option><option value="stickers_labels">Stickers / labels</option><option value="window_wall_graphics">Window / wall graphics</option><option value="vehicle_graphics">Vehicle graphics</option><option value="display_products">Display products</option><option value="small_format_print">Small format print</option></select></label>
          <button type="submit" style={{ minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Create configurator</button>
        </form>

        <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>2. Build the customer-facing fields</h2>
            <p style={{ margin: "6px 0 0", color: "#475467" }}>Keep the builder practical: start with size, sides, finish, fixings, quantity, then expand. These fields become the quote selection snapshot later.</p>
          </div>
          {templates.length === 0 ? <div style={{ borderRadius: 16, border: "1px dashed #d0d5dd", padding: 24, color: "#475467" }}>No templates yet. Create a configurator shell first.</div> : (
            <div style={{ display: "grid", gap: 16 }}>
              {templates.map((template) => {
                const fields = Array.isArray(template.definitionJson?.fields) ? template.definitionJson.fields : [];
                return (
                  <article key={template.id} style={{ border: "1px solid #e5e7eb", borderRadius: 18, padding: 20, background: "#fafafa", display: "grid", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{template.name}</div>
                        <div style={{ marginTop: 6, color: "#475467", fontSize: 14 }}>{template.department} · {template.productFamily} · v{template.version}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase" }}>{template.status}</div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
                      <section style={{ display: "grid", gap: 12 }}>
                        <div style={{ fontWeight: 700 }}>Current fields</div>
                        {fields.length === 0 ? <div style={{ color: "#475467" }}>No fields yet.</div> : fields.map((field: any) => (
                          <div key={field.id || field.key} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                              <div style={{ fontWeight: 700 }}>{field.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#667085", textTransform: "uppercase" }}>{field.type}</div>
                            </div>
                            <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>Key: {field.key} {field.required ? "· Required" : "· Optional"}</div>
                            {Array.isArray(field.options) && field.options.length > 0 ? <div style={{ marginTop: 8, color: "#475467", fontSize: 14 }}>Options: {field.options.map((opt: any) => opt.label).join(", ")}</div> : null}
                          </div>
                        ))}
                      </section>

                      <form action={addConfiguratorFieldAction} style={{ display: "grid", gap: 12, border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fff" }}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <div style={{ fontWeight: 700 }}>Add field</div>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Label</span><input name="label" placeholder="Finish" style={inputStyle} /></label>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Key (optional)</span><input name="key" placeholder="finish" style={inputStyle} /></label>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Type</span><select name="type" defaultValue="select" style={inputStyle}><option value="select">Select</option><option value="text">Text</option><option value="quantity">Quantity</option></select></label>
                        <label style={{ display: "grid", gap: 8 }}><span style={{ fontWeight: 600 }}>Options (comma separated)</span><textarea name="optionsCsv" rows={3} placeholder="Gloss, Matte, No laminate" style={textareaStyle} /></label>
                        <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" name="required" defaultChecked /><span style={{ fontWeight: 600 }}>Required field</span></label>
                        <button type="submit" style={{ minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Add field</button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
