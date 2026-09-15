import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listMachinesForTenant } from "@/server/productionResources";
import { createMachineAction, updateMachineAction, setMachineActiveAction } from "./actions";
import Link from "next/link";
import { ProductionSetupNav } from "@/components/ProductionSetupNav";

const input = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box" as const,
  minHeight: 42,
  border: "1px solid #cbd5e1",
  borderRadius: 9,
  padding: "0 10px",
  background: "#fff",
};

const card = {
  border: "1px solid #dbe4f0",
  borderRadius: 16,
  background: "#fff",
  padding: 18,
  boxShadow: "0 8px 24px rgba(15,23,42,.05)",
};

const fieldGroup = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "#f8fafc",
  padding: 14,
};

const groupTitle = {
  margin: "0 0 10px",
  fontSize: 12,
  fontWeight: 900,
  color: "#475569",
  textTransform: "uppercase" as const,
  letterSpacing: ".04em",
};

const types = ["printer", "cutter", "laminator", "router", "laser", "other"];
const speedUnits = ["sqm_per_hour", "linear_metres_per_hour", "sheets_per_hour", "a4_faces_per_minute"];

function MachineFields({ machine }: { machine?: any }) {
  return (
    <>
      <div style={fieldGroup}>
        <div style={groupTitle}>Machine details</div>
        <div className="machine-grid machine-grid-details">
          <label>
            Name
            <input name="name" defaultValue={machine?.name ?? ""} style={input} />
          </label>
          <label>
            Type
            <select name="machineType" defaultValue={machine?.machineType ?? "printer"} style={input}>
              {types.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Max width (mm)
            <input name="maxWidthMm" type="number" defaultValue={machine?.maxWidthMm ?? ""} style={input} />
          </label>
        </div>
      </div>

      <div style={fieldGroup}>
        <div style={groupTitle}>Performance</div>
        <div className="machine-grid machine-grid-performance">
          <label>
            Speed
            <input name="speedValue" type="number" step="0.01" defaultValue={machine?.speedValue ?? ""} style={input} />
          </label>
          <label>
            Speed unit
            <select name="speedUom" defaultValue={machine?.speedUom ?? "sqm_per_hour"} style={input}>
              {speedUnits.map((x) => (
                <option key={x} value={x}>
                  {x.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Setup time (min)
            <input name="setupMinutes" type="number" step="0.01" defaultValue={machine?.setupMinutes ?? ""} style={input} />
          </label>
        </div>
      </div>

      <div style={fieldGroup}>
        <div style={groupTitle}>Costing</div>
        <div className="machine-grid machine-grid-costing">
          <label>
            Machine $/hr
            <input name="hourlyCost" type="number" step="0.01" defaultValue={machine?.hourlyCost ?? ""} style={input} />
          </label>
          <label>
            Ink $/m²
            <input name="inkCostPerSqm" type="number" step="0.01" defaultValue={machine?.inkCostPerSqm ?? ""} style={input} />
          </label>
          <label>
            Colour click $/side
            <input
              name="colourImpressionCost"
              type="number"
              step="0.0001"
              defaultValue={machine?.colourImpressionCost ?? ""}
              style={input}
            />
          </label>
          <label>
            Mono click $/side
            <input
              name="monoImpressionCost"
              type="number"
              step="0.0001"
              defaultValue={machine?.monoImpressionCost ?? ""}
              style={input}
            />
          </label>
        </div>
        <p style={{ margin: "9px 0 0", fontSize: 12, color: "#64748b" }}>
          Use ink $/m² for wide-format printing. Use click rates for digital small-format printing. Leave fields at $0 where they do not apply.
        </p>
      </div>
    </>
  );
}

export default async function MachinesPage() {
  const u = await getRequiredSessionUser();
  const t = await resolveActiveTenantForAuthUserId(u.id);
  if (!t) redirect("/bootstrap");

  const rows = await listMachinesForTenant(t.tenantId);

  return (
    <main style={{ display: "grid", gap: 20 }}>
      <style>{`
        .machine-grid { display:grid; gap:12px; align-items:end; }
        .machine-grid label { display:grid; gap:6px; min-width:0; font-weight:700; color:#0f172a; }
        .machine-grid input,.machine-grid select { min-width:0; max-width:100%; box-sizing:border-box; }
        .machine-grid-details { grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr); }
        .machine-grid-performance { grid-template-columns:minmax(0,1fr) minmax(0,1.35fr) minmax(0,1fr); }
        .machine-grid-costing { grid-template-columns:repeat(4,minmax(0,1fr)); }
        .machine-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .machine-metric { border:1px solid #e2e8f0; border-radius:10px; padding:9px 10px; background:#f8fafc; }
        .machine-metric-label { display:block; color:#64748b; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.035em; margin-bottom:2px; }
        .machine-metric-value { display:block; color:#0f172a; font-size:14px; font-weight:800; }
        @media (max-width: 980px) {
          .machine-grid-details,.machine-grid-performance { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .machine-grid-costing { grid-template-columns:repeat(2,minmax(0,1fr)); }
        }
        @media (max-width: 620px) {
          .machine-grid-details,.machine-grid-performance,.machine-grid-costing,.machine-metrics { grid-template-columns:1fr; }
        }
      `}</style>

      <ProductionSetupNav active="resources" />
      <header>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#0284c7", textTransform: "uppercase" }}>Resources · machines</div>
        <h1 style={{ margin: "6px 0", fontSize: 36 }}>Machines</h1>
        <p style={{ color: "#64748b", maxWidth: 980, lineHeight: 1.55 }}>
          Store facts about each machine here: speed, capacity, setup and operating costs. To decide which machine performs Direct print, Laminate, Trim or another action, assign it once under <b>Processes</b>.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Link href="/machines" style={{ textDecoration: "none", borderRadius: 999, padding: "7px 11px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 900 }}>Machines</Link>
          <Link href="/labour" style={{ textDecoration: "none", borderRadius: 999, padding: "7px 11px", background: "#f1f5f9", color: "#475569", fontWeight: 900 }}>Labour & time</Link>
        </div>
      </header>

      <section style={card}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Add machine</h2>
            <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>
              Enter only the facts and costs that apply to this machine. After creating it, open Processes to assign it to the work it performs.
            </p>
          </div>
        </div>

        <form action={createMachineAction} style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <MachineFields />


          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              style={{
                minHeight: 44,
                minWidth: 150,
                border: 0,
                borderRadius: 10,
                background: "#2563eb",
                color: "#fff",
                fontWeight: 900,
                padding: "0 20px",
              }}
            >
              Create machine
            </button>
          </div>
        </form>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 14 }}>
        {rows.map((r: any) => {
          return (
            <article key={r.id} style={{ ...card, opacity: r.active ? 1 : 0.62, position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: "0 0 6px", fontSize: 22 }}>{r.name}</h3>
                  <div style={{ color: "#64748b", textTransform: "capitalize" }}>{r.machineType}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <details>
                    <summary
                      style={{
                        listStyle: "none",
                        cursor: "pointer",
                        border: "1px solid #94a3b8",
                        borderRadius: 9,
                        padding: "8px 10px",
                        fontWeight: 800,
                      }}
                    >
                      Edit
                    </summary>
                    <div
                      style={{
                        position: "absolute",
                        zIndex: 20,
                        right: 18,
                        marginTop: 8,
                        width: "min(980px,calc(100vw - 48px))",
                        ...card,
                        boxShadow: "0 20px 60px rgba(15,23,42,.22)",
                      }}
                    >
                      <form action={updateMachineAction} style={{ display: "grid", gap: 12 }}>
                        <input type="hidden" name="id" value={r.id} />
                        <MachineFields machine={r} />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            style={{
                              minHeight: 44,
                              minWidth: 130,
                              border: 0,
                              borderRadius: 10,
                              background: "#2563eb",
                              color: "#fff",
                              fontWeight: 900,
                              padding: "0 18px",
                            }}
                          >
                            Save changes
                          </button>
                        </div>
                      </form>
                    </div>
                  </details>
                  <form action={setMachineActiveAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                    <button style={{ border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", padding: "8px 10px" }}>
                      {r.active ? "Archive" : "Restore"}
                    </button>
                  </form>
                </div>
              </div>

              <div className="machine-metrics" style={{ marginTop: 14 }}>
                <div className="machine-metric">
                  <span className="machine-metric-label">Speed</span>
                  <span className="machine-metric-value">{r.speedValue} {r.speedUom.replaceAll("_", " ")}</span>
                </div>
                <div className="machine-metric">
                  <span className="machine-metric-label">Machine cost</span>
                  <span className="machine-metric-value">${r.hourlyCost}/hr · {r.setupMinutes} min setup</span>
                </div>
                <div className="machine-metric">
                  <span className="machine-metric-label">Capacity</span>
                  <span className="machine-metric-value">{r.maxWidthMm ? `${r.maxWidthMm} mm max width` : "No width limit set"}</span>
                </div>
                <div className="machine-metric">
                  <span className="machine-metric-label">Print costing</span>
                  <span className="machine-metric-value">
                    Ink ${r.inkCostPerSqm}/m² · Colour ${r.colourImpressionCost}/side · Mono ${r.monoImpressionCost}/side
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid #e2e8f0" }}>
                <Link href="/processes" style={{ color: "#2563eb", fontWeight: 850, fontSize: 12, textDecoration: "none" }}>Machine assignments are managed in Processes →</Link>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
