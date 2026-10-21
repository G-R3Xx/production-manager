import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listLabourForTenant, listMachinesForTenant, type LabourRecord, type MachineRecord } from "@/server/productionResources";
import { listMaterialsForTenant } from "@/server/materials";
import { setLabourActiveAction } from "../labour/actions";
import { LabourOperationForm } from "../labour/LabourOperationForm";
import { labourBasisLabel, labourBasisUnit, storedLabourValueToMinutes, type LabourBasis } from "../labour/labourConfig";
import styles from "../labour/labour.module.css";
import { ProductionSetupNav } from "@/components/ProductionSetupNav";
import { listActiveStaffOptionsForTenant, type ActiveStaffOption } from "@/server/users";
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

function LabourOperationCard({ row, materials, machines, staff, defaultLabourRate }: { row: LabourRecord; materials: LabourMaterialOption[]; machines: MachineRecord[]; staff: ActiveStaffOption[]; defaultLabourRate: string }) {
  const summary = operationSummary(row);

  return (
    <article className={`${styles.operationCard} ${row.active ? "" : styles.operationCardArchived}`}>
      <div className={styles.operationTop}>
        <div>
          <h3>{row.name}</h3>
          <div className={styles.operationMeta}>
            <span className={styles.metaPill}>{DEPARTMENT_LABELS[row.department] ?? row.department.replaceAll("_", " ")}</span>
            <span className={styles.metaPill}>{labourBasisLabel(row.calculationBasis)}</span>
            {!row.active ? <span className={styles.metaPill}>Archived</span> : null}
          </div>
        </div>
        <div className={styles.operationActions}>
          <form action={setLabourActiveAction}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="active" value={row.active ? "false" : "true"} />
            <button className={styles.archiveButton}>{row.active ? "Archive" : "Restore"}</button>
          </form>
        </div>
      </div>

      <div className={styles.summaryLine}>
        <div className={styles.summaryItem}>
          <span>Machine</span>
          <strong>{row.machineName ?? "None"}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Labour source</span>
          <strong>{row.labourUserName ?? "Factory default"} · {summary.rate > 0 ? `${money(summary.rate)}/hr` : "No labour charge"}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Time rule</span>
          <strong>{summary.timeText}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>{row.calculationBasis === "guillotine_stacks" ? "Costing source" : row.calculationBasis === "fixed_minutes" ? "Labour cost per use" : "Base labour cost before minimum"}</span>
          <strong>{row.calculationBasis === "guillotine_stacks" ? "Calculated on quote" : <>{money(summary.unitCost)}{row.calculationBasis === "fixed_minutes" ? " per use" : ` ${labourBasisUnit(row.calculationBasis)}`}</>}</strong>
        </div>
      </div>

      {row.consumableMaterialName && Number(row.consumableQuantity) > 0 ? (
        <p style={{ margin: "11px 0 0", color: "#0f766e", fontSize: 13, fontWeight: 800 }}>
          Consumable: {row.consumableMaterialName} × {row.consumableQuantity} {row.consumableBasis === "per_finished_item" ? "per finished item" : row.consumableBasis === "per_linear_metre" ? "per linear metre" : row.consumableBasis === "per_sqm" ? "per m²" : "per operation unit"}
        </p>
      ) : null}

      {summary.minimum > 0 ? (
        <p style={{ margin: "11px 0 0", color: "#64748b", fontSize: 13 }}>
          Minimum charge: <strong style={{ color: "#334155" }}>{number(summary.minimum)} minutes ({money(summary.minimum / 60 * summary.rate)})</strong>
        </p>
      ) : null}

      <details className={styles.editDetails}>
        <summary>Edit operation</summary>
        <div className={styles.editPanel}>
          <LabourOperationForm
            mode="edit"
            initialValues={{
              id: row.id,
              name: row.name,
              department: row.department,
              machineId: row.machineId ?? "",
              labourUserProfileId: row.labourUserProfileId ?? "",
              calculationBasis: row.calculationBasis as LabourBasis,
              calculationValue: row.calculationValue,
              minimumMinutes: row.minimumMinutes,
              consumableMaterialId: row.consumableMaterialId ?? "",
              consumableQuantity: row.consumableQuantity,
              consumableBasis: row.consumableBasis
            }}
            materials={materials}
            machines={machines.map((machine) => ({ id: machine.id, name: machine.name, active: machine.active }))}
            staff={staff}
            defaultLabourRate={defaultLabourRate}
          />
        </div>
      </details>
    </article>
  );
}

export default async function LabourPage({
  searchParams
}: {
  searchParams?: Promise<{ message?: string; error?: string }>;
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

  return (
    <main className={styles.page}>
      <ProductionSetupNav active="operations" />
      <header className={styles.header}>
        <div className={styles.eyebrow}>Production setup · pricing</div>
        <h1 className={styles.title}>Operations &amp; labour</h1>
        <p className={styles.subtitle}>
          One operation combines equipment time, labour time and optional consumables once. Machines contain equipment cost only; labour rates come only from Staff / Company settings.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Link prefetch={false} href="/machines" style={{ textDecoration: "none", borderRadius: 999, padding: "7px 11px", background: "#f1f5f9", color: "#475569", fontWeight: 900 }}>Machines</Link>
          <Link prefetch={false} href="/operations" style={{ textDecoration: "none", borderRadius: 999, padding: "7px 11px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 900 }}>Operations &amp; labour</Link>
        </div>
      </header>

      {params.message ? <div className={styles.message}>{params.message}</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      <section className={styles.explainer}>
        <div className={styles.explainerIcon}>1×</div>
        <div>
          <h2>One operation = one manufacturing charge</h2>
          <p>
            Example: Direct Print links the printer for equipment cost and a staff/factory labour rate for operator time. The Operation owns the time rule; the Machine never owns labour. Nothing else should charge that same work again.
          </p>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Add an operation</h2>
            <p>Build the complete manufacturing cost in one place: optional machine + labour + consumable. The quote builder uses this operation directly.</p>
          </div>
        </div>
        <LabourOperationForm materials={materials} machines={machines.map((machine) => ({ id: machine.id, name: machine.name, active: machine.active }))} staff={staff} defaultLabourRate={defaultLabourRate} />
      </section>

      <section className={styles.operationList}>
        <div className={styles.listHeader}>
          <div>
            <h2>Available operations</h2>
            <p>These are the manufacturing pricing resources used directly by quotes.</p>
          </div>
          <span className={styles.countPill}>{activeRows.length} active</span>
        </div>

        {activeRows.length ? activeRows.map((row) => <LabourOperationCard key={row.id} row={row} materials={materials} machines={machines} staff={staff} defaultLabourRate={defaultLabourRate} />) : (
          <div className={styles.emptyState}>
            <div>
              <strong>No shop operations yet</strong>
              <p>Add your first operation above.</p>
            </div>
          </div>
        )}
      </section>

      {archivedRows.length ? (
        <details className={styles.archivedSection}>
          <summary>Archived operations ({archivedRows.length})</summary>
          <div className={styles.operationList}>
            {archivedRows.map((row) => <LabourOperationCard key={row.id} row={row} materials={materials} machines={machines} staff={staff} defaultLabourRate={defaultLabourRate} />)}
          </div>
        </details>
      ) : null}
    </main>
  );
}
