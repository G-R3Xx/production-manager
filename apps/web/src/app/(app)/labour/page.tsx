import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listLabourForTenant, type LabourRecord } from "@/server/productionResources";
import { setLabourActiveAction } from "./actions";
import { LabourOperationForm } from "./LabourOperationForm";
import { labourBasisLabel, labourBasisUnit, storedLabourValueToMinutes, type LabourBasis } from "./labourConfig";
import styles from "./labour.module.css";
import { ProductionSetupNav } from "@/components/ProductionSetupNav";

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

function LabourOperationCard({ row }: { row: LabourRecord }) {
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
          <span>Hourly rate</span>
          <strong>{money(summary.rate)}/hr</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Time rule</span>
          <strong>{summary.timeText}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>{row.calculationBasis === "guillotine_stacks" ? "Costing source" : row.calculationBasis === "fixed_minutes" ? "Cost per use" : "Base unit cost before minimum"}</span>
          <strong>{row.calculationBasis === "guillotine_stacks" ? "Calculated on quote" : <>{money(summary.unitCost)}{row.calculationBasis === "fixed_minutes" ? " per use" : ` ${labourBasisUnit(row.calculationBasis)}`}</>}</strong>
        </div>
      </div>

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
              hourlyRate: row.hourlyRate,
              calculationBasis: row.calculationBasis as LabourBasis,
              calculationValue: row.calculationValue,
              minimumMinutes: row.minimumMinutes
            }}
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
  const rows = await listLabourForTenant(tenant.tenantId);
  const activeRows = rows.filter((row) => row.active);
  const archivedRows = rows.filter((row) => !row.active);

  return (
    <main className={styles.page}>
      <ProductionSetupNav active="resources" />
      <header className={styles.header}>
        <div className={styles.eyebrow}>Resources · labour</div>
        <h1 className={styles.title}>Labour & time rates</h1>
        <p className={styles.subtitle}>
          Store reusable human labour/time rules here. Link them to a Process once; Products and Production Methods then inherit the labour cost automatically.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Link href="/machines" style={{ textDecoration: "none", borderRadius: 999, padding: "7px 11px", background: "#f1f5f9", color: "#475569", fontWeight: 900 }}>Machines</Link>
          <Link href="/labour" style={{ textDecoration: "none", borderRadius: 999, padding: "7px 11px", background: "#dbeafe", color: "#1d4ed8", fontWeight: 900 }}>Labour & time</Link>
        </div>
      </header>

      {params.message ? <div className={styles.message}>{params.message}</div> : null}
      {params.error ? <div className={styles.error}>{params.error}</div> : null}

      <section className={styles.explainer}>
        <div className={styles.explainerIcon}>1×</div>
        <div>
          <h2>Set each labour rule up once</h2>
          <p>
            Example: create “Mounting / application” at 15 minutes per m², then link it to the Mount / apply Process. Every Production Method that uses that Process inherits the same labour rule.
          </p>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Add a labour operation</h2>
            <p>Use a common template or build your own. The live example shows the actual charge before you save.</p>
          </div>
        </div>
        <LabourOperationForm />
      </section>

      <section className={styles.operationList}>
        <div className={styles.listHeader}>
          <div>
            <h2>Available labour operations</h2>
            <p>These appear in the Process Library when assigning the normal human labour for an action.</p>
          </div>
          <span className={styles.countPill}>{activeRows.length} active</span>
        </div>

        {activeRows.length ? activeRows.map((row) => <LabourOperationCard key={row.id} row={row} />) : (
          <div className={styles.emptyState}>
            <div>
              <strong>No labour operations yet</strong>
              <p>Start with one of the quick templates above.</p>
            </div>
          </div>
        )}
      </section>

      {archivedRows.length ? (
        <details className={styles.archivedSection}>
          <summary>Archived labour operations ({archivedRows.length})</summary>
          <div className={styles.operationList}>
            {archivedRows.map((row) => <LabourOperationCard key={row.id} row={row} />)}
          </div>
        </details>
      ) : null}
    </main>
  );
}
