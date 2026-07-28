import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  listLabourForTenant,
  listMachinesForTenant,
  listProcessesForTenant,
  listRecipesForTenant,
  previewRecipeCost
} from "@/server/productionResources";
import { listMaterialsForTenant } from "@/server/materials";
import { createRecipeAction, setRecipeActiveAction, updateRecipeAction } from "./actions";
import { ManufacturingMethodBuilder } from "./ManufacturingMethodBuilder";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const card: CSSProperties = {
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  background: "#fff",
  padding: 20,
  boxShadow: "0 8px 24px rgba(15,23,42,.05)"
};

const input: CSSProperties = {
  width: "100%",
  minHeight: 42,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "0 11px",
  boxSizing: "border-box",
  background: "#fff"
};

function read(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : String(value ?? "");
}

function money(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function ReadinessCard({ label, count, ready, href, action }: { label: string; count: number; ready: boolean; href: string; action: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit", border: ready ? "1px solid #a7f3d0" : "1px solid #fed7aa", borderRadius: 14, padding: 14, background: ready ? "#f0fdf4" : "#fff7ed" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong>{label}</strong>
        <span style={{ display: "grid", placeItems: "center", minWidth: 28, height: 28, borderRadius: 999, background: ready ? "#047857" : "#c2410c", color: "#fff", fontWeight: 950, fontSize: 12 }}>{count}</span>
      </div>
      <div style={{ marginTop: 6, color: ready ? "#166534" : "#9a3412", fontSize: 12, fontWeight: 800 }}>{ready ? "Ready" : action}</div>
    </Link>
  );
}

export default async function ManufacturingMethodsPage({ searchParams }: Props) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const [materials, processes, recipes, machines, labour] = await Promise.all([
    listMaterialsForTenant(tenant.tenantId),
    listProcessesForTenant(tenant.tenantId),
    listRecipesForTenant(tenant.tenantId),
    listMachinesForTenant(tenant.tenantId),
    listLabourForTenant(tenant.tenantId)
  ]);

  const previewId = read(params, "preview");
  const width = Math.max(1, Number(read(params, "width") || 600));
  const height = Math.max(1, Number(read(params, "height") || 450));
  const qty = Math.max(1, Number(read(params, "qty") || 10));
  const preview = previewId ? await previewRecipeCost(tenant.tenantId, previewId, width, height, qty) : null;
  const message = read(params, "message");
  const error = read(params, "error");

  const activeMaterials = materials.filter((row) => row.active);
  const activeProcesses = processes.filter((row) => row.active);
  const activeMachines = machines.filter((row) => row.active);
  const activeLabour = labour.filter((row) => row.active);
  const activeRecipes = recipes.filter((row) => row.active);
  const archivedRecipes = recipes.filter((row) => !row.active);

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <header>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#0f766e", textTransform: "uppercase" }}>Shared costing engine</div>
        <h1 style={{ margin: "6px 0", fontSize: 36 }}>Manufacturing methods</h1>
        <p style={{ color: "#64748b", maxWidth: 950, lineHeight: 1.6 }}>A method is the reusable recipe behind a product: its main material, the production steps in order, and the pricing rules. Create it once, then select it in the Product Build tab so internal quotes and WordPress use the same calculation.</p>
      </header>

      {message ? <div style={{ padding: 14, borderRadius: 13, border: "1px solid #a7f3d0", background: "#f0fdf4", color: "#166534", fontWeight: 850 }}>{message}</div> : null}
      {error ? <div style={{ padding: 14, borderRadius: 13, border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", fontWeight: 850 }}>{error}</div> : null}

      <section style={{ ...card, background: "linear-gradient(135deg,#f0fdfa,#ffffff)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 720 }}>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase" }}>Before creating methods</div>
            <h2 style={{ margin: "6px 0 4px" }}>Production setup readiness</h2>
            <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55 }}>Materials provide stock cost. Production Steps describe what happens. Machines and labour provide the running cost. You can create a basic method without every resource, but missing resources will show as $0 in the preview.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 9, flex: "1 1 620px" }}>
            <ReadinessCard label="Materials" count={activeMaterials.length} ready={activeMaterials.length > 0} href="/materials" action="Add materials" />
            <ReadinessCard label="Production steps" count={activeProcesses.length} ready={activeProcesses.length > 0} href="/processes" action="Add steps" />
            <ReadinessCard label="Machines" count={activeMachines.length} ready={activeMachines.length > 0} href="/machines" action="Add machines" />
            <ReadinessCard label="Labour rates" count={activeLabour.length} ready={activeLabour.length > 0} href="/labour" action="Add labour" />
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase" }}>Guided setup</div>
            <h2 style={{ margin: "5px 0" }}>Create a manufacturing method</h2>
            <p style={{ margin: 0, color: "#64748b" }}>Example: Corflute 5mm → Direct print → Trim → Eyelets.</p>
          </div>
          <span style={{ borderRadius: 999, background: "#e0f2fe", color: "#075985", padding: "7px 11px", fontSize: 12, fontWeight: 900 }}>{activeRecipes.length} active methods</span>
        </div>
        <ManufacturingMethodBuilder action={createRecipeAction} materials={materials} processes={processes} />
      </section>

      {preview ? (
        <section style={{ ...card, borderColor: "#99f6e4", background: "#f0fdfa" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase" }}>Test calculation</div>
              <h2 style={{ margin: "5px 0" }}>{width} × {height} mm · Qty {qty}</h2>
            </div>
            <Link href="/manufacturing-methods" style={{ color: "#0f766e", fontWeight: 900 }}>Close preview</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginTop: 14 }}>
            {[
              ["Area", `${preview.areaSqm} m²`],
              ["Material", money(preview.materialCost)],
              ["Machines", money(preview.machineCost)],
              ["Ink", money(preview.inkCost)],
              ["Labour", money(preview.labourCost)],
              ["Sell price", money(preview.sellPrice)]
            ].map(([label, value]) => <div key={label} style={{ padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #ccfbf1" }}><div style={{ fontSize: 12, color: "#64748b" }}>{label}</div><div style={{ marginTop: 5, fontSize: 21, fontWeight: 950 }}>{value}</div></div>)}
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
            {preview.processBreakdown?.map((row: { processName: string; machineName: string | null; machineCost: number; inkCost: number; labourCost: number }) => (
              <div key={row.processName} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", background: "#fff", borderRadius: 10, flexWrap: "wrap" }}>
                <span><b>{row.processName}</b> · {row.machineName ?? "No compatible machine"}</span>
                <span>Machine {money(row.machineCost)} · Ink {money(row.inkCost)} · Labour {money(row.labourCost)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ display: "grid", gap: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Existing methods</h2>
            <p style={{ margin: "5px 0 0", color: "#64748b" }}>Test a price, edit the guided recipe, or archive methods no longer used.</p>
          </div>
        </div>

        {activeRecipes.length ? activeRecipes.map((recipe) => (
          <article key={recipe.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: "0 0 5px", fontSize: 22 }}>{recipe.name}</h3>
                <div style={{ color: "#64748b", textTransform: "capitalize" }}>{recipe.department}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <details>
                  <summary style={{ listStyle: "none", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 10, padding: "9px 12px", fontWeight: 900 }}>Edit method</summary>
                  <div style={{ marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
                    <ManufacturingMethodBuilder action={updateRecipeAction} materials={materials} processes={processes} recipe={recipe} mode="edit" />
                  </div>
                </details>
                <form action={setRecipeActiveAction}>
                  <input type="hidden" name="id" value={recipe.id} />
                  <input type="hidden" name="active" value="false" />
                  <button style={{ minHeight: 40, border: "1px solid #fecaca", borderRadius: 10, background: "#fff", color: "#b42318", padding: "0 12px", fontWeight: 850, cursor: "pointer" }}>Archive</button>
                </form>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              <div><span style={{ color: "#64748b" }}>Material:</span> <b>{recipe.materialName ?? "No physical material"}</b></div>
              <div><span style={{ color: "#64748b" }}>Production sequence:</span> <b>{recipe.processNames.join(" → ") || "No steps added"}</b></div>
              <div style={{ color: "#64748b", fontSize: 13 }}>Waste {recipe.wastePercent}% · Markup ×{recipe.markupMultiplier} · Profit ×{recipe.profitMultiplier}</div>
            </div>

            <form method="get" style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3,minmax(120px,1fr)) auto", gap: 9, alignItems: "end" }}>
              <input type="hidden" name="preview" value={recipe.id} />
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Width mm<input name="width" type="number" min="1" defaultValue="600" style={input} /></label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Height mm<input name="height" type="number" min="1" defaultValue="450" style={input} /></label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Quantity<input name="qty" type="number" min="1" defaultValue="10" style={input} /></label>
              <button style={{ minHeight: 42, border: 0, borderRadius: 10, background: "#0f172a", color: "#fff", fontWeight: 900, padding: "0 15px", cursor: "pointer" }}>Test price</button>
            </form>
          </article>
        )) : <div style={{ ...card, color: "#64748b" }}>No manufacturing methods yet. Use the guided builder above to create the first one.</div>}

        {archivedRecipes.length ? (
          <details style={card}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>Archived methods ({archivedRecipes.length})</summary>
            <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
              {archivedRecipes.map((recipe) => (
                <div key={recipe.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
                  <div><strong>{recipe.name}</strong><div style={{ marginTop: 3, color: "#64748b", fontSize: 13 }}>{recipe.materialName ?? "No material"} · {recipe.processNames.join(" → ") || "No steps"}</div></div>
                  <form action={setRecipeActiveAction}><input type="hidden" name="id" value={recipe.id} /><input type="hidden" name="active" value="true" /><button style={{ minHeight: 38, border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", padding: "0 12px", fontWeight: 850, cursor: "pointer" }}>Restore</button></form>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </main>
  );
}
