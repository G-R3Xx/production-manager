import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProcessesForTenant, listLabourForTenant } from "@/server/productionResources";
import { ProcessBuilder } from "./ProcessBuilder";
import { createStarterProcessesAction, setProcessActiveAction, updateProcessAction } from "./actions";

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
  const [rows, labour] = await Promise.all([
    listProcessesForTenant(tenant.tenantId),
    listLabourForTenant(tenant.tenantId)
  ]);

  const activeRows = rows.filter((row) => row.active);
  const archivedRows = rows.filter((row) => !row.active);

  return (
    <main style={{ display: "grid", gap: 22 }}>
      <header>
        <div style={eyebrow}>Settings · production resources</div>
        <h1 style={{ margin: "6px 0", fontSize: 38 }}>Production steps</h1>
        <p style={{ margin: 0, maxWidth: 960, color: "#64748b", lineHeight: 1.6 }}>
          A production step is one thing that happens to a job—such as print, laminate, trim, eyelet, pack or install. Manufacturing methods combine these steps in the order the work is completed.
        </p>
      </header>

      {params.message ? <div style={successBanner}>{params.message}</div> : null}
      {params.error ? <div style={errorBanner}>{params.error}</div> : null}

      <section style={flowGrid}>
        <FlowCard number="1" title="Production step" body="One action, such as Direct print or Trim / cut." active />
        <FlowArrow />
        <FlowCard number="2" title="Machine or labour" body="Connect the equipment or staff time that performs the step." href="/machines" />
        <FlowArrow />
        <FlowCard number="3" title="Manufacturing method" body="Arrange the steps in the exact order a product is made." href="/manufacturing-methods" />
      </section>

      {!activeRows.length ? (
        <section style={{ ...card, borderColor: "#99f6e4", background: "linear-gradient(135deg,#f0fdfa,#ecfeff)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ maxWidth: 760 }}>
              <div style={eyebrow}>Fastest way to get started</div>
              <h2 style={{ margin: "6px 0 8px", fontSize: 25 }}>Add the recommended signage steps</h2>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.55 }}>
                This creates Direct print, Roll print, Laminate, Trim / cut, Mount / apply, Finishing, Pack and Install. You can edit or archive any of them later, and existing names will not be duplicated.
              </p>
            </div>
            <form action={createStarterProcessesAction}>
              <button style={primaryButton}>Add recommended steps</button>
            </form>
          </div>
        </section>
      ) : null}

      <section style={card}>
        <ProcessBuilder labour={labour.map((row) => ({ id: row.id, name: row.name, department: row.department, active: row.active }))} />
      </section>

      <section style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={eyebrow}>Available to manufacturing methods</div>
            <h2 style={{ margin: "5px 0 0", fontSize: 27 }}>Active production steps</h2>
          </div>
          <div style={{ color: "#64748b", fontWeight: 800 }}>{activeRows.length} active</div>
        </div>

        {activeRows.length ? (
          <div style={processGrid}>
            {activeRows.map((row) => (
              <ProcessCard key={row.id} row={row} labour={labour} />
            ))}
          </div>
        ) : (
          <div style={emptyState}>
            <strong>No production steps yet.</strong>
            <span>Use the recommended starter set or add your first step above.</span>
          </div>
        )}
      </section>

      {archivedRows.length ? (
        <details style={card}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "#475569" }}>Archived production steps ({archivedRows.length})</summary>
          <div style={{ ...processGrid, marginTop: 16 }}>
            {archivedRows.map((row) => <ProcessCard key={row.id} row={row} labour={labour} />)}
          </div>
        </details>
      ) : null}
    </main>
  );
}

