"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { normalizeProductionFlowName, productionFlowPresets } from "@/lib/productionFlowPresets";
import { saveInternalProductSetupAction } from "./actions";

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
  currentStatus: string;
  materials: MaterialOption[];
  processes: ProcessOption[];
  initialMaterialId: string;
  initialSteps: FlowStep[];
  initialDeliveryMethod: string;
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

const presetByKey = new Map(productionFlowPresets.map((preset) => [preset.key, preset]));

function materialDescription(material: MaterialOption): string {
  if (material.rollWidthMm) return `${material.materialType} · ${material.rollWidthMm} mm roll`;
  if (material.widthMm && material.lengthMm) return `${material.materialType} · ${material.widthMm} × ${material.lengthMm} mm`;
  return [material.materialGroup, material.materialType].filter(Boolean).join(" · ") || "Material";
}

function presetKeyForStep(step: FlowStep): string | null {
  const normalized = normalizeProductionFlowName(step.name);
  return productionFlowPresets.find((preset) => normalizeProductionFlowName(preset.name) === normalized)?.key ?? null;
}

function stepFromPreset(key: string, processes: ProcessOption[]): FlowStep | null {
  const preset = presetByKey.get(key);
  if (!preset) return null;
  const existing = processes.find((process) => normalizeProductionFlowName(process.name) === normalizeProductionFlowName(preset.name));
  return {
    processToken: existing?.id ?? `preset:${preset.key}`,
    name: preset.name,
    processType: existing?.processType ?? preset.processType,
    machineId: null,
    labourOperationId: null
  };
}

const presetOrder = new Map(productionFlowPresets.map((preset, index) => [preset.key, index]));

function insertPresetInNormalOrder(current: FlowStep[], nextStep: FlowStep): FlowStep[] {
  const nextKey = presetKeyForStep(nextStep);
  if (!nextKey) return [...current, nextStep];
  const nextRank = presetOrder.get(nextKey) ?? productionFlowPresets.length;
  const insertAt = current.findIndex((step) => {
    const stepKey = presetKeyForStep(step);
    if (!stepKey) return nextKey === "install" ? false : true;
    return (presetOrder.get(stepKey) ?? productionFlowPresets.length) > nextRank;
  });
  if (insertAt < 0) return [...current, nextStep];
  return [...current.slice(0, insertAt), nextStep, ...current.slice(insertAt)];
}

function actionCardStyle(selected: boolean) {
  return {
    minHeight: 78,
    textAlign: "left" as const,
    border: selected ? "2px solid #2563eb" : "1px solid #dbe4f0",
    borderRadius: 14,
    background: selected ? "#eff6ff" : "#fff",
    padding: 13,
    cursor: "pointer"
  };
}

