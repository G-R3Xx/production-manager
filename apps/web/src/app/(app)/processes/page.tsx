import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProcessSetupResourcesForTenant, type LabourRecord, type MachineRecord, type ProcessRecord } from "@/server/productionResources";
import { ProductionSetupNav } from "@/components/ProductionSetupNav";
import { ProcessBuilder } from "./ProcessBuilder";
import { ProcessEditDialog } from "./ProcessEditDialog";
import { createStarterProcessesAction, setProcessActiveAction } from "./actions";

const departments = [
  { value: "signage", label: "Signage" },
  { value: "small_format", label: "Small format" },
  { value: "plan_printing", label: "Plan printing" },
  { value: "displays", label: "Displays" },
  { value: "vehicle_graphics", label: "Vehicle graphics" },
  { value: "general", label: "General / service" }
];

const types = [
  { value: "print", label: "Printing" },
  { value: "laminate", label: "Laminating" },
  { value: "cut", label: "Cutting / trimming" },
  { value: "mount", label: "Mounting / application" },
  { value: "finish", label: "Finishing" },
  { value: "pack", label: "Packing" },
  { value: "install", label: "Installation" },
  { value: "other", label: "Other" }
];

const processIcons: Record<string, string> = {
  print: "▣",
  laminate: "▤",
  cut: "✂",
  mount: "▱",
  finish: "✦",
  pack: "□",
  install: "⌂",
  other: "•"
};

function departmentLabel(value: string) {
  return departments.find((department) => department.value === value)?.label ?? value.replaceAll("_", " ");
}

function typeLabel(value: string) {
  return types.find((type) => type.value === value)?.label ?? value.replaceAll("_", " ");
}

export default async function ProcessesPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
}) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const setup = await listProcessSetupResourcesForTenant(tenant.tenantId);
  const rows = setup.processes;
  const labour = setup.labour;
  const machines = setup.machines;

  const activeRows = rows.filter((row) => row.active);
  const archivedRows = rows.filter((row) => !row.active);

  return (
    <main style={{ display: "grid", gap: 22 }}>
      <ProductionSetupNav active="processes" />
      <header>
        <div style={eyebrow}>Process library</div>
        <h1 style={{ margin: "6px 0", fontSize: 38 }}>Processes</h1>
        <p style={{ margin: 0, maxWidth: 960, color: "#64748b", lineHeight: 1.6 }}>
          A process is one reusable shop action. For normal finishing, link one Shop Operation and let that operation carry its consumable + labour rule. Only link a Machine when the equipment itself has meaningful run cost, wear, ink, bits or capacity constraints.
        </p>
      </header>

      {params.message ? <div style={successBanner}>{params.message}</div> : null}
      {params.error ? <div style={errorBanner}>{params.error}</div> : null}

      {!activeRows.length ? (
        <section style={{ ...card, borderColor: "#99f6e4", background: "linear-gradient(135deg,#f0fdfa,#ecfeff)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ maxWidth: 760 }}>
              <div style={eyebrow}>Fastest way to get started</div>
              <h2 style={{ margin: "6px 0 8px", fontSize: 25 }}>Add the recommended signage processes</h2>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.55 }}>
                This creates Direct print, Roll print, Laminate, Trim / cut, Mount / apply, Finishing, Pack and Install. You can edit or archive any of them later, and existing names will not be duplicated.
              </p>
            </div>
            <form action={createStarterProcessesAction}>
              <button style={primaryButton}>Add recommended processes</button>
            </form>
          </div>
        </section>
      ) : null}

      <section style={card}>
        <ProcessBuilder labour={labour.map((row) => ({ id: row.id, name: row.name, department: row.department, active: row.active }))} machines={machines.map((row) => ({ id: row.id, name: row.name, machineType: row.machineType, active: row.active }))} />
      </section>

      <section style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={eyebrow}>Available to production methods</div>
            <h2 style={{ margin: "5px 0 0", fontSize: 27 }}>Active processes</h2>
          </div>
          <div style={{ color: "#64748b", fontWeight: 800 }}>{activeRows.length} active</div>
        </div>

        {activeRows.length ? (
          <div style={processGrid}>
            {activeRows.map((row) => (
              <ProcessCard key={row.id} row={row} labour={labour} machines={machines} />
            ))}
          </div>
        ) : (
          <div style={emptyState}>
            <strong>No processes yet.</strong>
            <span>Use the recommended starter set or add your first process above.</span>
          </div>
        )}
      </section>

      {archivedRows.length ? (
        <details style={card}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "#475569" }}>Archived processes ({archivedRows.length})</summary>
          <div style={{ ...processGrid, marginTop: 16 }}>
            {archivedRows.map((row) => <ProcessCard key={row.id} row={row} labour={labour} machines={machines} />)}
          </div>
        </details>
      ) : null}
    </main>
  );
}

