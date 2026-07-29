"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { normalizeProductionFlowName, productionFlowPresets, type ProductionFlowPreset } from "@/lib/productionFlowPresets";
import { saveInternalProductSetupAction } from "./actions";

type MaterialOption = {
  id: string;
  name: string;
  sku: string | null;
  notes: string | null;
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
  initialLaminateMaterialId: string;
  initialEyeletMaterialId: string;
  initialEyeletPreset: string;
  preview: PreviewSummary;
  previewWidth: number;
  previewHeight: number;
  previewQuantity: number;
};

type BuilderStep = "material" | "size" | "print" | "finishing" | "fulfilment";

const builderSteps: Array<{ key: BuilderStep; number: number; label: string; hint: string }> = [
  { key: "material", number: 1, label: "Substrate", hint: "Choose the stock" },
  { key: "size", number: 2, label: "Size & quantity", hint: "Set quote defaults" },
  { key: "print", number: 3, label: "Print", hint: "Choose the usual method" },
  { key: "finishing", number: 4, label: "Finishing", hint: "Laminate, trim, eyelets" },
  { key: "fulfilment", number: 5, label: "Finish", hint: "Pickup, delivery or install" }
];

const eyeletPresets = [
  { value: "four_corners", label: "4 corners", qty: 4 },
  { value: "top_corners_only", label: "Top corners only", qty: 2 },
  { value: "centre_top_bottom", label: "Centre top + bottom", qty: 2 },
  { value: "pole_fixing", label: "2 top + 2 bottom for pole fixing", qty: 4 },
  { value: "__custom", label: "Ask for a custom quantity", qty: 0 }
];

const panel = {
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  padding: 18,
  background: "#fff"
};

