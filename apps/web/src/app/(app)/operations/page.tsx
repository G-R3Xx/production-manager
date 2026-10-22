import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listLabourForTenant, listMachinesForTenant, type LabourRecord } from "@/server/productionResources";
import { listMaterialsForTenant } from "@/server/materials";
import { setLabourActiveAction } from "../labour/actions";
import { LabourOperationForm } from "../labour/LabourOperationForm";
import { labourBasisUnit, storedLabourValueToMinutes, type LabourBasis } from "../labour/labourConfig";
import styles from "../labour/labour.module.css";
import { ProductionSetupNav } from "@/components/ProductionSetupNav";
import { listActiveStaffOptionsForTenant } from "@/server/users";
import { getCompanySettingsByTenantId } from "@/server/company";

const DEPARTMENT_LABELS: Record<string, string> = {
  signage: "Signage",
  small_format: "Small format",
  plan_printing: "Plan printing",
  poster_printing: "Poster printing",
  general: "General / shared"
};

function money(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function number(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace(/\.0$/, "");
}

function operationSummary(row: LabourRecord) {
  const rate = Math.max(0, Number(row.hourlyRate) || 0);
  const minutes = Math.max(0, storedLabourValueToMinutes(row.calculationBasis, row.calculationValue));
  const minimum = Math.max(0, Number(row.minimumMinutes) || 0);
  const unitCost = minutes / 60 * rate;

  return {
    minutes,
    minimum,
    rate,
    unitCost,
    timeText: row.calculationBasis === "guillotine_stacks"
      ? `${number(minutes, 0)} cuts per stack · calculated from stack capacity`
      : row.calculationBasis === "fixed_minutes"
      ? `${number(minutes)} minutes per use`
      : `${number(minutes)} minutes ${labourBasisUnit(row.calculationBasis)}`
  };
}

type LabourMaterialOption = {
  id: string;
  name: string;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: string;
  purchaseCost: string;
  wastagePercent: string;
  widthMm: string | null;
  lengthMm: string | null;
};

function ProductionStepRow({ row }: { row: LabourRecord }) {
  const summary = operationSummary(row);
  const consumable = row.consumableMaterialName && Number(row.consumableQuantity) > 0
    ? `${row.consumableMaterialName} × ${row.consumableQuantity}`
    : "—";

  return (
    <tr style={{ opacity: row.active ? 1 : 0.62 }}>
      <td style={tableCell}>
        <strong style={{ display: "block", color: "#0f172a" }}>{row.name}</strong>
        <span style={subtle}>{DEPARTMENT_LABELS[row.department] ?? row.department.replaceAll("_", " ")}</span>
      </td>
      <td style={tableCell}><strong>{row.machineName ?? "—"}</strong></td>
      <td style={tableCell}>
        <strong>{row.labourUserName ?? "Factory default"}</strong>
        <span style={subtle}>{summary.rate > 0 ? `${money(summary.rate)}/hr` : "No labour charge"}</span>
      </td>
      <td style={tableCell}>
        <strong>{summary.timeText}</strong>
        {summary.minimum > 0 ? <span style={subtle}>{number(summary.minimum)} min minimum</span> : null}
      </td>
      <td style={tableCell}><span>{consumable}</span></td>
      <td style={{ ...tableCell, width: 190 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Link prefetch={false} href={`/operations?edit=${row.id}`} style={editButton}>Edit</Link>
          <form action={setLabourActiveAction}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="active" value={row.active ? "false" : "true"} />
            <button style={archiveButton}>{row.active ? "Archive" : "Restore"}</button>
          </form>
        </div>
      </td>
    </tr>
  );
}

const tableCell = { padding: "14px 12px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top", fontSize: 13 } as const;
const subtle = { display: "block", marginTop: 3, color: "#64748b", fontSize: 12, fontWeight: 600 } as const;
const editButton = { textDecoration: "none", cursor: "pointer", border: "1px solid #bfdbfe", borderRadius: 9, background: "#eff6ff", color: "#1d4ed8", padding: "7px 10px", fontWeight: 850, fontSize: 12 } as const;
const archiveButton = { border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#475569", padding: "7px 10px", fontWeight: 800, fontSize: 12, cursor: "pointer" } as const;

function ProductionStepTable({ rows }: { rows: LabourRecord[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: "auto", border: "1px solid #dbe4f0", borderRadius: 16, background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
        <thead>
          <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".055em" }}>
            <th style={tableCell}>Production step</th><th style={tableCell}>Equipment</th><th style={tableCell}>Labour</th><th style={tableCell}>Operator time</th><th style={tableCell}>Consumable</th><th style={tableCell}>Actions</th>
          </tr>
        </thead>
        <tbody>{rows.map((row) => <ProductionStepRow key={row.id} row={row} />)}</tbody>
      </table>
    </div>
  );
}

export default async function LabourPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string; error?: string; edit?: string; new?: string }>;
}) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");

  const params = searchParams ? await searchParams : {};
  const [rows, allMaterials, machines, staff, companySettings] = await Promise.all([
    listLabourForTenant(tenant.tenantId),
    listMaterialsForTenant(tenant.tenantId),
    listMachinesForTenant(tenant.tenantId),
    listActiveStaffOptionsForTenant(tenant.tenantId),
    getCompanySettingsByTenantId(tenant.tenantId)
  ]);
  const defaultLabourRate = companySettings?.quoteLabourRate ?? "66";
  const materials: LabourMaterialOption[] = allMaterials
    .filter((material) => material.active && ["consumable", "item", "finishing", "fixing", "hardware", "binding"].includes(String(material.materialType).toLowerCase()))
    .map((material) => ({
      id: material.id,
      name: material.name,
      stockUom: material.stockUom,
      purchaseUom: material.purchaseUom,
      stockQuantity: material.stockQuantity,
      purchaseCost: material.purchaseCost,
      wastagePercent: material.wastagePercent,
      widthMm: material.widthMm,
      lengthMm: material.lengthMm
    }));
  const activeRows = rows.filter((row) => row.active);
  const archivedRows = rows.filter((row) => !row.active);
  const editRow = params.edit ? rows.find((row) => row.id === params.edit) ?? null : null;
  const createOpen = params.new === "1" || activeRows.length === 0;

  return (
    <main className={styles.page}>
      <ProductionSetupNav active="operations" />

      <header className={styles.header} style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div className={styles.eyebrow}>Production costing</div>
          <h1 className={styles.title}>Production Steps</h1>
          <p className={styles.subtitle}>
            Set up the work you actually do: Print, Laminate, Cut, Mount, Artwork, Folding and similar. Each step can use one piece of equipment, one labour rule and an optional consumable.
          </p>
        </div>
        <Link prefetch={false} href="/machines" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#334155", padding: "10px 14px", fontWeight: 900 }}>Manage equipment →</Link>
      </header>

      {params.message ? <div className={styles.message}>{params.message}</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      {editRow ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><h2>Edit Production Step</h2><p>{editRow.name}</p></div>
            <Link prefetch={false} href="/operations" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 9, padding: "8px 11px", color: "#475569", fontWeight: 850 }}>Close</Link>
          </div>
          <LabourOperationForm
            mode="edit"
            initialValues={{ id: editRow.id, name: editRow.name, department: editRow.department, machineId: editRow.machineId ?? "", labourUserProfileId: editRow.labourUserProfileId ?? "", calculationBasis: editRow.calculationBasis as LabourBasis, calculationValue: editRow.calculationValue, minimumMinutes: editRow.minimumMinutes, consumableMaterialId: editRow.consumableMaterialId ?? "", consumableQuantity: editRow.consumableQuantity, consumableBasis: editRow.consumableBasis }}
            materials={materials}
            machines={machines.map((machine) => ({ id: machine.id, name: machine.name, active: machine.active }))}
            staff={staff}
            defaultLabourRate={defaultLabourRate}
          />
        </section>
      ) : null}

      {createOpen && !editRow ? (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><h2>Add Production Step</h2><p>Choose the equipment, operator time and optional consumable for this one manufacturing step.</p></div>
            {activeRows.length ? <Link prefetch={false} href="/operations" style={{ textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 9, padding: "8px 11px", color: "#475569", fontWeight: 850 }}>Close</Link> : null}
          </div>
          <LabourOperationForm materials={materials} machines={machines.map((machine) => ({ id: machine.id, name: machine.name, active: machine.active }))} staff={staff} defaultLabourRate={defaultLabourRate} />
        </section>
      ) : null}

      <section className={styles.explainer}>
        <div className={styles.explainerIcon}>1×</div>
        <div>
          <h2>One Production Step = one manufacturing charge</h2>
          <p>Material is charged by Materials. Equipment cost and operator labour are brought together here once. Extras and Services stay separate.</p>
        </div>
      </section>

      <section className={styles.operationList}>
        <div className={styles.listHeader}>
          <div>
            <h2>Production Steps</h2>
            <p>{activeRows.length} active step{activeRows.length === 1 ? "" : "s"}. These are the only manufacturing-cost steps used by quoting.</p>
          </div>
          <Link prefetch={false} href="/operations?new=1" style={{ ...editButton, padding: "10px 14px", fontSize: 13, background: "#2563eb", color: "#fff", borderColor: "#2563eb" }}>＋ Add Production Step</Link>
        </div>

        {activeRows.length ? (
          <ProductionStepTable rows={activeRows} />
        ) : (
          <div className={styles.emptyState}>
            <div><strong>No Production Steps yet</strong><p>Add your first step above.</p></div>
          </div>
        )}
      </section>

      {archivedRows.length ? (
        <details className={styles.archivedSection}>
          <summary>Archived Production Steps ({archivedRows.length})</summary>
          <div style={{ marginTop: 12 }}><ProductionStepTable rows={archivedRows} /></div>
        </details>
      ) : null}
    </main>
  );
}
