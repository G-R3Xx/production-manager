"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { normalizeProductionFlowName, productionFlowPresets } from "@/lib/productionFlowPresets";
import { saveSimpleProductProductionFlowAction } from "./actions";

type MaterialOption = {
  id: string;
  name: string;
  materialType: string;
  materialGroup: string | null;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
};

type ProcessOption = {
  id: string;
  name: string;
  department: string;
  processType: string;
  labourOperationId: string | null;
  labourOperationName: string | null;
};

type MachineOption = {
  id: string;
  name: string;
  processIds: string[];
};

type LabourOption = {
  id: string;
  name: string;
  department: string;
  hourlyRate: string;
};

type FlowStep = {
  processToken: string;
  name: string;
  processType: string;
  machineId: string | null;
  labourOperationId: string | null;
};

type PreviewSummary = {
  materialCost: number;
  machineCost: number;
  inkCost: number;
  labourCost: number;
  totalCost: number;
  sellPrice: number;
  processBreakdown: Array<{
    processName: string;
    machineName: string | null;
    labourName?: string | null;
  }>;
} | null;

type Props = {
  productId: string;
  department: string;
  materials: MaterialOption[];
  processes: ProcessOption[];
  machines: MachineOption[];
  labour: LabourOption[];
  initialMaterialId: string;
  initialSteps: FlowStep[];
  preview: PreviewSummary;
  previewWidth: number;
  previewHeight: number;
  previewQuantity: number;
};

const panel = {
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  padding: 18,
  background: "#fff"
};

const input = {
  width: "100%",
  minHeight: 44,
  border: "1px solid #cbd5e1",
  borderRadius: 11,
  padding: "0 12px",
  boxSizing: "border-box" as const,
  background: "#fff"
};

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD"
});

function materialDescription(material: MaterialOption): string {
  if (material.rollWidthMm) return `${material.materialType} · ${material.rollWidthMm} mm roll`;
  if (material.widthMm && material.lengthMm) return `${material.materialType} · ${material.widthMm} × ${material.lengthMm} mm`;
  return [material.materialGroup, material.materialType].filter(Boolean).join(" · ") || "Material";
}

function resourceRequirements(step: FlowStep): { machineRelevant: boolean; labourRelevant: boolean } {
  const preset = productionFlowPresets.find((item) => normalizeProductionFlowName(item.name) === normalizeProductionFlowName(step.name));
  if (preset) return { machineRelevant: preset.machineRelevant, labourRelevant: preset.labourRelevant };
  return {
    machineRelevant: ["print", "laminate", "cut", "mount", "machine", "other"].includes(step.processType),
    labourRelevant: true
  };
}

