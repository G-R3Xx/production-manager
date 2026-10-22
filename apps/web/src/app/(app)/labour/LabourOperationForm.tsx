"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { createLabourAction, updateLabourAction } from "./actions";
import styles from "./labour.module.css";
import { LABOUR_BASIS_OPTIONS, storedLabourValueToMinutes, type LabourBasis } from "./labourConfig";

type LabourFormValues = {
  id?: string;
  name: string;
  department: string;
  machineId?: string;
  labourUserProfileId?: string;
  calculationBasis: LabourBasis;
  calculationValue: string;
  minimumMinutes: string;
  consumableMaterialId?: string;
  consumableQuantity?: string;
  consumableBasis?: string;
};

type MachineOption = { id: string; name: string; active: boolean; };
type StaffRateOption = { userProfileId: string; fullName: string; shortName?: string | null; quoteLabourRate: string | null; };

type MaterialOption = {
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

type Template = {
  label: string;
  description: string;
  name: string;
  basis: LabourBasis;
  minutes: number;
  minimum: number;
};

const DEPARTMENTS = [
  { value: "signage", label: "Signage" },
  { value: "small_format", label: "Small format" },
  { value: "plan_printing", label: "Plan printing" },
  { value: "poster_printing", label: "Poster printing" },
  { value: "general", label: "General / shared" }
] as const;

const TEMPLATES: Template[] = [
  {
    label: "Print / file setup",
    description: "15 minutes once",
    name: "Print setup",
    basis: "fixed_minutes",
    minutes: 15,
    minimum: 15
  },
  {
    label: "Mount / apply",
    description: "15 min per m², 15 min minimum",
    name: "Mounting / application",
    basis: "per_sqm_hours",
    minutes: 15,
    minimum: 15
  },
  {
    label: "Guillotine / trim",
    description: "30 minutes once (manual estimate)",
    name: "Guillotine / trim",
    basis: "fixed_minutes",
    minutes: 30,
    minimum: 0
  },
  {
    label: "Calculated guillotine",
    description: "Cuts per stack × required stacks",
    name: "Calculated guillotine / trim",
    basis: "guillotine_stacks",
    minutes: 0,
    minimum: 5
  },
  {
    label: "Eyelets",
    description: "0.25 min each, 2 min minimum",
    name: "Eyelets",
    basis: "per_item_hours",
    minutes: 0.25,
    minimum: 2
  },
  {
    label: "Book edge tape",
    description: "0.5 min per book",
    name: "Book edge tape",
    basis: "per_item_hours",
    minutes: 0.5,
    minimum: 2
  },
  {
    label: "Spiral binding",
    description: "1 min per book",
    name: "Spiral binding",
    basis: "per_item_hours",
    minutes: 1,
    minimum: 2
  },
  {
    label: "Packing",
    description: "10 minutes once",
    name: "Packing",
    basis: "fixed_minutes",
    minutes: 10,
    minimum: 10
  }
];

function money(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function cleanNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(decimals).replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function materialRate(material: MaterialOption, basis: string): { rate: number; unit: string; note?: string } {
  const wastePercent = Math.max(0, Number(material.wastagePercent) || 0);
  const purchaseCost = Math.max(0, Number(material.purchaseCost) || 0) * (1 + wastePercent / 100);
  const stockQty = Math.max(0, Number(material.stockQuantity) || 0);
  const purchaseUom = String(material.purchaseUom ?? "").trim().toLowerCase();
  const stockUom = String(material.stockUom ?? "").trim().toLowerCase();
  const wasteNote = wastePercent > 0 ? `${cleanNumber(wastePercent)}% wastage included` : undefined;

  if (basis === "per_linear_metre") {
    if (["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(purchaseUom)) {
      return { rate: purchaseCost, unit: "lm", note: wasteNote };
    }
    if ((purchaseUom.includes("roll") || ["lm", "m", "metre", "meter"].includes(stockUom)) && stockQty > 0) {
      return { rate: purchaseCost / stockQty, unit: "lm", note: [`${cleanNumber(stockQty)}lm per ${purchaseUom || "purchase unit"}`, wasteNote].filter(Boolean).join(" · ") };
    }
    return { rate: purchaseCost, unit: "lm", note: ["check saved roll length", wasteNote].filter(Boolean).join(" · ") || undefined };
  }

  if (basis === "per_sqm") {
    let sheetRate = purchaseCost;
    if ((purchaseUom.includes("1000") || purchaseUom.includes("thousand") || purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box")) && stockQty > 0 && (stockUom.includes("sheet") || stockUom.includes("each"))) {
      sheetRate = purchaseCost / stockQty;
    }
    const width = Math.max(0, Number(material.widthMm) || 0);
    const length = Math.max(0, Number(material.lengthMm) || 0);
    const area = width > 0 && length > 0 ? width / 1000 * (length / 1000) : 0;
    if (area > 0) return { rate: sheetRate / area, unit: "m²", note: [`${cleanNumber(area)}m² parent sheet`, wasteNote].filter(Boolean).join(" · ") };
    return { rate: sheetRate, unit: "m²", note: ["check saved material dimensions", wasteNote].filter(Boolean).join(" · ") || undefined };
  }

  if (stockQty > 0 && purchaseUom && stockUom && purchaseUom !== stockUom) {
    return { rate: purchaseCost / stockQty, unit: "each", note: [`${cleanNumber(stockQty)} ${stockUom} per ${purchaseUom}`, wasteNote].filter(Boolean).join(" · ") };
  }
  return { rate: purchaseCost, unit: "each", note: wasteNote };
}

function previewUnitLabel(basis: LabourBasis): string {
  if (basis === "fixed_minutes") return "1 use";
  if (basis === "per_sqm_hours") return "1 m²";
  if (basis === "per_sheet_hours") return "1 sheet";
  if (basis === "per_linear_metre_hours") return "1 linear metre";
  if (basis === "per_item_hours") return "1 Production Step unit";
  return "Calculated on quote";
}

function materialBasisLabel(basis: string): string {
  if (basis === "per_linear_metre") return "linear metre";
  if (basis === "per_sqm") return "m²";
  if (basis === "per_finished_item") return "finished item";
  return "Production Step unit";
}

export function LabourOperationForm({
  mode = "create",
  initialValues,
  materials = [],
  machines = [],
  staff = [],
  defaultLabourRate = "66"
}: {
  mode?: "create" | "edit";
  initialValues?: LabourFormValues;
  materials?: MaterialOption[];
  machines?: MachineOption[];
  staff?: StaffRateOption[];
  defaultLabourRate?: string;
}) {
  const initialBasis = initialValues?.calculationBasis ?? "fixed_minutes";
  const [name, setName] = useState(initialValues?.name ?? "");
  const [department, setDepartment] = useState(initialValues?.department ?? "signage");
  const [machineId, setMachineId] = useState(initialValues?.machineId ?? "");
  const [labourUserProfileId, setLabourUserProfileId] = useState(initialValues?.labourUserProfileId ?? "");
  const [basis, setBasis] = useState<LabourBasis>(initialBasis);
  const [minutes, setMinutes] = useState(
    cleanNumber(storedLabourValueToMinutes(initialBasis, initialValues?.calculationValue ?? "15"), 2)
  );
  const [minimumMinutes, setMinimumMinutes] = useState(initialValues?.minimumMinutes ?? "0");
  const [consumableMaterialId, setConsumableMaterialId] = useState(initialValues?.consumableMaterialId ?? "");
  const [consumableQuantity, setConsumableQuantity] = useState(initialValues?.consumableQuantity ?? "0");
  const [consumableBasis, setConsumableBasis] = useState(initialValues?.consumableBasis ?? "per_operation_unit");

  const basisDetails = LABOUR_BASIS_OPTIONS.find((option) => option.value === basis) ?? LABOUR_BASIS_OPTIONS[0]!;
  const selectedStaff = staff.find((item) => item.userProfileId === labourUserProfileId) ?? null;
  const rate = Math.max(0, Number(selectedStaff?.quoteLabourRate ?? defaultLabourRate) || 0);
  const minutesNumber = Math.max(0, Number(minutes) || 0);
  const minimumNumber = Math.max(0, Number(minimumMinutes) || 0);

  const selectedConsumable = useMemo(
    () => materials.find((material) => material.id === consumableMaterialId) ?? null,
    [consumableMaterialId, materials]
  );
  const selectedMachine = useMemo(
    () => machines.find((machine) => machine.id === machineId) ?? null,
    [machineId, machines]
  );

  const liveExample = useMemo(() => {
    if (basis === "guillotine_stacks") {
      return {
        headline: `${cleanNumber(minutesNumber, 0)} cuts per stack`,
        labourCost: null as number | null,
        labourDetail: "Labour is calculated on the quote from sheets, stack capacity and cuts per minute.",
        materialCost: null as number | null,
        materialDetail: selectedConsumable ? `${selectedConsumable.name} usage is calculated on the quote.` : "No linked consumable.",
        totalCost: null as number | null,
        totalLabel: "Calculated on quote",
        sampleDetail: selectedMachine
          ? `${selectedMachine.name} equipment cost and operator labour are calculated separately inside this Production Step. Markup and profit are applied later.`
          : "Raw shop cost only — markup, profit and client pricing are applied later on the quote."
      };
    }

    const rawLabourMinutes = minutesNumber;
    const chargedLabourMinutes = Math.max(rawLabourMinutes, minimumNumber);
    const labourCost = chargedLabourMinutes / 60 * rate;
    const labourDetail = minimumNumber > rawLabourMinutes
      ? `${cleanNumber(rawLabourMinutes, 2)} min base · ${cleanNumber(minimumNumber, 2)} min minimum at ${money(rate)}/hr`
      : `${cleanNumber(chargedLabourMinutes, 2)} min at ${money(rate)}/hr`;

    let materialCost: number | null = 0;
    let materialDetail = "No linked consumable.";
    let aligned = true;

    if (selectedConsumable && Math.max(0, Number(consumableQuantity) || 0) > 0) {
      const configuredQuantity = Math.max(0, Number(consumableQuantity) || 0);
      const pricing = materialRate(selectedConsumable, consumableBasis);
      aligned =
        (basis === "per_item_hours" && ["per_operation_unit", "per_finished_item"].includes(consumableBasis)) ||
        (basis === "per_linear_metre_hours" && consumableBasis === "per_linear_metre") ||
        (basis === "per_sqm_hours" && consumableBasis === "per_sqm") ||
        (basis === "fixed_minutes" && consumableBasis === "per_operation_unit");

      if (aligned) {
        materialCost = configuredQuantity * pricing.rate;
        materialDetail = `${cleanNumber(configuredQuantity, 4)} × ${selectedConsumable.name} @ ${money(pricing.rate)}/${pricing.unit}${pricing.note ? ` · ${pricing.note}` : ""}`;
      } else {
        materialCost = null;
        materialDetail = `${selectedConsumable.name}: ${cleanNumber(configuredQuantity, 4)} per ${materialBasisLabel(consumableBasis)} @ ${money(pricing.rate)}/${pricing.unit}. Usage depends on the quote dimensions/quantity.`;
      }
    }

    const totalCost = materialCost === null ? null : labourCost + materialCost;
    const sampleQuantity = basisDetails.exampleQuantity;
    const sampleRawMinutes = basis === "fixed_minutes" ? minutesNumber : minutesNumber * sampleQuantity;
    const sampleMinutes = Math.max(sampleRawMinutes, minimumNumber);
    const sampleLabourCost = sampleMinutes / 60 * rate;
    let sampleDetail = selectedMachine
      ? `${selectedMachine.name} equipment cost is added from its setup + runtime when the quote dimensions are known. The amount above is labour/consumable only.`
      : "Raw shop cost only — markup, profit and client pricing are applied later on the quote.";

    if (selectedConsumable && materialCost !== null && basis !== "fixed_minutes" && sampleQuantity > 1) {
      const sampleMaterialCost = materialCost * sampleQuantity;
      sampleDetail = `${basisDetails.exampleQuantityLabel}: labour ${money(sampleLabourCost)} + material ${money(sampleMaterialCost)} = ${money(sampleLabourCost + sampleMaterialCost)} raw cost. Before markup & profit.`;
    } else if (basis !== "fixed_minutes" && sampleQuantity > 1) {
      sampleDetail = `${basisDetails.exampleQuantityLabel}: labour ${money(sampleLabourCost)}. Before markup & profit.`;
    }

    return {
      headline: previewUnitLabel(basis),
      labourCost,
      labourDetail,
      materialCost,
      materialDetail,
      totalCost,
      totalLabel: totalCost === null
        ? "Calculated on quote"
        : selectedMachine
          ? `${money(totalCost)} + equipment`
          : money(totalCost),
      sampleDetail
    };
  }, [basis, basisDetails, consumableBasis, consumableQuantity, minimumNumber, minutesNumber, rate, selectedConsumable, selectedMachine]);

  function applyTemplate(template: Template) {
    setName(template.name);
    setBasis(template.basis);
    setMinutes(String(template.minutes));
    setMinimumMinutes(String(template.minimum));
  }

  const action = mode === "edit" ? updateLabourAction : createLabourAction;

  return (
    <form action={action} className={styles.formGrid}>
      {initialValues?.id ? <input type="hidden" name="id" value={initialValues.id} /> : null}

      {mode === "create" ? (
        <details className={styles.templateSection}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "#334155" }}>Quick-start presets</summary>
          <p className={styles.helpText}>Optional: choose a common Production Step as a starting point, then adjust the fields below.</p>
          <div className={styles.templateGrid}>
            {TEMPLATES.map((template) => (
              <button key={template.label} type="button" className={styles.templateButton} onClick={() => applyTemplate(template)}>
                <strong>{template.label}</strong><span>{template.description}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}

      <section className={styles.formSection}>
        <div className={styles.stepNumber}>1</div>
        <div className={styles.sectionContent}>
          <h3 className={styles.sectionTitle}>Production Step</h3>
          <p className={styles.helpText}>Name the work staff recognise, then optionally choose the equipment it uses.</p>
          <div className={styles.twoColumnGrid}>
            <label className={styles.fieldLabel}>
              Step name
              <input required name="name" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)} className={styles.input} placeholder="e.g. Direct Print" />
            </label>
            <label className={styles.fieldLabel}>
              Work area
              <select name="department" value={department} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDepartment(event.target.value)} className={styles.input}>
                {DEPARTMENTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label className={styles.fieldLabel}>
            Machine / equipment <span style={{ color: "#94a3b8", fontWeight: 600 }}>(optional)</span>
            <select name="machineId" value={machineId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setMachineId(event.target.value)} className={styles.input}>
              <option value="">No equipment cost</option>
              {machines.filter((machine) => machine.active || machine.id === machineId).map((machine) => (
                <option key={machine.id} value={machine.id}>{machine.name}{machine.active ? "" : " · archived"}</option>
              ))}
            </select>
            <span className={styles.fieldHint}>Equipment only contributes its running/setup cost. It never contributes labour.</span>
          </label>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.stepNumber}>2</div>
        <div className={styles.sectionContent}>
          <h3 className={styles.sectionTitle}>Operator labour</h3>
          <p className={styles.helpText}>Choose the normal labour rate and how operator time grows. This is the only labour charge for this Production Step.</p>
          <div className={styles.twoColumnGrid}>
            <label className={styles.fieldLabel}>
              Labour rate
              <select name="labourUserProfileId" value={labourUserProfileId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setLabourUserProfileId(event.target.value)} className={styles.input}>
                <option value="">Factory default · {money(Math.max(0, Number(defaultLabourRate) || 0))}/hr</option>
                {staff.map((item) => {
                  const staffRate = Math.max(0, Number(item.quoteLabourRate ?? defaultLabourRate) || 0);
                  return <option key={item.userProfileId} value={item.userProfileId}>{item.fullName} · {money(staffRate)}/hr{item.quoteLabourRate == null ? " (factory rate)" : ""}</option>;
                })}
              </select>
              <span className={styles.fieldHint}>Rates are maintained under Staff / Company settings.</span>
            </label>
            <label className={styles.fieldLabel}>
              Operator time is calculated
              <select name="calculationBasis" value={basis} onChange={(event: ChangeEvent<HTMLSelectElement>) => setBasis(event.target.value as LabourBasis)} className={styles.input}>
                {LABOUR_BASIS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className={styles.fieldHint}>{basisDetails.description}</span>
            </label>
          </div>

          <div className={styles.timeInputs}>
            <label className={styles.fieldLabel}>
              {basisDetails.inputLabel}
              <div className={styles.unitInputWrap}>
                <input required name="timeMinutes" type="number" min="0" step={basis === "guillotine_stacks" ? "1" : "0.01"} value={minutes} onChange={(event: ChangeEvent<HTMLInputElement>) => setMinutes(event.target.value)} className={styles.input} />
                <span>{basis === "guillotine_stacks" ? "cuts" : "minutes"}</span>
              </div>
              {basis === "guillotine_stacks" ? <span className={styles.fieldHint}>The selected guillotine supplies cuts/minute and stack capacity from Manage equipment.</span> : null}
            </label>
            <label className={styles.fieldLabel}>
              Minimum operator time
              <div className={styles.unitInputWrap}>
                <input name="minimumMinutes" type="number" min="0" step="0.01" value={minimumMinutes} onChange={(event: ChangeEvent<HTMLInputElement>) => setMinimumMinutes(event.target.value)} className={styles.input} />
                <span>minutes</span>
              </div>
              <span className={styles.fieldHint}>Use 0 when no minimum is needed.</span>
            </label>
          </div>
        </div>
      </section>

      <details style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900, color: "#334155" }}>Optional consumable</summary>
        <div className={styles.sectionContent} style={{ marginTop: 14 }}>
          <p className={styles.helpText}>Use this only when the step automatically consumes something such as an eyelet, tape or binding item.</p>
          <div className={styles.twoColumnGrid}>
            <label className={styles.fieldLabel}>
              Consumable / material
              <select name="consumableMaterialId" value={consumableMaterialId} onChange={(event) => setConsumableMaterialId(event.target.value)} className={styles.input}>
                <option value="">No linked consumable</option>
                {materials.map((material) => <option key={material.id} value={material.id}>{material.name}{material.stockUom ? ` · ${material.stockUom}` : ""}</option>)}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Quantity used
              <input name="consumableQuantity" type="number" min="0" step="0.0001" value={consumableQuantity} onChange={(event) => setConsumableQuantity(event.target.value)} className={styles.input} disabled={!consumableMaterialId} />
            </label>
            <label className={styles.fieldLabel}>
              Usage basis
              <select name="consumableBasis" value={consumableBasis} onChange={(event) => setConsumableBasis(event.target.value)} className={styles.input} disabled={!consumableMaterialId}>
                <option value="per_operation_unit">Per Production Step unit</option>
                <option value="per_finished_item">Per finished item</option>
                <option value="per_linear_metre">Per linear metre</option>
                <option value="per_sqm">Per square metre</option>
              </select>
            </label>
          </div>
        </div>
      </details>

      <details style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 900, color: "#334155" }}>Show raw-cost preview</summary>
        <section className={styles.previewCard} aria-live="polite" style={{ marginTop: 14 }}>
          <div className={styles.previewMain}>
            <div className={styles.previewLabel}>Production Step raw cost</div>
            <strong className={styles.previewHeadline}>{liveExample.headline}</strong>
            <div className={styles.previewBreakdown}>
              <div className={styles.previewBreakdownRow}><div><span>Equipment</span><small>{selectedMachine ? `${selectedMachine.name} setup + runtime` : "No equipment linked."}</small></div><strong>{selectedMachine ? "Calculated on quote" : money(0)}</strong></div>
              <div className={styles.previewBreakdownRow}><div><span>Labour</span><small>{liveExample.labourDetail}</small></div><strong>{liveExample.labourCost === null ? "Calculated on quote" : money(liveExample.labourCost)}</strong></div>
              <div className={styles.previewBreakdownRow}><div><span>Consumable</span><small>{liveExample.materialDetail}</small></div><strong>{liveExample.materialCost === null ? "Calculated on quote" : money(liveExample.materialCost)}</strong></div>
            </div>
            <p className={styles.previewNote}>{liveExample.sampleDetail}</p>
          </div>
          <div className={styles.previewTotal}><span>{selectedMachine ? "Known raw cost + equipment" : "Total raw cost"}</span><strong>{liveExample.totalLabel}</strong><small>Before markup &amp; profit</small></div>
        </section>
      </details>

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton}>{mode === "edit" ? "Save Production Step" : "Add Production Step"}</button>
        <span className={styles.saveHint}>One Production Step = one manufacturing charge.</span>
      </div>
    </form>
  );
}