function ProcessCard({ row, labour }: { row: Awaited<ReturnType<typeof listProcessesForTenant>>[number]; labour: Awaited<ReturnType<typeof listLabourForTenant>> }) {
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
          <details>
            <summary style={secondaryButton}>Edit</summary>
            <div style={editPopover}>
              <form action={updateProcessAction} style={{ display: "grid", gap: 16 }}>
                <input type="hidden" name="id" value={row.id} />
                <div>
                  <div style={eyebrow}>Edit production step</div>
                  <h3 style={{ margin: "5px 0 0", fontSize: 23 }}>{row.name}</h3>
                </div>
                <div style={editGrid}>
                  <label style={fieldLabel}>Step name<input name="name" defaultValue={row.name} required style={inputStyle} /></label>
                  <label style={fieldLabel}>Work area<select name="department" defaultValue={row.department} style={inputStyle}>{departments.map((department) => <option key={department.value} value={department.value}>{department.label}</option>)}</select></label>
                  <label style={fieldLabel}>Step category<select name="processType" defaultValue={row.processType} style={inputStyle}>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                  <label style={fieldLabel}>Default labour<select name="labourOperationId" defaultValue={row.labourOperationId ?? ""} style={inputStyle}><option value="">No default labour</option>{labour.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (archived)"}</option>)}</select></label>
                </div>
                <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>Machine costs are assigned from the Machines page. Default labour is optional and should only be linked when this step normally requires hands-on staff time.</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}><button style={primaryButton}>Save changes</button></div>
              </form>
            </div>
          </details>
          <form action={setProcessActiveAction}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="active" value={row.active ? "false" : "true"} />
            <button style={secondaryButton}>{row.active ? "Archive" : "Restore"}</button>
          </form>
        </div>
      </div>

      <div style={{ paddingTop: 12, borderTop: "1px solid #e2e8f0", color: "#475569", fontSize: 14 }}>
        Default labour: <strong style={{ color: "#0f172a" }}>{row.labourOperationName ?? "Not linked"}</strong>
      </div>
    </article>
  );
}

function FlowCard({ number, title, body, href, active = false }: { number: string; title: string; body: string; href?: string; active?: boolean }) {
  const content = (
    <div style={{ ...flowCard, borderColor: active ? "#5eead4" : "#dbe4f0", background: active ? "#f0fdfa" : "#fff" }}>
      <span style={{ ...flowNumber, background: active ? "#0f766e" : "#e2e8f0", color: active ? "#fff" : "#475569" }}>{number}</span>
      <span><strong style={{ display: "block", color: "#0f172a" }}>{title}</strong><span style={{ display: "block", marginTop: 3, color: "#64748b", fontSize: 13, lineHeight: 1.4 }}>{body}</span></span>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{content}</Link> : content;
}

function FlowArrow() {
  return <div style={{ alignSelf: "center", color: "#94a3b8", fontSize: 24, fontWeight: 900 }}>→</div>;
}

const eyebrow: CSSProperties = { fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".07em" };
const card: CSSProperties = { border: "1px solid #dbe4f0", borderRadius: 17, background: "#fff", padding: 20, boxShadow: "0 8px 24px rgba(15,23,42,.05)" };
const flowGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr) auto minmax(0,1fr)", gap: 10, alignItems: "stretch" };
const flowCard: CSSProperties = { height: "100%", display: "flex", alignItems: "flex-start", gap: 11, border: "1px solid", borderRadius: 14, padding: 14 };
const flowNumber: CSSProperties = { width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center", flex: "0 0 30px", fontWeight: 950 };
const processGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 14 };
const processIcon: CSSProperties = { width: 42, height: 42, borderRadius: 12, background: "#f0fdfa", color: "#0f766e", display: "grid", placeItems: "center", fontSize: 21, fontWeight: 950, flex: "0 0 42px" };
const pill: CSSProperties = { borderRadius: 999, background: "#f1f5f9", color: "#475569", padding: "5px 9px", fontSize: 12, fontWeight: 850 };
const emptyState: CSSProperties = { minHeight: 130, border: "1px dashed #94a3b8", borderRadius: 15, display: "grid", placeContent: "center", justifyItems: "center", gap: 5, color: "#64748b" };
const successBanner: CSSProperties = { border: "1px solid #86efac", background: "#f0fdf4", color: "#166534", borderRadius: 12, padding: "12px 14px", fontWeight: 800 };
const errorBanner: CSSProperties = { border: "1px solid #fca5a5", background: "#fef2f2", color: "#991b1b", borderRadius: 12, padding: "12px 14px", fontWeight: 800 };
const primaryButton: CSSProperties = { minHeight: 44, border: 0, borderRadius: 10, background: "#0f766e", color: "#fff", fontWeight: 950, padding: "0 18px", cursor: "pointer", font: "inherit" };
const secondaryButton: CSSProperties = { listStyle: "none", minHeight: 38, display: "grid", placeItems: "center", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#334155", padding: "0 11px", fontWeight: 850, cursor: "pointer", font: "inherit" };
const editPopover: CSSProperties = { position: "absolute", zIndex: 30, right: 18, marginTop: 8, width: "min(760px,calc(100vw - 70px))", border: "1px solid #cbd5e1", borderRadius: 16, background: "#fff", padding: 20, boxShadow: "0 22px 70px rgba(15,23,42,.24)" };
const editGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 };
const fieldLabel: CSSProperties = { display: "grid", gap: 7, color: "#0f172a", fontWeight: 850 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 11px", font: "inherit", color: "#0f172a", background: "#fff" };