export function ProductProductionFlowBuilder({
  productId,
  department,
  materials,
  processes,
  machines,
  labour,
  initialMaterialId,
  initialSteps,
  preview,
  previewWidth,
  previewHeight,
  previewQuantity
}: Props) {
  const [materialId, setMaterialId] = useState(initialMaterialId);
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps);
  const [dirty, setDirty] = useState(false);

  const processById = useMemo(() => new Map(processes.map((process) => [process.id, process])), [processes]);
  const machineById = useMemo(() => new Map(machines.map((machine) => [machine.id, machine])), [machines]);
  const labourById = useMemo(() => new Map(labour.map((item) => [item.id, item])), [labour]);

  const presetCards = useMemo(() => productionFlowPresets.map((preset) => {
    const matchingProcess = processes.find((process) => normalizeProductionFlowName(process.name) === normalizeProductionFlowName(preset.name));
    return {
      ...preset,
      processToken: matchingProcess?.id ?? `preset:${preset.key}`,
      processType: matchingProcess?.processType ?? preset.processType
    };
  }), [processes]);

  const presetProcessIds = useMemo(() => new Set(presetCards.map((item) => item.processToken).filter((token) => !token.startsWith("preset:"))), [presetCards]);
  const selectedTokens = useMemo(() => new Set(steps.map((step) => step.processToken)), [steps]);
  const otherProcesses = processes.filter((process) => !presetProcessIds.has(process.id) && !selectedTokens.has(process.id));

  const markChanged = () => setDirty(true);

  const addStep = (step: FlowStep) => {
    if (selectedTokens.has(step.processToken)) return;
    setSteps((current) => [...current, step]);
    markChanged();
  };

  const updateStep = (index: number, patch: Partial<FlowStep>) => {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
    markChanged();
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markChanged();
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
    markChanged();
  };

  const flowJson = JSON.stringify(steps.map((step) => ({
    processToken: step.processToken,
    machineId: step.machineId,
    labourOperationId: step.labourOperationId
  })));

  return <div style={{ display: "grid", gap: 16 }}>
    <section style={{ ...panel, background: "linear-gradient(180deg,#f8fffe,#fff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase", letterSpacing: ".08em" }}>Simple production builder</div>
          <h2 style={{ margin: "6px 0" }}>How is this product made?</h2>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55, maxWidth: 780 }}>Choose the stock, then add what happens to it in production order. Production Manager creates and maintains the technical manufacturing method in the background.</p>
        </div>
        <Link href="/settings" style={{ textDecoration: "none", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 11, padding: "9px 12px", fontWeight: 900 }}>Advanced production setup</Link>
      </div>
    </section>

    <form action={saveSimpleProductProductionFlowAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="flowJson" value={flowJson} />

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 13, alignItems: "start" }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "#e0f2fe", color: "#075985", fontWeight: 950, fontSize: 18 }}>1</span>
          <div>
            <h3 style={{ margin: 0 }}>Choose the main material</h3>
            <p style={{ margin: "5px 0 13px", color: "#64748b" }}>This provides the base stock cost. Choose no physical material for installation, labour-only work or customer-supplied signage.</p>
            <select
              name="materialId"
              value={materialId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setMaterialId(event.target.value);
                markChanged();
              }}
              style={input}
            >
              <option value="">No physical material / customer supplied</option>
              {materials.map((material) => <option key={material.id} value={material.id}>{material.name} — {materialDescription(material)}</option>)}
            </select>
            {!materials.length ? <div style={{ marginTop: 10, padding: 11, borderRadius: 11, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>No active materials are available. You can still build a labour-only workflow, or <Link href="/materials" style={{ color: "inherit", fontWeight: 950 }}>add materials</Link>.</div> : null}
          </div>
        </div>
      </section>

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 13, alignItems: "start" }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "#ede9fe", color: "#6d28d9", fontWeight: 950, fontSize: 18 }}>2</span>
          <div>
            <h3 style={{ margin: 0 }}>Add what happens</h3>
            <p style={{ margin: "5px 0 13px", color: "#64748b" }}>Select only the actions this product needs. You can arrange them in the correct production order below.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
              {presetCards.map((preset) => {
                const selected = selectedTokens.has(preset.processToken);
                return <button
                  key={preset.key}
                  type="button"
                  disabled={selected}
                  onClick={() => addStep({
                    processToken: preset.processToken,
                    name: preset.name,
                    processType: preset.processType,
                    machineId: null,
                    labourOperationId: null
                  })}
                  style={{
                    minHeight: 92,
                    textAlign: "left",
                    border: selected ? "2px solid #86efac" : "1px solid #dbe4f0",
                    borderRadius: 14,
                    background: selected ? "#f0fdf4" : "#fff",
                    padding: 13,
                    cursor: selected ? "default" : "pointer",
                    opacity: selected ? 0.72 : 1
                  }}
                >
                  <span style={{ display: "flex", gap: 9, alignItems: "center" }}><span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "#f1f5f9", fontWeight: 950 }}>{preset.icon}</span><strong>{preset.name}</strong></span>
                  <span style={{ display: "block", marginTop: 7, color: "#64748b", fontSize: 12, lineHeight: 1.35 }}>{selected ? "Added to workflow" : preset.description}</span>
                </button>;
              })}
            </div>

            {otherProcesses.length ? <details style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 13, padding: 12, background: "#f8fafc" }}>
              <summary style={{ cursor: "pointer", fontWeight: 900 }}>Other saved production steps ({otherProcesses.length})</summary>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 11 }}>
                {otherProcesses.map((process) => <button key={process.id} type="button" onClick={() => addStep({ processToken: process.id, name: process.name, processType: process.processType, machineId: null, labourOperationId: process.labourOperationId })} style={{ border: "1px solid #cbd5e1", borderRadius: 999, background: "#fff", padding: "8px 11px", fontWeight: 850, cursor: "pointer" }}>+ {process.name}</button>)}
              </div>
            </details> : null}
          </div>
        </div>
      </section>

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 13, alignItems: "start" }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "#dcfce7", color: "#166534", fontWeight: 950, fontSize: 18 }}>3</span>
          <div>
            <h3 style={{ margin: 0 }}>Put the work in order</h3>
            <p style={{ margin: "5px 0 13px", color: "#64748b" }}>This sequence becomes the production workflow. Open Costing resources only when a particular machine or labour rate must be used.</p>

            {steps.length ? <div style={{ display: "grid", gap: 10 }}>
              {steps.map((step, index) => {
                const process = processById.get(step.processToken);
                const requirements = resourceRequirements(step);
                const compatibleMachines = process
                  ? machines.filter((machine) => machine.processIds.includes(process.id) || machine.id === step.machineId)
                  : machines;
                const automaticMachine = process ? machines.find((machine) => machine.processIds.includes(process.id)) : undefined;
                const selectedMachine = step.machineId ? machineById.get(step.machineId) : automaticMachine;
                const selectedLabour = step.labourOperationId
                  ? labourById.get(step.labourOperationId)
                  : process?.labourOperationId
                    ? labourById.get(process.labourOperationId)
                    : undefined;

                return <article key={step.processToken} style={{ border: "1px solid #dbe4f0", borderRadius: 15, background: "#f8fafc", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "38px minmax(0,1fr) auto", gap: 11, alignItems: "center", padding: 13 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: "#0f172a", color: "#fff", fontWeight: 950 }}>{index + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: 16 }}>{step.name}</strong>
                      <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>
                        {requirements.machineRelevant ? `Machine: ${selectedMachine?.name ?? "not costed"}` : "No machine needed"}
                        {requirements.labourRelevant ? ` · Labour: ${selectedLabour?.name ?? "not costed"}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} aria-label="Move earlier" style={{ border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", minWidth: 34, height: 34, cursor: index === 0 ? "not-allowed" : "pointer", opacity: index === 0 ? 0.4 : 1 }}>↑</button>
                      <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} aria-label="Move later" style={{ border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", minWidth: 34, height: 34, cursor: index === steps.length - 1 ? "not-allowed" : "pointer", opacity: index === steps.length - 1 ? 0.4 : 1 }}>↓</button>
                      <button type="button" onClick={() => removeStep(index)} style={{ border: "1px solid #fecaca", borderRadius: 9, background: "#fff", color: "#b91c1c", height: 34, padding: "0 9px", fontWeight: 850, cursor: "pointer" }}>Remove</button>
                    </div>
                  </div>

                  {(requirements.machineRelevant || requirements.labourRelevant) ? <details style={{ borderTop: "1px solid #e2e8f0", background: "#fff" }}>
                    <summary style={{ cursor: "pointer", padding: "10px 13px", fontSize: 13, fontWeight: 900, color: "#475569" }}>Costing resources {selectedMachine || selectedLabour ? "· configured" : "· optional"}</summary>
                    <div style={{ display: "grid", gridTemplateColumns: requirements.machineRelevant && requirements.labourRelevant ? "1fr 1fr" : "1fr", gap: 10, padding: "0 13px 13px" }}>
                      {requirements.machineRelevant ? <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Machine
                        <select value={step.machineId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateStep(index, { machineId: event.target.value || null })} style={input}>
                          <option value="">Automatic compatible machine{automaticMachine ? ` — ${automaticMachine.name}` : ""}</option>
                          {compatibleMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
                        </select>
                        {!compatibleMachines.length ? <span style={{ color: "#9a3412", fontSize: 12 }}>No compatible machine is configured. The step can still be saved with $0 machine cost.</span> : null}
                      </label> : null}
                      {requirements.labourRelevant ? <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Labour / staff time
                        <select value={step.labourOperationId ?? ""} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateStep(index, { labourOperationId: event.target.value || null })} style={input}>
                          <option value="">Use step default{process?.labourOperationName ? ` — ${process.labourOperationName}` : " / no labour cost"}</option>
                          {labour.map((item) => <option key={item.id} value={item.id}>{item.name} — {currency.format(Number(item.hourlyRate || 0))}/hr</option>)}
                        </select>
                      </label> : null}
                    </div>
                  </details> : null}
                </article>;
              })}
            </div> : <div style={{ padding: 17, borderRadius: 13, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>No production actions selected yet. Choose one or more actions above, or leave this empty for a material-only product.</div>}
          </div>
        </div>
      </section>

      <section style={{ ...panel, background: "linear-gradient(180deg,#eff6ff,#fff)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#1d4ed8", textTransform: "uppercase" }}>Ready to save</div>
            <h3 style={{ margin: "5px 0" }}>{steps.length ? steps.map((step) => step.name).join(" → ") : "Material only / no production actions"}</h3>
            <div style={{ color: "#64748b", fontSize: 13 }}>{materialId ? materials.find((material) => material.id === materialId)?.name ?? "Selected material" : "No physical material"} · {department.replace(/_/g, " ")}</div>
          </div>
          <button style={{ minHeight: 46, border: 0, borderRadius: 12, background: "#2563eb", color: "#fff", fontWeight: 950, padding: "0 20px", cursor: "pointer" }}>Save production workflow</button>
        </div>
      </section>
    </form>

    <section style={{ ...panel, background: "linear-gradient(180deg,#f0fdfa,#fff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase" }}>Saved workflow preview</div>
          <h3 style={{ margin: "5px 0" }}>{previewWidth} × {previewHeight} mm · Qty {previewQuantity}</h3>
          <p style={{ margin: 0, color: "#64748b" }}>{dirty ? "You have unsaved changes. Save the workflow to refresh this calculation." : "This is the same costing used by quoting and WordPress."}</p>
        </div>
        <form method="get" style={{ display: "grid", gridTemplateColumns: "100px 100px 80px auto", gap: 7, alignItems: "end" }}>
          <input type="hidden" name="tab" value="build" />
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 850 }}>Width mm<input name="width" type="number" min="1" defaultValue={previewWidth} style={{ ...input, minHeight: 38 }} /></label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 850 }}>Height mm<input name="height" type="number" min="1" defaultValue={previewHeight} style={{ ...input, minHeight: 38 }} /></label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 850 }}>Qty<input name="quantity" type="number" min="1" defaultValue={previewQuantity} style={{ ...input, minHeight: 38 }} /></label>
          <button style={{ minHeight: 38, border: 0, borderRadius: 10, background: "#0f766e", color: "#fff", fontWeight: 900, padding: "0 13px", cursor: "pointer" }}>Recalculate</button>
        </form>
      </div>

      {preview ? <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", gap: 9, marginTop: 15 }}>
          {[
            ["Material", preview.materialCost],
            ["Machines", preview.machineCost],
            ["Ink", preview.inkCost],
            ["Labour", preview.labourCost],
            ["Total cost", preview.totalCost],
            ["Sell price", preview.sellPrice]
          ].map(([label, value]) => <div key={String(label)} style={{ padding: 12, borderRadius: 12, background: "#fff", border: "1px solid #ccfbf1" }}><div style={{ fontSize: 12, color: "#64748b" }}>{label}</div><div style={{ marginTop: 5, fontSize: 18, fontWeight: 950 }}>{currency.format(Number(value))}</div></div>)}
        </div>
        {preview.processBreakdown.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>{preview.processBreakdown.map((step, index) => <span key={`${step.processName}-${index}`} style={{ border: "1px solid #99f6e4", background: "#fff", borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 850 }}>{index + 1}. {step.processName}{step.machineName ? ` · ${step.machineName}` : ""}{step.labourName ? ` · ${step.labourName}` : ""}</span>)}</div> : null}
      </> : <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #ccfbf1", color: "#0f766e" }}>Save the production workflow to calculate its material, machine and labour cost.</div>}
    </section>
  </div>;
}