const input = {
  width: "100%",
  minHeight: 46,
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

const presetByKey = new Map<string, ProductionFlowPreset>(productionFlowPresets.map((preset) => [preset.key, preset]));
const presetOrder = new Map(productionFlowPresets.map((preset, index) => [preset.key, index]));

function materialDescription(material: MaterialOption): string {
  if (material.rollWidthMm) return `${material.materialType} · ${material.rollWidthMm} mm roll`;
  if (material.widthMm && material.lengthMm) return `${material.materialType} · ${material.widthMm} × ${material.lengthMm} mm`;
  return [material.materialGroup, material.materialType].filter(Boolean).join(" · ") || "Material";
}

function materialSearchText(material: MaterialOption): string {
  return `${material.name} ${material.sku ?? ""} ${material.notes ?? ""} ${material.materialType} ${material.materialGroup ?? ""}`.toLowerCase();
}

function isLaminateMaterial(material: MaterialOption): boolean {
  const text = materialSearchText(material);
  return ["roll_laminate", "roll laminate", "cello_stock", "cello stock"].includes(material.materialType.toLowerCase()) || /\blaminat|overlam|cello\b/.test(text);
}

function isEyeletMaterial(material: MaterialOption): boolean {
  return /\beyelet|grommet\b/.test(materialSearchText(material));
}

function isMainMaterial(material: MaterialOption): boolean {
  if (isLaminateMaterial(material) || isEyeletMaterial(material)) return false;
  const type = material.materialType.toLowerCase();
  return !["fixing", "hardware", "finishing", "binding", "item", "consumable"].includes(type);
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

function insertPresetInNormalOrder(current: FlowStep[], nextStep: FlowStep): FlowStep[] {
  const nextKey = presetKeyForStep(nextStep);
  if (!nextKey) return [...current, nextStep];
  const nextRank = presetOrder.get(nextKey) ?? productionFlowPresets.length;
  const insertAt = current.findIndex((step) => {
    const stepKey = presetKeyForStep(step);
    if (!stepKey) return nextKey !== "install";
    return (presetOrder.get(stepKey) ?? productionFlowPresets.length) > nextRank;
  });
  if (insertAt < 0) return [...current, nextStep];
  return [...current.slice(0, insertAt), nextStep, ...current.slice(insertAt)];
}

function choiceCardStyle(selected: boolean) {
  return {
    minHeight: 86,
    textAlign: "left" as const,
    border: selected ? "2px solid #2563eb" : "1px solid #dbe4f0",
    borderRadius: 14,
    background: selected ? "#eff6ff" : "#fff",
    padding: 13,
    cursor: "pointer",
    boxShadow: selected ? "0 7px 18px rgba(37,99,235,.10)" : "none"
  };
}

function SaveButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} style={{ minHeight: 50, border: 0, borderRadius: 12, background: pending ? "#94a3b8" : "#2563eb", color: "#fff", fontWeight: 950, padding: "0 22px", cursor: pending ? "wait" : "pointer" }}>{pending ? "Saving product…" : "Save product and make ready to quote"}</button>;
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
  initialLaminateMaterialId,
  initialEyeletMaterialId,
  initialEyeletPreset,
  preview,
  previewWidth,
  previewHeight,
  previewQuantity
}: Props) {
  const [activeStep, setActiveStep] = useState<BuilderStep>("material");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialId, setMaterialId] = useState(initialMaterialId);
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps);
  const [width, setWidth] = useState(previewWidth);
  const [height, setHeight] = useState(previewHeight);
  const [quantity, setQuantity] = useState(previewQuantity);
  const [deliveryMethod, setDeliveryMethod] = useState(initialDeliveryMethod || "pickup");
  const [laminateMaterialId, setLaminateMaterialId] = useState(initialLaminateMaterialId);
  const [eyeletMaterialId, setEyeletMaterialId] = useState(initialEyeletMaterialId);
  const [eyeletPreset, setEyeletPreset] = useState(initialEyeletPreset || "four_corners");
  const [dirty, setDirty] = useState(false);

  const selectedPresetKeys = useMemo(() => new Set(steps.map(presetKeyForStep).filter(Boolean)), [steps]);
  const selectedTokens = useMemo(() => new Set(steps.map((step) => step.processToken)), [steps]);
  const selectedMaterial = materials.find((material) => material.id === materialId);
  const selectedLaminate = materials.find((material) => material.id === laminateMaterialId);
  const selectedEyeletMaterial = materials.find((material) => material.id === eyeletMaterialId);
  const printMethod = selectedPresetKeys.has("direct_print") ? "direct_print" : selectedPresetKeys.has("roll_print") ? "roll_print" : "none";

  const mainMaterials = useMemo(() => {
    const filtered = materials.filter((material) => isMainMaterial(material) || material.id === materialId);
    const query = materialSearch.trim().toLowerCase();
    return (query ? filtered.filter((material) => materialSearchText(material).includes(query)) : filtered).slice(0, 40);
  }, [materials, materialId, materialSearch]);
  const laminateMaterials = useMemo(() => materials.filter(isLaminateMaterial), [materials]);
  const eyeletMaterials = useMemo(() => materials.filter(isEyeletMaterial), [materials]);
  const otherProcesses = processes.filter((process) => !selectedTokens.has(process.id) && !productionFlowPresets.some((preset) => normalizeProductionFlowName(preset.name) === normalizeProductionFlowName(process.name)));

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

  const setLaminate = (value: string) => {
    setLaminateMaterialId(value);
    const hasLaminate = steps.some((step) => presetKeyForStep(step) === "laminate");
    if (value && !hasLaminate) setPreset("laminate", true);
    if (!value && hasLaminate) setPreset("laminate", false);
    markChanged();
  };

  const setFulfilment = (value: string) => {
    setDeliveryMethod(value);
    setSteps((current) => {
      const withoutInstall = current.filter((step) => presetKeyForStep(step) !== "install");
      if (value !== "install") return withoutInstall;
      const installStep = stepFromPreset("install", processes);
      return installStep ? insertPresetInNormalOrder(withoutInstall, installStep) : withoutInstall;
    });
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
  const finishingValues = ["trim_cut", "mount_apply", "eyelets", "finishing", "pack"].filter((key) => selectedPresetKeys.has(key));
  const currentIndex = builderSteps.findIndex((step) => step.key === activeStep);
  const previousStep = currentIndex > 0 ? builderSteps[currentIndex - 1] : null;
  const nextStep = currentIndex < builderSteps.length - 1 ? builderSteps[currentIndex + 1] : null;

  const stepNavigation = <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 18 }}>
    {previousStep ? <button type="button" onClick={() => setActiveStep(previousStep.key)} style={{ minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#334155", fontWeight: 900, padding: "0 15px", cursor: "pointer" }}>← {previousStep.label}</button> : <span />}
    {nextStep ? <button type="button" onClick={() => setActiveStep(nextStep.key)} style={{ minHeight: 44, border: 0, borderRadius: 11, background: "#0f172a", color: "#fff", fontWeight: 900, padding: "0 17px", cursor: "pointer" }}>Next: {nextStep.label} →</button> : null}
  </div>;

  return <div style={{ display: "grid", gap: 16 }}>
    <section style={{ ...panel, background: "linear-gradient(180deg,#eff6ff,#fff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: ".08em" }}>Quick-quote style product setup</div>
          <h2 style={{ margin: "6px 0" }}>Build the reusable product exactly like a quote item</h2>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55, maxWidth: 850 }}>Work through substrate, size, print, finishing and fulfilment. Every choice happens instantly on this page; Production Manager only saves once at the end.</p>
        </div>
        <Link href="/settings" style={{ textDecoration: "none", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 11, padding: "9px 12px", fontWeight: 900 }}>Advanced settings</Link>
      </div>
    </section>

    <nav style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(120px,1fr))", gap: 8, padding: 8, borderRadius: 17, background: "#e9eef6", overflowX: "auto" }}>
      {builderSteps.map((step) => {
        const active = step.key === activeStep;
        const complete = builderSteps.findIndex((item) => item.key === step.key) < currentIndex;
        return <button key={step.key} type="button" onClick={() => setActiveStep(step.key)} style={{ minWidth: 120, border: active ? "1px solid #bfdbfe" : "1px solid transparent", borderRadius: 12, background: active ? "#fff" : "transparent", boxShadow: active ? "0 5px 16px rgba(15,23,42,.08)" : "none", padding: "10px 9px", textAlign: "left", cursor: "pointer", color: active ? "#0f172a" : "#64748b" }}><span style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 25, height: 25, borderRadius: 999, display: "grid", placeItems: "center", background: active ? "#2563eb" : complete ? "#16a34a" : "#cbd5e1", color: "#fff", fontSize: 12, fontWeight: 950 }}>{complete ? "✓" : step.number}</span><span><strong style={{ display: "block", fontSize: 13 }}>{step.label}</strong><span style={{ fontSize: 11 }}>{step.hint}</span></span></span></button>;
      })}
    </nav>

    <form action={saveInternalProductSetupAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="materialId" value={materialId} />
      <input type="hidden" name="width" value={width} />
      <input type="hidden" name="height" value={height} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="flowJson" value={flowJson} />
      <input type="hidden" name="deliveryMethod" value={deliveryMethod} />
      <input type="hidden" name="printMethod" value={printMethod} />
      <input type="hidden" name="finishingsCsv" value={finishingValues.join(",")} />
      <input type="hidden" name="laminateMaterialId" value={laminateMaterialId} />
      <input type="hidden" name="laminateMaterialName" value={selectedLaminate?.name ?? ""} />
      <input type="hidden" name="eyeletMaterialId" value={eyeletMaterialId} />
      <input type="hidden" name="eyeletMaterialName" value={selectedEyeletMaterial?.name ?? "Eyelets"} />
      <input type="hidden" name="eyeletPreset" value={eyeletPreset} />

      {activeStep === "material" ? <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}><div><h3 style={{ margin: 0 }}>1. Choose the substrate or main stock</h3><p style={{ margin: "5px 0 0", color: "#64748b" }}>This is the same starting point as Build a quick quote. Pick what the product is primarily made from.</p></div><input value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="Search substrates or roll stock" style={{ ...input, maxWidth: 320 }} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10, marginTop: 15 }}>
          <button type="button" onClick={() => { setMaterialId(""); markChanged(); }} style={choiceCardStyle(materialId === "")}><strong>No physical material</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>Customer-supplied signage, installation-only or labour/service work.</span></button>
          {mainMaterials.map((material) => <button key={material.id} type="button" onClick={() => { setMaterialId(material.id); markChanged(); }} style={choiceCardStyle(material.id === materialId)}><strong>{material.name}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 5 }}>{materialDescription(material)}</span>{material.sku ? <span style={{ display: "block", color: "#94a3b8", fontSize: 11, marginTop: 4 }}>{material.sku}</span> : null}</button>)}
        </div>
        {!mainMaterials.length && materialSearch ? <div style={{ marginTop: 13, padding: 13, borderRadius: 12, background: "#fff7ed", color: "#9a3412" }}>No materials match “{materialSearch}”.</div> : null}
        {stepNavigation}
      </section> : null}

      {activeStep === "size" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>2. Set the normal quote defaults</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Staff can change these on individual quotes. They are simply the values shown first.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(150px,1fr))", gap: 11 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Finished width mm<input type="number" min="1" value={width} onChange={(event: ChangeEvent<HTMLInputElement>) => { setWidth(Math.max(1, Number(event.target.value) || 1)); markChanged(); }} style={input} /></label>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Finished height mm<input type="number" min="1" value={height} onChange={(event: ChangeEvent<HTMLInputElement>) => { setHeight(Math.max(1, Number(event.target.value) || 1)); markChanged(); }} style={input} /></label>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Default quantity<input type="number" min="1" value={quantity} onChange={(event: ChangeEvent<HTMLInputElement>) => { setQuantity(Math.max(1, Math.round(Number(event.target.value) || 1))); markChanged(); }} style={input} /></label>
        </div>
        <div style={{ marginTop: 14, padding: 13, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><strong>Quote starts at:</strong> {width} × {height} mm · Qty {quantity}</div>
        {stepNavigation}
      </section> : null}

      {activeStep === "print" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>3. Choose the normal print method</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>This becomes the default on a quote, but staff can still choose another allowed method.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(170px,1fr))", gap: 10 }}>
          {[
            ["none", "No print", "Blank stock, cut vinyl or service-only work"],
            ["direct_print", "Direct print", "Print directly onto the selected substrate"],
            ["roll_print", "Roll print", "Print vinyl, banner, paper or other roll media"]
          ].map(([value, label, description]) => <button key={value} type="button" onClick={() => setPrintMethod(value)} style={choiceCardStyle(printMethod === value)}><strong>{label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6, lineHeight: 1.35 }}>{description}</span></button>)}
        </div>
        {stepNavigation}
      </section> : null}

      {activeStep === "finishing" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>4. Choose the normal finishing</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>These are saved as the default quote choices. Eyelets use the same placement presets as the quick quote builder.</p>
        <div style={{ display: "grid", gap: 15 }}>
          <label style={{ display: "grid", gap: 7, fontWeight: 850 }}>Default laminate
            <select value={laminateMaterialId} onChange={(event) => setLaminate(event.target.value)} style={input}>
              <option value="">No laminate</option>
              {laminateMaterials.map((material) => <option key={material.id} value={material.id}>{material.name} — {materialDescription(material)}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10 }}>
            {["trim_cut", "mount_apply", "eyelets", "finishing", "pack"].map((key) => {
              const preset = presetByKey.get(key);
              if (!preset) return null;
              const selected = selectedPresetKeys.has(key);
              return <button key={key} type="button" onClick={() => setPreset(key, !selected)} style={choiceCardStyle(selected)}><strong>{preset.icon} {preset.name}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{selected ? "Included by default" : preset.description}</span></button>;
            })}
          </div>
          {selectedPresetKeys.has("eyelets") ? <div style={{ display: "grid", gap: 11, padding: 15, borderRadius: 15, background: "#fff7ed", border: "1px solid #fed7aa" }}>
            <div><strong style={{ color: "#9a3412" }}>Eyelet defaults</strong><p style={{ margin: "4px 0 0", color: "#9a3412", fontSize: 13 }}>Staff still see the placement selector on every quote; this chooses the answer shown first.</p></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
              {eyeletPresets.map((preset) => <button key={preset.value} type="button" onClick={() => { setEyeletPreset(preset.value); markChanged(); }} style={{ ...choiceCardStyle(eyeletPreset === preset.value), minHeight: 68 }}><strong>{preset.label}</strong>{preset.qty ? <span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 4 }}>{preset.qty} eyelets</span> : null}</button>)}
            </div>
            <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Eyelet stock / hardware, optional<select value={eyeletMaterialId} onChange={(event) => { setEyeletMaterialId(event.target.value); markChanged(); }} style={input}><option value="">Cost labour only / no eyelet stock linked</option>{eyeletMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
          </div> : null}
        </div>
        {stepNavigation}
      </section> : null}

      {activeStep === "fulfilment" ? <section style={{ ...panel, background: "linear-gradient(180deg,#f0fdfa,#fff)" }}>
        <h3 style={{ margin: 0 }}>5. Choose fulfilment and review</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>This is the only step that saves. Everything before this point has stayed instant and local.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(170px,1fr))", gap: 10 }}>
          {[
            ["pickup", "Pickup", "Customer collects from your premises"],
            ["delivery", "Delivery", "Deliver the finished order"],
            ["install", "Install", "Include installation in the production flow"]
          ].map(([value, label, description]) => <button key={value} type="button" onClick={() => setFulfilment(value)} style={choiceCardStyle(deliveryMethod === value)}><strong>{label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{description}</span></button>)}
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 16, padding: 15, borderRadius: 14, background: "#fff", border: "1px solid #ccfbf1" }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase" }}>Product summary</div>
          <h3 style={{ margin: 0 }}>{selectedMaterial?.name ?? "No physical material"} · {width} × {height} mm · Qty {quantity}</h3>
          <div style={{ color: "#64748b", lineHeight: 1.55 }}><b>Print:</b> {printMethod.replace(/_/g, " ")} · <b>Laminate:</b> {selectedLaminate?.name ?? "None"} · <b>Finishing:</b> {finishingValues.length ? finishingValues.map((value) => presetByKey.get(value)?.name ?? value).join(", ") : "None"} · <b>Fulfilment:</b> {deliveryMethod}</div>
          {selectedPresetKeys.has("eyelets") ? <div style={{ color: "#9a3412" }}><b>Eyelets:</b> {eyeletPresets.find((preset) => preset.value === eyeletPreset)?.label ?? "4 corners"}{selectedEyeletMaterial ? ` · ${selectedEyeletMaterial.name}` : ""}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setActiveStep("finishing")} style={{ minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#334155", fontWeight: 900, padding: "0 15px", cursor: "pointer" }}>← Finishing</button>
          <div style={{ display: "grid", gap: 9, justifyItems: "end" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850, fontSize: 13, color: "#475569" }}><input type="checkbox" name="makeActive" defaultChecked={currentStatus === "draft" || currentStatus === "active"} /> Available for staff to quote</label>
            <SaveButton />
          </div>
        </div>
      </section> : null}

      <details style={{ ...panel, padding: 0, overflow: "hidden" }}>
        <summary style={{ cursor: "pointer", padding: 17, fontWeight: 950, color: "#475569" }}>Advanced sequence and uncommon production steps</summary>
        <div style={{ borderTop: "1px solid #e2e8f0", padding: 17, display: "grid", gap: 12 }}>
          <p style={{ margin: 0, color: "#64748b" }}>The normal order is created automatically. Open this only when the work needs a special sequence or a custom saved production step.</p>
          {steps.length ? <div style={{ display: "grid", gap: 8 }}>{steps.map((step, index) => <article key={`${step.processToken}-${index}`} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: 9, alignItems: "center", border: "1px solid #dbe4f0", borderRadius: 12, padding: 10, background: "#f8fafc" }}><span style={{ width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center", background: "#0f172a", color: "#fff", fontWeight: 950 }}>{index + 1}</span><strong>{step.name}</strong><div style={{ display: "flex", gap: 5 }}><button type="button" disabled={index === 0} onClick={() => moveStep(index, -1)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", width: 32, height: 32 }}>↑</button><button type="button" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", width: 32, height: 32 }}>↓</button><button type="button" onClick={() => removeStep(index)} style={{ border: "1px solid #fecaca", borderRadius: 8, background: "#fff", color: "#b91c1c", height: 32 }}>Remove</button></div></article>)}</div> : <div style={{ color: "#64748b" }}>No production actions selected.</div>}
          {otherProcesses.length ? <div><strong>Other saved steps</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 8 }}>{otherProcesses.map((process) => <button key={process.id} type="button" onClick={() => addOtherProcess(process)} style={{ border: "1px solid #cbd5e1", borderRadius: 999, background: "#fff", padding: "7px 10px", fontWeight: 850 }}>+ {process.name}</button>)}</div></div> : null}
        </div>
      </details>
    </form>

    <section style={{ ...panel, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#475569", textTransform: "uppercase" }}>Current saved price check</div>
          <h3 style={{ margin: "5px 0" }}>{previewWidth} × {previewHeight} mm · Qty {previewQuantity}</h3>
          <p style={{ margin: 0, color: "#64748b" }}>{dirty ? "Your new choices are ready locally. Save once on the final step to refresh the calculation." : "This is the internal cost and sell price used when quoting."}</p>
        </div>
        <Link href={`/products/${productId}?tab=pricing`} style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>Open full price check →</Link>
      </div>
      {preview ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9, marginTop: 15 }}>
        {[["Material", preview.materialCost], ["Machines", preview.machineCost], ["Ink", preview.inkCost], ["Labour", preview.labourCost], ["Total cost", preview.totalCost], ["Sell price", preview.sellPrice]].map(([label, value]) => <div key={String(label)} style={{ padding: 12, borderRadius: 12, background: "#fff", border: "1px solid #dbe4f0" }}><div style={{ fontSize: 12, color: "#64748b" }}>{label}</div><div style={{ marginTop: 5, fontSize: 18, fontWeight: 950 }}>{currency.format(Number(value))}</div></div>)}
      </div> : <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #dbe4f0", color: "#475569" }}>Save the product setup to calculate its cost and sell price.</div>}
    </section>
  </div>;
}
