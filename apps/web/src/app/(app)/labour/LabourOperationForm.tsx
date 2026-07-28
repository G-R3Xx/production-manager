"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { createLabourAction, updateLabourAction } from "./actions";
import styles from "./labour.module.css";
import { LABOUR_BASIS_OPTIONS, storedLabourValueToMinutes, type LabourBasis } from "./labourConfig";

type LabourFormValues = {
  id?: string;
  name: string;
  department: string;
  hourlyRate: string;
  calculationBasis: LabourBasis;
  calculationValue: string;
  minimumMinutes: string;
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
    label: "Trim / cut items",
    description: "2 min per item, 5 min minimum",
    name: "Trim / cut",
    basis: "per_item_hours",
    minutes: 2,
    minimum: 5
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

export function LabourOperationForm({
  mode = "create",
  initialValues
}: {
  mode?: "create" | "edit";
  initialValues?: LabourFormValues;
}) {
  const initialBasis = initialValues?.calculationBasis ?? "fixed_minutes";
  const [name, setName] = useState(initialValues?.name ?? "");
  const [department, setDepartment] = useState(initialValues?.department ?? "signage");
  const [hourlyRate, setHourlyRate] = useState(initialValues?.hourlyRate ?? "120");
  const [basis, setBasis] = useState<LabourBasis>(initialBasis);
  const [minutes, setMinutes] = useState(
    cleanNumber(storedLabourValueToMinutes(initialBasis, initialValues?.calculationValue ?? "15"), 2)
  );
  const [minimumMinutes, setMinimumMinutes] = useState(initialValues?.minimumMinutes ?? "15");

  const basisDetails = LABOUR_BASIS_OPTIONS.find((option) => option.value === basis) ?? LABOUR_BASIS_OPTIONS[0]!;
  const rate = Math.max(0, Number(hourlyRate) || 0);
  const minutesNumber = Math.max(0, Number(minutes) || 0);
  const minimumNumber = Math.max(0, Number(minimumMinutes) || 0);

  const liveExample = useMemo(() => {
    const sampleCalculatedMinutes = basis === "fixed_minutes"
      ? minutesNumber
      : minutesNumber * basisDetails.exampleQuantity;
    const sampleMinutes = Math.max(sampleCalculatedMinutes, minimumNumber);
    const sampleCost = sampleMinutes / 60 * rate;

    if (basis === "fixed_minutes") {
      return {
        headline: `${cleanNumber(sampleMinutes, 1)} minutes ${basisDetails.exampleQuantityLabel}`,
        cost: money(sampleCost),
        detail: minimumNumber > minutesNumber
          ? `The ${cleanNumber(minimumNumber, 1)} minute minimum is currently setting the charge.`
          : `${money(rate)}/hr equals ${money(rate / 60)} per minute.`
      };
    }

    return {
      headline: `${cleanNumber(minutesNumber, 1)} minutes ${basisDetails.unitLabel}`,
      cost: money(minutesNumber / 60 * rate),
      detail: `${basisDetails.exampleQuantityLabel} would charge ${cleanNumber(sampleMinutes, 1)} minutes (${money(sampleCost)}).${minimumNumber > sampleCalculatedMinutes ? " The minimum charge applies." : ""}`
    };
  }, [basis, basisDetails, minimumNumber, minutesNumber, rate]);

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
        <div className={styles.templateSection}>
          <div>
            <div className={styles.stepEyebrow}>Quick start</div>
            <h3 className={styles.sectionTitle}>Start with a common operation</h3>
            <p className={styles.helpText}>Choose a starting point, then adjust it below. Nothing is saved until you select Add labour operation.</p>
          </div>
          <div className={styles.templateGrid}>
            {TEMPLATES.map((template) => (
              <button
                key={template.label}
                type="button"
                className={styles.templateButton}
                onClick={() => applyTemplate(template)}
              >
                <strong>{template.label}</strong>
                <span>{template.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <section className={styles.formSection}>
        <div className={styles.stepNumber}>1</div>
        <div className={styles.sectionContent}>
          <h3 className={styles.sectionTitle}>What work is being charged?</h3>
          <p className={styles.helpText}>Use a clear reusable name. You will select this operation later inside a product’s production action.</p>
          <div className={styles.twoColumnGrid}>
            <label className={styles.fieldLabel}>
              Operation name
              <input
                required
                name="name"
                value={name}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
                className={styles.input}
                placeholder="e.g. Mount vinyl to panel"
              />
            </label>
            <label className={styles.fieldLabel}>
              Work area
              <select
                name="department"
                value={department}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setDepartment(event.target.value)}
                className={styles.input}
              >
                {DEPARTMENTS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span className={styles.fieldHint}>This only helps organise the list; it does not change the price.</span>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.stepNumber}>2</div>
        <div className={styles.sectionContent}>
          <h3 className={styles.sectionTitle}>What does one labour hour cost?</h3>
          <p className={styles.helpText}>Use your internal labour cost or charge-out rate, depending on how you want product costs calculated.</p>
          <label className={styles.rateField}>
            Hourly rate
            <div className={styles.moneyInputWrap}>
              <span>$</span>
              <input
                required
                name="hourlyRate"
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setHourlyRate(event.target.value)}
                className={styles.moneyInput}
              />
              <span>/ hour</span>
            </div>
            <span className={styles.fieldHint}>At {money(rate)}/hr, one minute costs {money(rate / 60)}.</span>
          </label>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.stepNumber}>3</div>
        <div className={styles.sectionContent}>
          <h3 className={styles.sectionTitle}>How should the time be calculated?</h3>
          <p className={styles.helpText}>Choose what makes this operation take longer. All time is entered in minutes.</p>
          <div className={styles.basisGrid}>
            {LABOUR_BASIS_OPTIONS.map((option) => (
              <label key={option.value} className={`${styles.basisCard} ${basis === option.value ? styles.basisCardSelected : ""}`}>
                <input
                  type="radio"
                  name="calculationBasis"
                  value={option.value}
                  checked={basis === option.value}
                  onChange={() => setBasis(option.value)}
                />
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </label>
            ))}
          </div>

          <div className={styles.timeInputs}>
            <label className={styles.fieldLabel}>
              {basisDetails.inputLabel}
              <div className={styles.unitInputWrap}>
                <input
                  required
                  name="timeMinutes"
                  type="number"
                  min="0"
                  step="0.1"
                  value={minutes}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setMinutes(event.target.value)}
                  className={styles.input}
                />
                <span>minutes</span>
              </div>
            </label>
            <label className={styles.fieldLabel}>
              Minimum charge
              <div className={styles.unitInputWrap}>
                <input
                  name="minimumMinutes"
                  type="number"
                  min="0"
                  step="0.1"
                  value={minimumMinutes}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setMinimumMinutes(event.target.value)}
                  className={styles.input}
                />
                <span>minutes</span>
              </div>
              <span className={styles.fieldHint}>The total time will never fall below this amount. Use 0 when no minimum is needed.</span>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.previewCard} aria-live="polite">
        <div>
          <div className={styles.previewLabel}>Live cost example</div>
          <strong className={styles.previewHeadline}>{liveExample.headline}</strong>
          <p>{liveExample.detail}</p>
        </div>
        <div className={styles.previewPrice}>{liveExample.cost}</div>
      </section>

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton}>
          {mode === "edit" ? "Save labour operation" : "Add labour operation"}
        </button>
        <span className={styles.saveHint}>The system stores the calculation in the existing costing engine automatically.</span>
      </div>
    </form>
  );
}