export function ProductProductionFlowBuilder({
  productId,
  department,
  currentStatus,
  materials,
  processes,
  initialMaterialId,
  initialSteps,
  initialDeliveryMethod,
  preview,
  previewWidth,
  previewHeight,
  previewQuantity
}: Props) {
  const [materialId, setMaterialId] = useState(initialMaterialId);
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps);
  const [width, setWidth] = useState(previewWidth);
  const [height, setHeight] = useState(previewHeight);
  const [quantity, setQuantity] = useState(previewQuantity);
  const [deliveryMethod, setDeliveryMethod] = useState(initialDeliveryMethod || "pickup");
  const [dirty, setDirty] = useState(false);

  const selectedPresetKeys = useMemo(() => new Set(steps.map(presetKeyForStep).filter(Boolean)), [steps]);
  const selectedTokens = useMemo(() => new Set(steps.map((step) => step.processToken)), [steps]);
  const otherProcesses = processes.filter((process) => !selectedTokens.has(process.id) && !productionFlowPresets.some((preset) => normalizeProductionFlowName(preset.name) === normalizeProductionFlowName(process.name)));
  const printMethod = selectedPresetKeys.has("direct_print") ? "direct_print" : selectedPresetKeys.has("roll_print") ? "roll_print" : "none";

  const markChanged = () => setDirty(true);

  const setPreset = (key: string, selected: boolean) => {
    const nextStep = stepFromPreset(key, processes);
    if (!nextStep) return;
    setSteps((current) => {
      const withoutPreset = current.filter((step) => presetKeyForStep(step) !== key);
      return selected ? insertPresetInNormalOrder(withoutPreset, nextStep) : withoutPreset;
    });
    markChanged();
  };

  const setPrintMethod = (value: string) => {
    const nextStep = value === "none" ? null : stepFromPreset(value, processes);
    setSteps((current) => {
      const withoutPrint = current.filter((step) => !["direct_print", "roll_print"].includes(presetKeyForStep(step) ?? ""));
      return nextStep ? insertPresetInNormalOrder(withoutPrint, nextStep) : withoutPrint;
    });
    markChanged();
  };

  const setFulfilment = (value: string) => {
    setDeliveryMethod(value);
    const hasInstall = selectedPresetKeys.has("install");
    if (value === "install" && !hasInstall) setPreset("install", true);
    if (value !== "install" && hasInstall) setPreset("install", false);
    markChanged();
  };

  const addOtherProcess = (process: ProcessOption) => {
    if (selectedTokens.has(process.id)) return;
    setSteps((current) => [...current, { processToken: process.id, name: process.name, processType: process.processType, machineId: null, labourOperationId: null }]);
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

  const selectedMaterial = materials.find((material) => material.id === materialId);

  return <div style={{ display: "grid", gap: 16 }}>
    <section style={{ ...panel, background: "linear-gradient(180deg,#eff6ff,#fff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: ".08em" }}>Fast internal setup</div>
          <h2 style={{ margin: "6px 0" }}>Make this product ready to quote</h2>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55, maxWidth: 820 }}>Choose the stock, normal size, print, finishing and how the order leaves the business. Production Manager creates the technical workflow quietly in the background.</p>
        </div>
        <Link href="/settings" style={{ textDecoration: "none", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 11, padding: "9px 12px", fontWeight: 900 }}>Advanced settings</Link>
      </div>
    </section>

    <form action={saveInternalProductSetupAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="flowJson" value={flowJson} />
      <input type="hidden" name="deliveryMethod" value={deliveryMethod} />
      <input type="hidden" name="printMethod" value={printMethod} />

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: 13 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "#dbeafe", color: "#1d4ed8", fontWeight: 950, fontSize: 18 }}>1</span>
          <div>
            <h3 style={{ margin: 0 }}>Material and normal quote size</h3>
            <p style={{ margin: "5px 0 13px", color: "#64748b" }}>These are the defaults staff see when adding the product to a quote. They can still change the size and quantity on the quote.</p>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,2fr) repeat(3,minmax(110px,.6fr))", gap: 10 }}>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Main material
                <select name="materialId" value={materialId} onChange={(event: ChangeEvent<HTMLSelectElement>) => { setMaterialId(event.target.value); markChanged(); }} style={input}>
                  <option value="">No physical material / customer supplied</option>
                  {materials.map((material) => <option key={material.id} value={material.id}>{material.name} — {materialDescription(material)}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Width mm<input name="width" type="number" min="1" value={width} onChange={(event) => { setWidth(Math.max(1, Number(event.target.value) || 1)); markChanged(); }} style={input} /></label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Height mm<input name="height" type="number" min="1" value={height} onChange={(event) => { setHeight(Math.max(1, Number(event.target.value) || 1)); markChanged(); }} style={input} /></label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Quantity<input name="quantity" type="number" min="1" value={quantity} onChange={(event) => { setQuantity(Math.max(1, Math.round(Number(event.target.value) || 1))); markChanged(); }} style={input} /></label>
            </div>
            {!materials.length ? <div style={{ marginTop: 10, padding: 11, borderRadius: 11, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>No active materials are available. Labour-only products can still be saved, or <Link href="/materials" style={{ color: "inherit", fontWeight: 950 }}>add a material</Link>.</div> : null}
          </div>
        </div>
      </section>

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: 13 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "#fef3c7", color: "#92400e", fontWeight: 950, fontSize: 18 }}>2</span>
          <div>
            <h3 style={{ margin: 0 }}>How is it printed?</h3>
            <p style={{ margin: "5px 0 13px", color: "#64748b" }}>Choose the normal print method. Select no print for blank stock, cut vinyl, installation-only or customer-supplied signage.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(170px,1fr))", gap: 10 }}>
              {[
                ["none", "No print", "Blank stock, cut vinyl or service-only work"],
                ["direct_print", "Direct print", "Print directly onto the selected substrate"],
                ["roll_print", "Roll print", "Print vinyl, banner, paper or other roll media"]
              ].map(([value, label, description]) => <button key={value} type="button" onClick={() => setPrintMethod(value)} style={actionCardStyle(printMethod === value)}><strong>{label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>{description}</span></button>)}
            </div>
          </div>
        </div>
      </section>

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: 13 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "#ede9fe", color: "#6d28d9", fontWeight: 950, fontSize: 18 }}>3</span>
          <div>
            <h3 style={{ margin: 0 }}>What normally happens after printing?</h3>
            <p style={{ margin: "5px 0 13px", color: "#64748b" }}>Choose only the common actions. Detailed machines, labour rates and special rules stay in Advanced settings.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10 }}>
              {["laminate", "trim_cut", "mount_apply", "eyelets", "finishing", "pack"].map((key) => {
                const preset = presetByKey.get(key);
                if (!preset) return null;
                const selected = selectedPresetKeys.has(key);
                return <button key={key} type="button" onClick={() => setPreset(key, !selected)} style={actionCardStyle(selected)}><strong>{preset.icon} {preset.name}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{selected ? "Included" : preset.description}</span></button>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section style={panel}>
        <div style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: 13 }}>
          <span style={{ width: 42, height: 42, borderRadius: 13, display: "grid", placeItems: "center", background: "#dcfce7", color: "#166534", fontWeight: 950, fontSize: 18 }}>4</span>
          <div>
            <h3 style={{ margin: 0 }}>How does the customer receive it?</h3>
            <p style={{ margin: "5px 0 13px", color: "#64748b" }}>This becomes the default fulfilment choice when quoting. Install automatically adds the installation step.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(170px,1fr))", gap: 10 }}>
              {[
                ["pickup", "Pickup", "Customer collects from your premises"],
                ["delivery", "Delivery", "Deliver the finished order"],
                ["install", "Install", "Create an installation step for this product"]
              ].map(([value, label, description]) => <button key={value} type="button" onClick={() => setFulfilment(value)} style={actionCardStyle(deliveryMethod === value)}><strong>{label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{description}</span></button>)}
            </div>
          </div>
        </div>
      </section>

      <details style={{ ...panel, padding: 0, overflow: "hidden" }}>
        <summary style={{ cursor: "pointer", padding: 17, fontWeight: 950, color: "#475569" }}>Advanced sequence and uncommon production steps</summary>
        <div style={{ borderTop: "1px solid #e2e8f0", padding: 17, display: "grid", gap: 12 }}>
          <p style={{ margin: 0, color: "#64748b" }}>The normal order is created automatically. Open this only when the work needs a special sequence or a custom saved production step.</p>
          {steps.length ? <div style={{ display: "grid", gap: 8 }}>{steps.map((step, index) => <article key={`${step.processToken}-${index}`} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: 9, alignItems: "center", border: "1px solid #dbe4f0", borderRadius: 12, padding: 10, background: "#f8fafc" }}><span style={{ width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center", background: "#0f172a", color: "#fff", fontWeight: 950 }}>{index + 1}</span><strong>{step.name}</strong><div style={{ display: "flex", gap: 5 }}><button type="button" disabled={index === 0} onClick={() => moveStep(index, -1)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", width: 32, height: 32 }}>↑</button><button type="button" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", width: 32, height: 32 }}>↓</button><button type="button" onClick={() => removeStep(index)} style={{ border: "1px solid #fecaca", borderRadius: 8, background: "#fff", color: "#b91c1c", height: 32 }}>Remove</button></div></article>)}</div> : <div style={{ color: "#64748b" }}>No production actions selected.</div>}
          {otherProcesses.length ? <div><strong>Other saved steps</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>{otherProcesses.map((process) => <button key={process.id} type="button" onClick={() => addOtherProcess(process)} style={{ border: "1px solid #cbd5e1", borderRadius: 999, background: "#fff", padding: "7px 10px", fontWeight: 850 }}>+ {process.name}</button>)}</div></div> : null}
        </div>
      </details>

      <section style={{ ...panel, background: "linear-gradient(180deg,#f0fdfa,#fff)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase" }}>Ready for quoting</div>
            <h3 style={{ margin: "5px 0" }}>{selectedMaterial?.name ?? "No physical material"} · {width} × {height} mm · Qty {quantity}</h3>
            <div style={{ color: "#64748b", lineHeight: 1.5 }}>{steps.length ? steps.map((step) => step.name).join(" → ") : "No production actions"} · {deliveryMethod.replace(/_/g, " ")} · {department.replace(/_/g, " ")}</div>
          </div>
          <div style={{ display:"grid",gap:9,justifyItems:"end" }}>
            <label style={{ display:"flex",gap:8,alignItems:"center",fontWeight:850,fontSize:13,color:"#475569" }}><input type="checkbox" name="makeActive" defaultChecked={currentStatus === "draft" || currentStatus === "active"}/> Available for staff to quote</label>
            <button style={{ minHeight: 48, border: 0, borderRadius: 12, background: "#2563eb", color: "#fff", fontWeight: 950, padding: "0 22px", cursor: "pointer" }}>Save and make ready to quote</button>
          </div>
        </div>
      </section>
    </form>

    <section style={{ ...panel, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#475569", textTransform: "uppercase" }}>Current saved price check</div>
          <h3 style={{ margin: "5px 0" }}>{previewWidth} × {previewHeight} mm · Qty {previewQuantity}</h3>
          <p style={{ margin: 0, color: "#64748b" }}>{dirty ? "Save your changes to refresh the calculation." : "This is the internal cost and sell price used when quoting."}</p>
        </div>
        <Link href={`/products/${productId}?tab=pricing`} style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>Open full price check →</Link>
      </div>
      {preview ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9, marginTop: 15 }}>
        {[["Material", preview.materialCost], ["Machines", preview.machineCost], ["Ink", preview.inkCost], ["Labour", preview.labourCost], ["Total cost", preview.totalCost], ["Sell price", preview.sellPrice]].map(([label, value]) => <div key={String(label)} style={{ padding: 12, borderRadius: 12, background: "#fff", border: "1px solid #dbe4f0" }}><div style={{ fontSize: 12, color: "#64748b" }}>{label}</div><div style={{ marginTop: 5, fontSize: 18, fontWeight: 950 }}>{currency.format(Number(value))}</div></div>)}
      </div> : <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #dbe4f0", color: "#475569" }}>Save the product setup to calculate its cost and sell price.</div>}
    </section>
  </div>;
}