function ProcessCard({ row, labour, machines }: { row: ProcessRecord; labour: LabourRecord[]; machines: MachineRecord[] }) {
  return (
    <article style={{ ...card, opacity: row.active ? 1 : 0.64, position: "relative", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
          <span style={processIcon}>{processIcons[row.processType] ?? "•"}</span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 21, color: "#0f172a" }}>{row.name}</h3>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
              <span style={pill}>{typeLabel(row.processType)}</span>
              <span style={pill}>{departmentLabel(row.department)}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ProcessEditDialog
            row={{
              id: row.id,
              name: row.name,
              department: row.department,
              processType: row.processType,
              machineIds: row.machineIds,
              labourOperationId: row.labourOperationId
            }}
            labour={labour.map((item) => ({ id: item.id, name: item.name, active: item.active }))}
            machines={machines.map((item) => ({ id: item.id, name: item.name, active: item.active }))}
          />
          <form action={setProcessActiveAction}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="active" value={row.active ? "false" : "true"} />
            <button style={secondaryButton}>{row.active ? "Archive" : "Restore"}</button>
          </form>
        </div>
      </div>

      <div style={{ paddingTop: 12, borderTop: "1px solid #e2e8f0", color: "#475569", fontSize: 14, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <span>Machine: <strong style={{ color: "#0f172a" }}>{row.machineNames[0] ?? "Not required"}</strong></span>
        <span>Operation: <strong style={{ color: "#0f172a" }}>{row.labourOperationName ?? "Not linked"}</strong></span>
      </div>
    </article>
  );
}

const eyebrow: CSSProperties = { fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".07em" };
const card: CSSProperties = { border: "1px solid #dbe4f0", borderRadius: 17, background: "#fff", padding: 20, boxShadow: "0 8px 24px rgba(15,23,42,.05)" };
const processGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 14 };
const processIcon: CSSProperties = { width: 42, height: 42, borderRadius: 12, background: "#f0fdfa", color: "#0f766e", display: "grid", placeItems: "center", fontSize: 21, fontWeight: 950, flex: "0 0 42px" };
const pill: CSSProperties = { borderRadius: 999, background: "#f1f5f9", color: "#475569", padding: "5px 9px", fontSize: 12, fontWeight: 850 };
const emptyState: CSSProperties = { minHeight: 130, border: "1px dashed #94a3b8", borderRadius: 15, display: "grid", placeContent: "center", justifyItems: "center", gap: 5, color: "#64748b" };
const successBanner: CSSProperties = { border: "1px solid #86efac", background: "#f0fdf4", color: "#166534", borderRadius: 12, padding: "12px 14px", fontWeight: 800 };
const errorBanner: CSSProperties = { border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b", borderRadius: 12, padding: "12px 14px", fontWeight: 800 };
const primaryButton: CSSProperties = { minHeight: 44, border: 0, borderRadius: 10, background: "#0f766e", color: "#fff", fontWeight: 950, padding: "0 18px", cursor: "pointer", font: "inherit" };
const secondaryButton: CSSProperties = { listStyle: "none", minHeight: 38, display: "grid", placeItems: "center", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#334155", padding: "0 11px", fontWeight: 850, cursor: "pointer", font: "inherit" };
