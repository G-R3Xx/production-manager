"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { normalizeProductionFlowName, productionFlowPresets, type ProductionFlowPreset } from "@/lib/productionFlowPresets";
import { saveInternalProductSetupAction } from "./actions";

type MaterialOption = {
  id: string;
  name: string;
  customerFacingName: string | null;
  sku: string | null;
  notes: string | null;
  materialType: string;
  materialGroup: string | null;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  reversePrintable: boolean;
  usedForBacking: boolean;
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

type BaseMaterialMode = "fixed" | "option" | "none";

type BaseMaterialChoice = {
  materialId: string;
  label: string;
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
  initialBaseMaterialMode: BaseMaterialMode;
  initialBaseMaterialQuestionLabel: string;
  initialBaseMaterialChoices: BaseMaterialChoice[];
  initialSteps: FlowStep[];
  initialDeliveryMethod: string;
  initialPrintOptions: string[];
  initialDefaultPrintMethod: string;
  initialRollMediaId: string;
  initialVinylBackingMaterialIds: string[];
  initialDefaultVinylBackingMaterialId: string;
  initialInkOptions: string[];
  initialDefaultInk: string;
  initialArtworkOptions: string[];
  initialDefaultArtwork: string;
  initialArtworkCheckPrice: number;
  initialArtworkDesignPrice: number;
  initialDeliveryFee: number;
  initialLaminateMaterialIds: string[];
  initialDefaultLaminateMaterialId: string;
  initialFinishingOptions: string[];
  initialEyeletMaterialId: string;
  initialEyeletPreset: string;
  initialMountingHardwareEnabled: boolean;
  initialDefaultHoleQuantity: number;
  initialSilverStandoffMaterialId: string;
  initialBlackStandoffMaterialId: string;
  preview: PreviewSummary;
  previewWidth: number;
  previewHeight: number;
  previewQuantity: number;
  initialWastePercent: number;
};

type BuilderStep = "material" | "size" | "print" | "media_ink" | "laminate" | "finishing" | "artwork" | "fulfilment" | "review";

const builderSteps: Array<{ key: BuilderStep; number: number; label: string; hint: string }> = [
  { key: "material", number: 1, label: "Material", hint: "Main substrate" },
  { key: "size", number: 2, label: "Size", hint: "Quote defaults" },
  { key: "print", number: 3, label: "Print", hint: "Allowed methods" },
  { key: "media_ink", number: 4, label: "Media & ink", hint: "Roll stock and ink" },
  { key: "laminate", number: 5, label: "Laminate", hint: "Allowed laminates" },
  { key: "finishing", number: 6, label: "Finishing", hint: "Cut, mount, eyelets" },
  { key: "artwork", number: 7, label: "Artwork", hint: "Supplied or required" },
  { key: "fulfilment", number: 8, label: "Supply", hint: "Pickup, delivery, install" },
  { key: "review", number: 9, label: "Review", hint: "Save once" }
];

const eyeletPresets = [
  { value: "four_corners", label: "4 corners", qty: 4 },
  { value: "top_corners_only", label: "Top corners only", qty: 2 },
  { value: "centre_top_bottom", label: "Centre top + bottom", qty: 2 },
  { value: "pole_fixing", label: "2 top + 2 bottom for pole fixing", qty: 4 },
  { value: "__custom", label: "Ask for a custom quantity", qty: 0 }
];

const printChoices = [
  { value: "none", label: "No print", description: "Blank stock, cut vinyl or service-only work" },
  { value: "direct_print", label: "Direct print", description: "Print directly onto the main substrate" },
  { value: "roll_stock", label: "Roll print / applied media", description: "Print onto vinyl, banner, paper or another roll stock" }
];

const inkChoices = [
  { value: "none", label: "No ink", description: "Useful when No print is available" },
  { value: "cmyk", label: "CMYK", description: "Standard colour print" },
  { value: "white", label: "White", description: "White-only print" },
  { value: "cmyk_white", label: "CMYK + White", description: "Colour plus white ink" }
];

const artworkChoices = [
  { value: "client_supplied", label: "Print-ready artwork supplied", description: "Customer supplies usable artwork with no artwork charge" },
  { value: "artwork_check", label: "Artwork check / minor changes", description: "Add the fixed checking charge set below" },
  { value: "artwork_required", label: "Artwork or design required", description: "Add the fixed artwork or design charge set below" }
];

const finishingChoices = [
  { value: "trim_cut", label: "Trim / cut", description: "Straight trim, knife or digital cutting" },
  { value: "mount_apply", label: "Mount / apply", description: "Apply printed media to the substrate" },
  { value: "eyelets", label: "Eyelets", description: "Use the same placement selector as Quick Quote" },
  { value: "finishing", label: "Other finishing", description: "General finishing allowance" },
  { value: "pack", label: "Pack", description: "Packing before pickup or delivery" }
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function materialDescription(material: MaterialOption): string {
  if (material.rollWidthMm) return `${material.materialType} · ${material.rollWidthMm} mm roll`;
  if (material.widthMm && material.lengthMm) return `${material.materialType} · ${material.widthMm} × ${material.lengthMm} mm`;
  return [material.materialGroup, material.materialType].filter(Boolean).join(" · ") || "Material";
}

function customerMaterialName(material: MaterialOption | null | undefined): string {
  return String(material?.customerFacingName ?? "").trim() || String(material?.name ?? "").trim();
}

function isClearTransparentBaseMaterial(material: MaterialOption | null | undefined): boolean {
  if (!material) return false;
  const text = `${material.name} ${material.customerFacingName ?? ""} ${material.sku ?? ""} ${material.notes ?? ""}`.toLowerCase();
  return /\b(clear|transparent)\b/.test(text);
}

type AutoMaterialGroup = {
  key: string;
  label: string;
  materials: MaterialOption[];
  representative: MaterialOption;
};

function autoMaterialGroupKey(material: MaterialOption): string {
  return `${String(material.materialType ?? "").trim().toLowerCase()}::${customerMaterialName(material).trim().toLowerCase()}`;
}

function autoMaterialGroups(materials: MaterialOption[], preferredId = ""): AutoMaterialGroup[] {
  const grouped = new Map<string, MaterialOption[]>();
  for (const material of materials) {
    const key = autoMaterialGroupKey(material);
    const current = grouped.get(key) ?? [];
    current.push(material);
    grouped.set(key, current);
  }
  return Array.from(grouped.entries()).map(([key, groupMaterials]) => {
    const sorted = [...groupMaterials].sort((left, right) => {
      const leftRollWidth = Number(left.rollWidthMm || 0);
      const rightRollWidth = Number(right.rollWidthMm || 0);
      if (leftRollWidth !== rightRollWidth) return leftRollWidth - rightRollWidth;
      const leftSheetArea = Number(left.widthMm || 0) * Number(left.lengthMm || 0);
      const rightSheetArea = Number(right.widthMm || 0) * Number(right.lengthMm || 0);
      if (leftSheetArea !== rightSheetArea) return leftSheetArea - rightSheetArea;
      return left.name.localeCompare(right.name);
    });
    const representative = sorted.find((material) => material.id === preferredId) ?? sorted[0];
    return { key, label: customerMaterialName(representative), materials: sorted, representative };
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function autoMaterialIdsFor(material: MaterialOption | null | undefined, pool: MaterialOption[]): string[] {
  if (!material) return [];
  const key = autoMaterialGroupKey(material);
  return pool.filter((candidate) => autoMaterialGroupKey(candidate) === key).map((candidate) => candidate.id);
}

function autoMaterialGroupIsReversePrintable(material: MaterialOption | null | undefined, pool: MaterialOption[]): boolean {
  if (!material) return false;
  const ids = new Set(autoMaterialIdsFor(material, pool));
  const candidates = pool.filter((candidate) => ids.has(candidate.id));
  return candidates.length > 0 && candidates.every((candidate) => candidate.reversePrintable === true);
}

function autoGroupDescription(group: AutoMaterialGroup): string {
  const widths = group.materials
    .map((material) => Number(material.rollWidthMm || 0))
    .filter((width) => width > 0)
    .sort((left, right) => left - right);
  if (widths.length > 1) return `Auto-selects ${widths.join(" / ")} mm roll stock by finished size, yield and cost`;
  if (widths.length === 1) return `${widths[0]} mm roll`;

  const sheetSizes = group.materials
    .map((material) => ({ width: Number(material.widthMm || 0), length: Number(material.lengthMm || 0) }))
    .filter((size) => size.width > 0 && size.length > 0)
    .map((size) => `${size.width}×${size.length}`);
  if (sheetSizes.length > 1) return `Auto-selects ${sheetSizes.join(" / ")} mm parent sheets by fit, nesting and cost`;
  if (sheetSizes.length === 1) return `${sheetSizes[0]} mm parent sheet`;
  return group.materials.length > 1 ? `Auto-selects from ${group.materials.length} linked stock items` : materialDescription(group.representative);
}

function materialSearchText(material: MaterialOption): string {
  return `${material.name} ${material.customerFacingName ?? ""} ${material.sku ?? ""} ${material.notes ?? ""} ${material.materialType} ${material.materialGroup ?? ""}`.toLowerCase();
}

function isLaminateMaterial(material: MaterialOption): boolean {
  const text = materialSearchText(material);
  return ["roll_laminate", "roll laminate", "cello_stock", "cello stock"].includes(material.materialType.toLowerCase()) || /\blaminat|overlam|cello\b/.test(text);
}

function isEyeletMaterial(material: MaterialOption): boolean {
  return /\beyelet|grommet\b/.test(materialSearchText(material));
}

function isStandoffMaterial(material: MaterialOption): boolean {
  return /\b(standoffs?|stand[- ]?offs?|sign mounts?|mounting spacers?)\b/.test(materialSearchText(material));
}

function isRollPrintMaterial(material: MaterialOption): boolean {
  if (isLaminateMaterial(material) || isEyeletMaterial(material) || isStandoffMaterial(material)) return false;
  const text = materialSearchText(material);
  return Boolean(material.rollWidthMm) || /\broll\b|\bvinyl\b|\bsav\b|\bbanner\b|\bwallpaper\b/.test(text);
}

function isMainMaterial(material: MaterialOption): boolean {
  if (isLaminateMaterial(material) || isEyeletMaterial(material) || isStandoffMaterial(material)) return false;
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
  return <button disabled={pending} style={{ minHeight: 50, border: 0, borderRadius: 12, background: pending ? "#94a3b8" : "#2563eb", color: "#fff", fontWeight: 950, padding: "0 22px", cursor: pending ? "wait" : "pointer" }}>{pending ? "Saving product…" : "Save guided product"}</button>;
}

export function ProductProductionFlowBuilder({
  productId,
  department,
  currentStatus,
  materials,
  processes,
  initialMaterialId,
  initialBaseMaterialMode,
  initialBaseMaterialQuestionLabel,
  initialBaseMaterialChoices,
  initialSteps,
  initialDeliveryMethod,
  initialPrintOptions,
  initialDefaultPrintMethod,
  initialRollMediaId,
  initialVinylBackingMaterialIds,
  initialDefaultVinylBackingMaterialId,
  initialInkOptions,
  initialDefaultInk,
  initialArtworkOptions,
  initialDefaultArtwork,
  initialArtworkCheckPrice,
  initialArtworkDesignPrice,
  initialDeliveryFee,
  initialLaminateMaterialIds,
  initialDefaultLaminateMaterialId,
  initialFinishingOptions,
  initialEyeletMaterialId,
  initialEyeletPreset,
  initialMountingHardwareEnabled,
  initialDefaultHoleQuantity,
  initialSilverStandoffMaterialId,
  initialBlackStandoffMaterialId,
  preview,
  previewWidth,
  previewHeight,
  previewQuantity,
  initialWastePercent
}: Props) {
  const startingPrintOptions = unique([...(initialPrintOptions.length ? initialPrintOptions : []), initialDefaultPrintMethod || "none"]);
  const startingInkOptions = unique([...(initialInkOptions.length ? initialInkOptions : []), initialDefaultInk || "cmyk"]);
  const startingArtworkOptions = unique([...(initialArtworkOptions.length ? initialArtworkOptions : ["client_supplied", "artwork_required"]), initialDefaultArtwork || "client_supplied"]);
  const [activeStep, setActiveStep] = useState<BuilderStep>("material");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialId, setMaterialId] = useState(initialMaterialId);
  const [baseMaterialMode, setBaseMaterialMode] = useState<BaseMaterialMode>(initialBaseMaterialMode);
  const [baseMaterialQuestionLabel, setBaseMaterialQuestionLabel] = useState(initialBaseMaterialQuestionLabel || "Material / thickness");
  const [baseMaterialChoices, setBaseMaterialChoices] = useState<BaseMaterialChoice[]>(initialBaseMaterialChoices);
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps);
  const [width, setWidth] = useState(previewWidth);
  const [height, setHeight] = useState(previewHeight);
  const [quantity, setQuantity] = useState(previewQuantity);
  const [printOptions, setPrintOptions] = useState<string[]>(startingPrintOptions);
  const [defaultPrintMethod, setDefaultPrintMethodState] = useState(initialDefaultPrintMethod || startingPrintOptions[0] || "none");
  const [rollMediaId, setRollMediaId] = useState(initialRollMediaId);
  const [vinylBackingMaterialIds, setVinylBackingMaterialIds] = useState<string[]>(unique(initialVinylBackingMaterialIds));
  const [defaultVinylBackingMaterialId, setDefaultVinylBackingMaterialId] = useState(initialDefaultVinylBackingMaterialId || "none");
  const [inkOptions, setInkOptions] = useState<string[]>(startingInkOptions);
  const [defaultInk, setDefaultInk] = useState(initialDefaultInk || startingInkOptions[0] || "cmyk");
  const [artworkOptions, setArtworkOptions] = useState<string[]>(startingArtworkOptions);
  const [defaultArtwork, setDefaultArtwork] = useState(initialDefaultArtwork || startingArtworkOptions[0] || "client_supplied");
  const [artworkCheckPrice, setArtworkCheckPrice] = useState(Math.max(0, initialArtworkCheckPrice || 0));
  const [artworkDesignPrice, setArtworkDesignPrice] = useState(Math.max(0, initialArtworkDesignPrice || 0));
  const [deliveryFee, setDeliveryFee] = useState(Math.max(0, initialDeliveryFee || 0));
  const [laminateMaterialIds, setLaminateMaterialIds] = useState<string[]>(unique(initialLaminateMaterialIds));
  const [defaultLaminateMaterialId, setDefaultLaminateMaterialIdState] = useState(initialDefaultLaminateMaterialId || "none");
  const [finishingValues, setFinishingValues] = useState<string[]>(unique(initialFinishingOptions));
  const [deliveryMethod, setDeliveryMethod] = useState(initialDeliveryMethod || "pickup");
  const [eyeletMaterialId, setEyeletMaterialId] = useState(initialEyeletMaterialId);
  const [eyeletPreset, setEyeletPreset] = useState(initialEyeletPreset || "four_corners");
  const [mountingHardwareEnabled, setMountingHardwareEnabled] = useState(initialMountingHardwareEnabled);
  const [defaultHoleQuantity, setDefaultHoleQuantity] = useState(Math.max(0, Math.round(initialDefaultHoleQuantity || 0)));
  const [silverStandoffMaterialId, setSilverStandoffMaterialId] = useState(initialSilverStandoffMaterialId);
  const [blackStandoffMaterialId, setBlackStandoffMaterialId] = useState(initialBlackStandoffMaterialId);
  const [dirty, setDirty] = useState(false);

  const selectedPresetKeys = useMemo(() => new Set(steps.map(presetKeyForStep).filter(Boolean)), [steps]);
  const selectedTokens = useMemo(() => new Set(steps.map((step) => step.processToken)), [steps]);
  const selectedMaterial = materials.find((material) => material.id === materialId);
  const selectedMainMaterialIsRoll = Boolean(selectedMaterial && isRollPrintMaterial(selectedMaterial));
  const selectedRollMedia = materials.find((material) => material.id === rollMediaId);
  const selectedDefaultVinylBacking = materials.find((material) => material.id === defaultVinylBackingMaterialId);
  const selectedDefaultLaminate = materials.find((material) => material.id === defaultLaminateMaterialId);
  const selectedEyeletMaterial = materials.find((material) => material.id === eyeletMaterialId);
  const selectedSilverStandoffMaterial = materials.find((material) => material.id === silverStandoffMaterialId);
  const selectedBlackStandoffMaterial = materials.find((material) => material.id === blackStandoffMaterialId);

  const allMainMaterials = useMemo(() => materials.filter((material) => isMainMaterial(material) || material.id === materialId), [materials, materialId]);
  const mainMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    return (query ? allMainMaterials.filter((material) => materialSearchText(material).includes(query)) : allMainMaterials).slice(0, 80);
  }, [allMainMaterials, materialSearch]);
  const mainMaterialGroups = useMemo(() => autoMaterialGroups(mainMaterials, materialId), [mainMaterials, materialId]);
  const rollMediaMaterials = useMemo(() => materials.filter(isRollPrintMaterial), [materials]);
  const vinylBackingMaterials = useMemo(() => materials.filter((material) => isRollPrintMaterial(material) && (material.usedForBacking === true || vinylBackingMaterialIds.includes(material.id) || material.id === defaultVinylBackingMaterialId)), [materials, vinylBackingMaterialIds, defaultVinylBackingMaterialId]);
  const laminateMaterials = useMemo(() => materials.filter(isLaminateMaterial), [materials]);
  const rollMediaGroups = useMemo(() => autoMaterialGroups(rollMediaMaterials, rollMediaId), [rollMediaMaterials, rollMediaId]);
  const vinylBackingGroups = useMemo(() => autoMaterialGroups(vinylBackingMaterials, defaultVinylBackingMaterialId), [vinylBackingMaterials, defaultVinylBackingMaterialId]);
  const laminateGroups = useMemo(() => autoMaterialGroups(laminateMaterials, defaultLaminateMaterialId), [laminateMaterials, defaultLaminateMaterialId]);
  const eyeletMaterials = useMemo(() => materials.filter(isEyeletMaterial), [materials]);
  const standoffMaterials = useMemo(() => materials.filter(isStandoffMaterial), [materials]);
  const otherProcesses = processes.filter((process) => !selectedTokens.has(process.id) && !productionFlowPresets.some((preset) => normalizeProductionFlowName(preset.name) === normalizeProductionFlowName(process.name)));

  const markChanged = () => setDirty(true);

  const setMaterialMode = (mode: BaseMaterialMode) => {
    setBaseMaterialMode(mode);
    if (mode === "none") {
      setMaterialId("");
    } else if (mode === "option") {
      const seededChoices = baseMaterialChoices.length
        ? baseMaterialChoices
        : materialId
          ? [{ materialId, label: customerMaterialName(materials.find((material) => material.id === materialId)) || "Material" }]
          : [];
      if (!baseMaterialChoices.length && seededChoices.length) setBaseMaterialChoices(seededChoices);
      if (!seededChoices.some((choice) => choice.materialId === materialId)) setMaterialId(seededChoices[0]?.materialId ?? "");
    } else if (!materialId && baseMaterialChoices.length) {
      setMaterialId(baseMaterialChoices[0].materialId);
    }
    markChanged();
  };

  const chooseFixedMaterialGroup = (group: AutoMaterialGroup) => {
    setBaseMaterialMode("fixed");
    setMaterialId(group.representative.id);
    markChanged();
  };

  const toggleBaseMaterialGroup = (group: AutoMaterialGroup) => {
    const groupIds = new Set(group.materials.map((material) => material.id));
    const selected = baseMaterialChoices.some((choice) => groupIds.has(choice.materialId));
    const withoutGroup = baseMaterialChoices.filter((choice) => !groupIds.has(choice.materialId));
    const next = selected
      ? withoutGroup
      : [...withoutGroup, { materialId: group.representative.id, label: customerMaterialName(group.representative) }];
    setBaseMaterialChoices(next);
    if (!selected && !materialId) setMaterialId(group.representative.id);
    if (selected && groupIds.has(materialId)) setMaterialId(next[0]?.materialId ?? "");
    markChanged();
  };

  const updateBaseMaterialChoiceLabel = (materialIdValue: string, label: string) => {
    setBaseMaterialChoices((current) => current.map((choice) => choice.materialId === materialIdValue ? { ...choice, label } : choice));
    markChanged();
  };

  const setPreset = (key: string, selected: boolean) => {
    const nextStep = stepFromPreset(key, processes);
    if (!nextStep) return;
    setSteps((current) => {
      const withoutPreset = current.filter((step) => presetKeyForStep(step) !== key);
      return selected ? insertPresetInNormalOrder(withoutPreset, nextStep) : withoutPreset;
    });
    markChanged();
  };

  const syncDefaultPrintStep = (value: string) => {
    const presetKey = value === "roll_stock" ? "roll_print" : value;
    const nextStep = presetKey === "none" ? null : stepFromPreset(presetKey, processes);
    setSteps((current) => {
      const withoutPrint = current.filter((step) => !["direct_print", "roll_print"].includes(presetKeyForStep(step) ?? ""));
      return nextStep ? insertPresetInNormalOrder(withoutPrint, nextStep) : withoutPrint;
    });
  };

  const setDefaultPrintMethod = (value: string) => {
    setDefaultPrintMethodState(value);
    if (!printOptions.includes(value)) setPrintOptions((current) => unique([...current, value]));
    syncDefaultPrintStep(value);
    markChanged();
  };

  const togglePrintOption = (value: string) => {
    setPrintOptions((current) => {
      const selected = current.includes(value);
      const next = selected ? current.filter((item) => item !== value) : unique([...current, value]);
      if (selected && defaultPrintMethod === value) {
        const fallback = next[0] || "none";
        setDefaultPrintMethodState(fallback);
        syncDefaultPrintStep(fallback);
      }
      return next.length ? next : ["none"];
    });
    markChanged();
  };

  const toggleInkOption = (value: string) => {
    setInkOptions((current) => {
      const selected = current.includes(value);
      const next = selected ? current.filter((item) => item !== value) : unique([...current, value]);
      if (selected && defaultInk === value) setDefaultInk(next[0] || "cmyk");
      return next.length ? next : ["cmyk"];
    });
    markChanged();
  };

  const setDefaultInkChoice = (value: string) => {
    setDefaultInk(value);
    if (!inkOptions.includes(value)) setInkOptions((current) => unique([...current, value]));
    markChanged();
  };

  const toggleArtworkOption = (value: string) => {
    setArtworkOptions((current) => {
      const selected = current.includes(value);
      const next = selected ? current.filter((item) => item !== value) : unique([...current, value]);
      const safeNext = next.length ? next : ["client_supplied"];
      if (selected && defaultArtwork === value) setDefaultArtwork(safeNext[0]);
      return safeNext;
    });
    markChanged();
  };

  const setDefaultArtworkChoice = (value: string) => {
    setDefaultArtwork(value);
    if (!artworkOptions.includes(value)) setArtworkOptions((current) => unique([...current, value]));
    markChanged();
  };

  const toggleVinylBackingGroup = (group: AutoMaterialGroup) => {
    const groupIds = new Set(group.materials.map((material) => material.id));
    const selected = vinylBackingMaterialIds.some((materialIdValue) => groupIds.has(materialIdValue));
    setVinylBackingMaterialIds((current) => selected
      ? current.filter((item) => !groupIds.has(item))
      : unique([...current, ...Array.from(groupIds)]));
    if (selected && groupIds.has(defaultVinylBackingMaterialId)) setDefaultVinylBackingMaterialId("none");
    markChanged();
  };

  const setDefaultVinylBackingGroup = (group: AutoMaterialGroup) => {
    const groupIds = group.materials.map((material) => material.id);
    setDefaultVinylBackingMaterialId(group.representative.id);
    setVinylBackingMaterialIds((current) => unique([...current, ...groupIds]));
    markChanged();
  };

  const setDefaultVinylBacking = (value: string) => {
    if (value === "none") {
      setDefaultVinylBackingMaterialId("none");
      markChanged();
      return;
    }
    const group = vinylBackingGroups.find((item) => item.materials.some((material) => material.id === value));
    if (group) setDefaultVinylBackingGroup(group);
  };

  const toggleLaminateGroup = (group: AutoMaterialGroup) => {
    const groupIds = new Set(group.materials.map((material) => material.id));
    const selected = laminateMaterialIds.some((materialIdValue) => groupIds.has(materialIdValue));
    setLaminateMaterialIds((current) => selected
      ? current.filter((item) => !groupIds.has(item))
      : unique([...current, ...Array.from(groupIds)]));
    if (selected && groupIds.has(defaultLaminateMaterialId)) {
      setDefaultLaminateMaterialIdState("none");
      if (selectedPresetKeys.has("laminate")) setPreset("laminate", false);
    }
    markChanged();
  };

  const setDefaultLaminateGroup = (group: AutoMaterialGroup) => {
    const groupIds = group.materials.map((material) => material.id);
    setDefaultLaminateMaterialIdState(group.representative.id);
    setLaminateMaterialIds((current) => unique([...current, ...groupIds]));
    if (!selectedPresetKeys.has("laminate")) setPreset("laminate", true);
    markChanged();
  };

  const setDefaultLaminate = (value: string) => {
    if (value === "none") {
      setDefaultLaminateMaterialIdState("none");
      if (selectedPresetKeys.has("laminate")) setPreset("laminate", false);
      markChanged();
      return;
    }
    const group = laminateGroups.find((item) => item.materials.some((material) => material.id === value));
    if (group) setDefaultLaminateGroup(group);
  };

  const toggleFinishing = (value: string) => {
    const selected = finishingValues.includes(value);
    setFinishingValues(selected
      ? finishingValues.filter((item) => item !== value)
      : unique([...finishingValues, value]));
    setPreset(value, !selected);
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
  const currentIndex = builderSteps.findIndex((step) => step.key === activeStep);
  const previousStep = currentIndex > 0 ? builderSteps[currentIndex - 1] : null;
  const nextStep = currentIndex < builderSteps.length - 1 ? builderSteps[currentIndex + 1] : null;
  const effectiveVinylBackingIds = unique(vinylBackingGroups
    .filter((group) => group.materials.some((material) => vinylBackingMaterialIds.includes(material.id)))
    .flatMap((group) => group.materials.map((material) => material.id)));
  const effectiveLaminateIds = unique(laminateGroups
    .filter((group) => group.materials.some((material) => laminateMaterialIds.includes(material.id)))
    .flatMap((group) => group.materials.map((material) => material.id)));
  const vinylBackingNames = effectiveVinylBackingIds.map((id) => customerMaterialName(materials.find((material) => material.id === id)) || id);
  const laminateNames = effectiveLaminateIds.map((id) => customerMaterialName(materials.find((material) => material.id === id)) || id);
  const mainMaterialAutoIds = autoMaterialIdsFor(selectedMaterial, allMainMaterials);
  const rollMediaAutoIds = autoMaterialIdsFor(selectedRollMedia, rollMediaMaterials);
  const seenBaseMaterialGroups = new Set<string>();
  const baseMaterialChoicePayload = baseMaterialChoices.flatMap((choice) => {
    const material = materials.find((item) => item.id === choice.materialId);
    const groupKey = material ? autoMaterialGroupKey(material) : choice.materialId;
    if (seenBaseMaterialGroups.has(groupKey)) return [];
    seenBaseMaterialGroups.add(groupKey);
    const currentLabel = choice.label.trim();
    const customerName = customerMaterialName(material);
    const clientLabel = !currentLabel || currentLabel === String(material?.name ?? "").trim() ? customerName : currentLabel;
    return [{
      materialId: choice.materialId,
      label: clientLabel || "Material",
      materialName: material?.name ?? choice.label,
      isRoll: Boolean(material && isRollPrintMaterial(material)),
      isTransparent: isClearTransparentBaseMaterial(material),
      isReversePrintable: Boolean(material && isRollPrintMaterial(material) && autoMaterialGroupIsReversePrintable(material, allMainMaterials)),
      autoMaterialIds: material ? autoMaterialIdsFor(material, allMainMaterials) : [choice.materialId]
    }];
  });
  const clearBaseMaterialLabels = baseMaterialMode === "option"
    ? baseMaterialChoicePayload.filter((choice) => choice.isTransparent).map((choice) => choice.label)
    : isClearTransparentBaseMaterial(selectedMaterial) ? [customerMaterialName(selectedMaterial)] : [];
  const reversePrintableBaseLabels = baseMaterialMode === "option"
    ? baseMaterialChoicePayload.filter((choice) => choice.isRoll && choice.isReversePrintable).map((choice) => choice.label)
    : selectedMainMaterialIsRoll && autoMaterialGroupIsReversePrintable(selectedMaterial, allMainMaterials) ? [customerMaterialName(selectedMaterial)] : [];
  const selectedRollMediaReversePrintable = Boolean(selectedRollMedia && autoMaterialGroupIsReversePrintable(selectedRollMedia, rollMediaMaterials));
  const reversePrintableApplicable = reversePrintableBaseLabels.length > 0 || (printOptions.includes("roll_stock") && selectedRollMediaReversePrintable);
  const vinylBackingApplicable = clearBaseMaterialLabels.length > 0 || reversePrintableApplicable;

  const stepNavigation = <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 18 }}>
    {previousStep ? <button type="button" onClick={() => setActiveStep(previousStep.key)} style={{ minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#334155", fontWeight: 900, padding: "0 15px", cursor: "pointer" }}>← {previousStep.label}</button> : <span />}
    {nextStep ? <button type="button" onClick={() => setActiveStep(nextStep.key)} style={{ minHeight: 44, border: 0, borderRadius: 11, background: "#0f172a", color: "#fff", fontWeight: 900, padding: "0 17px", cursor: "pointer" }}>Next: {nextStep.label} →</button> : null}
  </div>;

  return <div style={{ display: "grid", gap: 16 }}>
    <section style={{ ...panel, background: "linear-gradient(180deg,#eff6ff,#fff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: ".08em" }}>Default product builder</div>
          <h2 style={{ margin: "6px 0" }}>Guided product builder</h2>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.55, maxWidth: 900 }}>Choose the substrate, available quote options and the answers staff should see first. Every tab is already loaded, so moving between Material, Print, Ink, Laminate, Finishing and Artwork is instant. Save once from Review. This builder is using the <b>{department.replace(/_/g, " ")}</b> workflow.</p>
        </div>
        <Link href={`/products/advanced?selected=${productId}`} style={{ textDecoration: "none", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 11, padding: "9px 12px", fontWeight: 900 }}>Advanced raw setup</Link>
      </div>
    </section>

    <nav style={{ display: "grid", gridTemplateColumns: "repeat(9,minmax(110px,1fr))", gap: 7, padding: 8, borderRadius: 17, background: "#e9eef6", overflowX: "auto" }}>
      {builderSteps.map((step) => {
        const active = step.key === activeStep;
        const complete = builderSteps.findIndex((item) => item.key === step.key) < currentIndex;
        return <button key={step.key} type="button" onClick={() => setActiveStep(step.key)} style={{ minWidth: 110, border: active ? "1px solid #bfdbfe" : "1px solid transparent", borderRadius: 12, background: active ? "#fff" : "transparent", boxShadow: active ? "0 5px 16px rgba(15,23,42,.08)" : "none", padding: "10px 8px", textAlign: "left", cursor: "pointer", color: active ? "#0f172a" : "#64748b" }}><span style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 25, height: 25, borderRadius: 999, display: "grid", placeItems: "center", background: active ? "#2563eb" : complete ? "#16a34a" : "#cbd5e1", color: "#fff", fontSize: 12, fontWeight: 950 }}>{complete ? "✓" : step.number}</span><span><strong style={{ display: "block", fontSize: 13 }}>{step.label}</strong><span style={{ fontSize: 10 }}>{step.hint}</span></span></span></button>;
      })}
    </nav>

    <form action={saveInternalProductSetupAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="baseMaterialMode" value={baseMaterialMode} />
      <input type="hidden" name="baseMaterialQuestionLabel" value={baseMaterialQuestionLabel} />
      <input type="hidden" name="baseMaterialChoicesJson" value={JSON.stringify(baseMaterialChoicePayload)} />
      <input type="hidden" name="materialId" value={materialId} />
      <input type="hidden" name="mainMaterialName" value={selectedMaterial?.name ?? ""} />
      <input type="hidden" name="mainMaterialIsRoll" value={selectedMainMaterialIsRoll ? "1" : "0"} />
      <input type="hidden" name="mainMaterialIsTransparent" value={isClearTransparentBaseMaterial(selectedMaterial) ? "1" : "0"} />
      <input type="hidden" name="mainMaterialIsReversePrintable" value={selectedMainMaterialIsRoll && autoMaterialGroupIsReversePrintable(selectedMaterial, allMainMaterials) ? "1" : "0"} />
      <input type="hidden" name="mainMaterialAutoIdsCsv" value={mainMaterialAutoIds.join(",")} />
      <input type="hidden" name="width" value={width} />
      <input type="hidden" name="height" value={height} />
      <input type="hidden" name="quantity" value={quantity} />
      <input type="hidden" name="recipeWastePercent" value={initialWastePercent} />
      <input type="hidden" name="flowJson" value={flowJson} />
      <input type="hidden" name="deliveryMethod" value={deliveryMethod} />
      <input type="hidden" name="printMethod" value={defaultPrintMethod} />
      <input type="hidden" name="printMethodsCsv" value={printOptions.join(",")} />
      <input type="hidden" name="rollMediaId" value={rollMediaId} />
      <input type="hidden" name="rollMediaName" value={selectedRollMedia?.name ?? ""} />
      <input type="hidden" name="rollMediaAutoIdsCsv" value={rollMediaAutoIds.join(",")} />
      <input type="hidden" name="rollMediaIsReversePrintable" value={selectedRollMediaReversePrintable ? "1" : "0"} />
      <input type="hidden" name="vinylBackingMaterialIdsCsv" value={effectiveVinylBackingIds.join(",")} />
      <input type="hidden" name="vinylBackingMaterialNamesJson" value={JSON.stringify(vinylBackingNames)} />
      <input type="hidden" name="defaultVinylBackingMaterialId" value={defaultVinylBackingMaterialId === "none" ? "" : defaultVinylBackingMaterialId} />
      <input type="hidden" name="defaultVinylBackingMaterialName" value={customerMaterialName(selectedDefaultVinylBacking)} />
      <input type="hidden" name="inkChoicesCsv" value={inkOptions.join(",")} />
      <input type="hidden" name="defaultInk" value={defaultInk} />
      <input type="hidden" name="artworkOptionsCsv" value={artworkOptions.join(",")} />
      <input type="hidden" name="defaultArtwork" value={defaultArtwork} />
      <input type="hidden" name="artworkCheckPrice" value={artworkCheckPrice} />
      <input type="hidden" name="artworkDesignPrice" value={artworkDesignPrice} />
      <input type="hidden" name="deliveryFee" value={deliveryFee} />
      <input type="hidden" name="finishingsCsv" value={finishingValues.join(",")} />
      <input type="hidden" name="laminateMaterialIdsCsv" value={effectiveLaminateIds.join(",")} />
      <input type="hidden" name="laminateMaterialNamesJson" value={JSON.stringify(laminateNames)} />
      <input type="hidden" name="laminateMaterialId" value={defaultLaminateMaterialId === "none" ? "" : defaultLaminateMaterialId} />
      <input type="hidden" name="laminateMaterialName" value={customerMaterialName(selectedDefaultLaminate)} />
      <input type="hidden" name="eyeletMaterialId" value={eyeletMaterialId} />
      <input type="hidden" name="eyeletMaterialName" value={selectedEyeletMaterial?.name ?? "Eyelets"} />
      <input type="hidden" name="eyeletPreset" value={eyeletPreset} />
      <input type="hidden" name="mountingHardwareEnabled" value={mountingHardwareEnabled ? "1" : "0"} />
      <input type="hidden" name="defaultHoleQuantity" value={defaultHoleQuantity} />
      <input type="hidden" name="silverStandoffMaterialId" value={silverStandoffMaterialId} />
      <input type="hidden" name="silverStandoffMaterialName" value={selectedSilverStandoffMaterial?.name ?? "Silver standoff"} />
      <input type="hidden" name="blackStandoffMaterialId" value={blackStandoffMaterialId} />
      <input type="hidden" name="blackStandoffMaterialName" value={selectedBlackStandoffMaterial?.name ?? "Black standoff"} />

      {activeStep === "material" ? <section style={panel}>
        <div><h3 style={{ margin: 0 }}>1. Choose how the base material is selected</h3><p style={{ margin: "5px 0 0", color: "#64748b" }}>Use one fixed stock item, let the quote or website choice select the stock, or create a service-only product.</p></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(190px,1fr))", gap: 10, marginTop: 15 }}>
          <button type="button" onClick={() => setMaterialMode("fixed")} style={choiceCardStyle(baseMaterialMode === "fixed")}><strong>One fixed material</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>Every quote uses the same substrate or roll stock.</span></button>
          <button type="button" onClick={() => setMaterialMode("option")} style={choiceCardStyle(baseMaterialMode === "option")}><strong>Selected by customer option</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>One product can choose 3 mm, 4.5 mm, 6 mm or other stocked materials.</span></button>
          <button type="button" onClick={() => setMaterialMode("none")} style={choiceCardStyle(baseMaterialMode === "none")}><strong>No physical material</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>Customer-supplied signage, installation-only or service work.</span></button>
        </div>

        {baseMaterialMode !== "none" ? <div style={{ marginTop: 17, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div><strong>{baseMaterialMode === "option" ? "Choose every available base material" : "Choose the fixed base material"}</strong><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{baseMaterialMode === "option" ? "Tick the real inventory items. Choose one as the normal default." : "This material is always used for costing and stock."}</p></div>
            <input value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="Search substrates or roll stock" style={{ ...input, maxWidth: 320 }} />
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: 13, lineHeight: 1.5 }}><b>Automatic stock sizes:</b> materials with the same Customer-facing name are shown as one choice. For roll or sheet size variants, Production Manager automatically chooses the lowest-cost stock that fits the finished size and quantity.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
            {mainMaterialGroups.map((group) => {
              const groupIds = new Set(group.materials.map((material) => material.id));
              const selected = baseMaterialMode === "option"
                ? baseMaterialChoices.some((choice) => groupIds.has(choice.materialId))
                : groupIds.has(materialId);
              const defaultSelected = groupIds.has(materialId);
              return <article key={group.key} style={{ ...choiceCardStyle(selected), cursor: "default", display: "grid", gap: 8 }}>
                <button type="button" onClick={() => baseMaterialMode === "option" ? toggleBaseMaterialGroup(group) : chooseFixedMaterialGroup(group)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}><strong>{selected ? "✓ " : "+ "}{group.label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 5 }}>{autoGroupDescription(group)}</span><span style={{ display: "block", color: "#94a3b8", fontSize: 11, marginTop: 4 }}>{group.materials.length > 1 ? `${group.materials.length} interchangeable stock sizes` : group.representative.name}</span></button>
                {baseMaterialMode === "option" && selected ? <button type="button" onClick={() => { setMaterialId(group.representative.id); markChanged(); }} style={{ minHeight: 34, border: defaultSelected ? "1px solid #2563eb" : "1px solid #cbd5e1", borderRadius: 9, background: defaultSelected ? "#2563eb" : "#fff", color: defaultSelected ? "#fff" : "#334155", fontWeight: 900, cursor: "pointer" }}>{defaultSelected ? "Default answer" : "Make default"}</button> : null}
              </article>;
            })}
          </div>
          {!mainMaterialGroups.length && materialSearch ? <div style={{ padding: 13, borderRadius: 12, background: "#fff7ed", color: "#9a3412" }}>No materials match “{materialSearch}”.</div> : null}
        </div> : null}

        {baseMaterialMode === "option" ? <div style={{ display: "grid", gap: 11, marginTop: 17, padding: 15, borderRadius: 15, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Customer question<span style={{ fontSize: 12, color: "#64748b", fontWeight: 650 }}>For Acrylic, use “Acrylic thickness” or “Acrylic colour and thickness”.</span><input value={baseMaterialQuestionLabel} onChange={(event) => { setBaseMaterialQuestionLabel(event.target.value); markChanged(); }} style={input} /></label>
          {baseMaterialChoices.length ? <div style={{ display: "grid", gap: 8 }}>
            <strong>Customer choice labels</strong>
            {baseMaterialChoices.map((choice) => {
              const material = materials.find((item) => item.id === choice.materialId);
              return <div key={choice.materialId} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) minmax(180px,1fr)", gap: 9, alignItems: "center" }}><span style={{ color: "#475569", fontWeight: 800 }}>{material?.name ?? choice.materialId}</span><input value={choice.label} onChange={(event) => updateBaseMaterialChoiceLabel(choice.materialId, event.target.value)} placeholder="Label shown to customer" style={input} /></div>;
            })}
          </div> : <div style={{ color: "#9a3412", fontWeight: 800 }}>Select at least one material above.</div>}
        </div> : null}
        {stepNavigation}
      </section> : null}

      {activeStep === "size" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>2. Set the normal size and quantity</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>These are only defaults. Staff can change them on every quote.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(150px,1fr))", gap: 11 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Finished width mm<input type="number" min="1" value={width} onChange={(event: ChangeEvent<HTMLInputElement>) => { setWidth(Math.max(1, Number(event.target.value) || 1)); markChanged(); }} style={input} /></label>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Finished height mm<input type="number" min="1" value={height} onChange={(event: ChangeEvent<HTMLInputElement>) => { setHeight(Math.max(1, Number(event.target.value) || 1)); markChanged(); }} style={input} /></label>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Default quantity<input type="number" min="1" value={quantity} onChange={(event: ChangeEvent<HTMLInputElement>) => { setQuantity(Math.max(1, Math.round(Number(event.target.value) || 1))); markChanged(); }} style={input} /></label>
        </div>
        <div style={{ marginTop: 14, padding: 13, borderRadius: 13, background: "#f8fafc", border: "1px solid #e2e8f0" }}><strong>Quote starts at:</strong> {width} × {height} mm · Qty {quantity}</div>
        {stepNavigation}
      </section> : null}

      {activeStep === "print" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>3. Choose available print methods</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Tick every method staff may use, then mark the answer that should appear first.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(190px,1fr))", gap: 10 }}>
          {printChoices.map((choice) => {
            const available = printOptions.includes(choice.value);
            const isDefault = defaultPrintMethod === choice.value;
            return <article key={choice.value} style={{ ...choiceCardStyle(available), cursor: "default", display: "grid", gap: 10 }}>
              <button type="button" onClick={() => togglePrintOption(choice.value)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}><strong>{available ? "✓ " : "+ "}{choice.label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{choice.description}</span></button>
              <button type="button" disabled={!available} onClick={() => setDefaultPrintMethod(choice.value)} style={{ minHeight: 35, border: isDefault ? "1px solid #2563eb" : "1px solid #cbd5e1", borderRadius: 9, background: isDefault ? "#2563eb" : "#fff", color: isDefault ? "#fff" : available ? "#334155" : "#94a3b8", fontWeight: 900, cursor: available ? "pointer" : "not-allowed" }}>{isDefault ? "Default answer" : "Make default"}</button>
            </article>;
          })}
        </div>
        {stepNavigation}
      </section> : null}

      {activeStep === "media_ink" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>4. Choose roll media and ink choices</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Roll media is only used when Roll print is selected. Ink choices are shown on the quote and website when relevant.</p>
        <div style={{ display: "grid", gap: 18 }}>
          {printOptions.includes("roll_stock") ? <label style={{ display: "grid", gap: 7, fontWeight: 850 }}>Default roll stock / print media<select value={rollMediaId} onChange={(event) => { setRollMediaId(event.target.value); markChanged(); }} style={input}><option value="">Choose when quoting / no default stock</option>{rollMediaGroups.map((group) => <option key={group.key} value={group.representative.id}>{group.label} — {autoGroupDescription(group)}</option>)}</select><small style={{ color: "#64748b", fontWeight: 650 }}>Roll stocks with the same customer-facing name are treated as width variants. Production Manager chooses the lowest-cost stock that fits the finished size.</small></label> : selectedMainMaterialIsRoll ? <div style={{ padding: 13, borderRadius: 12, background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}><b>{selectedMaterial?.name}</b> is already the product’s roll stock. Staff will enter only the finished size and the system will calculate the required linear metres automatically.</div> : <div style={{ padding: 13, borderRadius: 12, background: "#f8fafc", color: "#64748b" }}>Roll print is not available, so no separate roll media is required.</div>}
          {reversePrintableApplicable ? <div style={{ padding: 13, borderRadius: 12, background: "#ecfeff", color: "#155e75", border: "1px solid #a5f3fc" }}><b>Reverse print enabled.</b> This product will offer <b>Standard print</b> and <b>Reverse print</b>. Choosing Reverse print will reveal the backing-film choices below. Laminate options remain available in the normal Laminate step.</div> : null}
          {vinylBackingApplicable ? <div style={{ display: "grid", gap: 10, padding: 14, borderRadius: 14, background: "#f8fafc", border: "1px solid #dbe4f0" }}>
            <div><strong>Vinyl backing, optional</strong><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Choose the customer-facing backing choices. Only roll stocks marked Used for backing are offered here. Stocks with the same customer-facing name are grouped automatically, then the best width is selected from the finished size and cost.{reversePrintableApplicable && clearBaseMaterialLabels.length === 0 ? " On reverse-printable roll media this question only appears after Reverse print is selected." : baseMaterialMode === "option" && clearBaseMaterialLabels.length > 0 ? ` This question will only appear when the customer chooses ${clearBaseMaterialLabels.join(" or ")}.` : ""}</p></div>
            <button type="button" onClick={() => setDefaultVinylBacking("none")} style={{ ...choiceCardStyle(defaultVinylBackingMaterialId === "none"), minHeight: 58 }}><strong>No vinyl backing</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 4 }}>{defaultVinylBackingMaterialId === "none" ? "Default answer" : "Always available"}</span></button>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 9 }}>
              {vinylBackingGroups.map((group) => {
                const groupIds = group.materials.map((material) => material.id);
                const available = groupIds.some((id) => vinylBackingMaterialIds.includes(id));
                const isDefault = groupIds.includes(defaultVinylBackingMaterialId);
                return <article key={group.key} style={{ ...choiceCardStyle(available), cursor: "default", display: "grid", gap: 8 }}>
                  <button type="button" onClick={() => toggleVinylBackingGroup(group)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}><strong>{available ? "✓ " : "+ "}{group.label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 5 }}>{autoGroupDescription(group)}</span>{group.materials.length > 1 ? <span style={{ display: "block", color: "#0f766e", fontSize: 11, marginTop: 4, fontWeight: 800 }}>Client sees one option · {group.materials.length} stock widths linked</span> : null}</button>
                  <button type="button" disabled={!available} onClick={() => setDefaultVinylBackingGroup(group)} style={{ minHeight: 34, border: isDefault ? "1px solid #2563eb" : "1px solid #cbd5e1", borderRadius: 9, background: isDefault ? "#2563eb" : "#fff", color: isDefault ? "#fff" : available ? "#334155" : "#94a3b8", fontWeight: 900, cursor: available ? "pointer" : "not-allowed" }}>{isDefault ? "Default answer" : "Make default"}</button>
                </article>;
              })}
            </div>
          </div> : <div style={{ padding: 14, borderRadius: 14, background: "#f8fafc", color: "#64748b", border: "1px solid #dbe4f0" }}><b>Vinyl backing not applicable.</b> Backing film is offered for Clear/Transparent substrates or roll media marked Reverse printable. The currently selected stock does not require that option.</div>}
          <div>
            <strong>Available ink answers</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(150px,1fr))", gap: 9, marginTop: 9 }}>
              {inkChoices.map((choice) => {
                const available = inkOptions.includes(choice.value);
                const isDefault = defaultInk === choice.value;
                return <article key={choice.value} style={{ ...choiceCardStyle(available), cursor: "default", minHeight: 112, display: "grid", gap: 8 }}>
                  <button type="button" onClick={() => toggleInkOption(choice.value)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}><strong>{available ? "✓ " : "+ "}{choice.label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 5 }}>{choice.description}</span></button>
                  <button type="button" disabled={!available} onClick={() => setDefaultInkChoice(choice.value)} style={{ minHeight: 33, border: isDefault ? "1px solid #db2777" : "1px solid #cbd5e1", borderRadius: 9, background: isDefault ? "#db2777" : "#fff", color: isDefault ? "#fff" : available ? "#334155" : "#94a3b8", fontWeight: 900, cursor: available ? "pointer" : "not-allowed" }}>{isDefault ? "Default answer" : "Make default"}</button>
                </article>;
              })}
            </div>
          </div>
        </div>
        {stepNavigation}
      </section> : null}

      {activeStep === "laminate" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>5. Choose laminate options</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Tick the customer-facing laminate choices. Same-name roll widths are grouped automatically and the system selects the best fitting stock. Choose None or one laminate as the normal default.</p>
        <div style={{ display: "grid", gap: 12 }}>
          <button type="button" onClick={() => setDefaultLaminate("none")} style={{ ...choiceCardStyle(defaultLaminateMaterialId === "none"), minHeight: 64 }}><strong>No laminate</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 5 }}>{defaultLaminateMaterialId === "none" ? "Default answer" : "Always available"}</span></button>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>
            {laminateGroups.map((group) => {
              const groupIds = group.materials.map((material) => material.id);
              const available = groupIds.some((id) => laminateMaterialIds.includes(id));
              const isDefault = groupIds.includes(defaultLaminateMaterialId);
              return <article key={group.key} style={{ ...choiceCardStyle(available), cursor: "default", display: "grid", gap: 9 }}>
                <button type="button" onClick={() => toggleLaminateGroup(group)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}><strong>{available ? "✓ " : "+ "}{group.label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 5 }}>{autoGroupDescription(group)}</span>{group.materials.length > 1 ? <span style={{ display: "block", color: "#0f766e", fontSize: 11, marginTop: 4, fontWeight: 800 }}>Client sees one option · {group.materials.length} stock widths linked</span> : null}</button>
                <button type="button" disabled={!available} onClick={() => setDefaultLaminateGroup(group)} style={{ minHeight: 35, border: isDefault ? "1px solid #059669" : "1px solid #cbd5e1", borderRadius: 9, background: isDefault ? "#059669" : "#fff", color: isDefault ? "#fff" : available ? "#334155" : "#94a3b8", fontWeight: 900, cursor: available ? "pointer" : "not-allowed" }}>{isDefault ? "Default answer" : "Make default"}</button>
              </article>;
            })}
          </div>
          {!laminateMaterials.length ? <div style={{ padding: 13, borderRadius: 12, background: "#fff7ed", color: "#9a3412" }}>No active laminate materials were found. Add them under Materials.</div> : null}
        </div>
        {stepNavigation}
      </section> : null}

      {activeStep === "finishing" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>6. Choose finishing defaults</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Tick the finishing choices normally included. Staff can change them on each quote. Eyelets use the proven Quick Quote placement control.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          {finishingChoices.map((choice) => {
            const selected = finishingValues.includes(choice.value);
            return <button key={choice.value} type="button" onClick={() => toggleFinishing(choice.value)} style={choiceCardStyle(selected)}><strong>{selected ? "✓ " : "+ "}{choice.label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{selected ? "Included by default" : choice.description}</span></button>;
          })}
        </div>
        {finishingValues.includes("eyelets") ? <div style={{ display: "grid", gap: 11, padding: 15, borderRadius: 15, background: "#fff7ed", border: "1px solid #fed7aa", marginTop: 15 }}>
          <div><strong style={{ color: "#9a3412" }}>Eyelet defaults</strong><p style={{ margin: "4px 0 0", color: "#9a3412", fontSize: 13 }}>This is the first answer staff see; the full placement selector remains available on every quote.</p></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
            {eyeletPresets.map((preset) => <button key={preset.value} type="button" onClick={() => { setEyeletPreset(preset.value); markChanged(); }} style={{ ...choiceCardStyle(eyeletPreset === preset.value), minHeight: 68 }}><strong>{preset.label}</strong>{preset.qty ? <span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 4 }}>{preset.qty} eyelets</span> : null}</button>)}
          </div>
          <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Eyelet stock / hardware, optional<select value={eyeletMaterialId} onChange={(event) => { setEyeletMaterialId(event.target.value); markChanged(); }} style={input}><option value="">Cost labour only / no eyelet stock linked</option>{eyeletMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
        </div> : null}

        <div style={{ display: "grid", gap: 12, padding: 15, borderRadius: 15, background: mountingHardwareEnabled ? "#eff6ff" : "#f8fafc", border: mountingHardwareEnabled ? "1px solid #bfdbfe" : "1px solid #dbe4f0", marginTop: 15 }}>
          <button type="button" onClick={() => { setMountingHardwareEnabled((current) => !current); markChanged(); }} style={{ ...choiceCardStyle(mountingHardwareEnabled), minHeight: 72 }}>
            <strong>{mountingHardwareEnabled ? "✓ " : "+ "}Drilled holes and standoffs</strong>
            <span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 5 }}>Reusable for acrylic, ACM, aluminium, PVC and other rigid signs. The selected hole count automatically drives the standoff material quantity.</span>
          </button>
          {mountingHardwareEnabled ? <>
            <div>
              <strong style={{ color: "#1e3a8a" }}>Hole count and position note</strong>
              <p style={{ margin: "4px 0 0", color: "#475569", fontSize: 13 }}>Staff or customers enter one number per sign, then an optional note such as “Along top of panel” or “4 corners”. No preset list is required.</p>
            </div>
            <label style={{ display: "grid", gap: 6, fontWeight: 850, maxWidth: 360 }}>Default holes per sign<input type="number" min="0" step="1" value={defaultHoleQuantity} onChange={(event) => { setDefaultHoleQuantity(Math.max(0, Math.round(Number(event.target.value) || 0))); markChanged(); }} style={input} /><small style={{ color: "#64748b", fontWeight: 650 }}>Enter 0 when the normal answer is no holes.</small></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10 }}>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Silver standoff material<select value={silverStandoffMaterialId} onChange={(event) => { setSilverStandoffMaterialId(event.target.value); markChanged(); }} style={input}><option value="">Not available</option>{standoffMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
              <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Black standoff material<select value={blackStandoffMaterialId} onChange={(event) => { setBlackStandoffMaterialId(event.target.value); markChanged(); }} style={input}><option value="">Not available</option>{standoffMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
            </div>
            {!standoffMaterials.length ? <div style={{ padding: 12, borderRadius: 11, background: "#fff7ed", color: "#9a3412" }}>Add Silver Standoff and Black Standoff under Materials as individual <b>each</b> items. They will then appear here.</div> : null}
            <div style={{ padding: 11, borderRadius: 11, background: "#fff", color: "#334155", fontSize: 13 }}><b>Calculation:</b> standoffs per sign = selected holes. Quote quantity then multiplies the finished material requirement automatically.</div>
          </> : null}
        </div>
        {stepNavigation}
      </section> : null}

      {activeStep === "artwork" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>7. Choose artwork options</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Use the same artwork question staff see in Quick Quote. Tick the answers customers may choose, then set the normal default.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(190px,1fr))", gap: 10 }}>
          {artworkChoices.map((choice) => {
            const available = artworkOptions.includes(choice.value);
            const isDefault = defaultArtwork === choice.value;
            return <article key={choice.value} style={{ ...choiceCardStyle(available), cursor: "default", display: "grid", gap: 10 }}>
              <button type="button" onClick={() => toggleArtworkOption(choice.value)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}><strong>{available ? "✓ " : "+ "}{choice.label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{choice.description}</span></button>
              <button type="button" disabled={!available} onClick={() => setDefaultArtworkChoice(choice.value)} style={{ minHeight: 35, border: isDefault ? "1px solid #2563eb" : "1px solid #cbd5e1", borderRadius: 9, background: isDefault ? "#2563eb" : "#fff", color: isDefault ? "#fff" : available ? "#334155" : "#94a3b8", fontWeight: 900, cursor: available ? "pointer" : "not-allowed" }}>{isDefault ? "Default answer" : "Make default"}</button>
            </article>;
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,360px))", gap: 12, marginTop: 15 }}>
          {artworkOptions.includes("artwork_check") ? <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Artwork check charge (AUD)<input type="number" min="0" step="0.01" value={artworkCheckPrice} onChange={(event) => { setArtworkCheckPrice(Math.max(0, Number(event.target.value) || 0)); markChanged(); }} style={input} /><small style={{ color: "#64748b", fontWeight: 650 }}>Added once per configured order.</small></label> : null}
          {artworkOptions.includes("artwork_required") ? <label style={{ display: "grid", gap: 6, fontWeight: 850 }}>Artwork / design charge (AUD)<input type="number" min="0" step="0.01" value={artworkDesignPrice} onChange={(event) => { setArtworkDesignPrice(Math.max(0, Number(event.target.value) || 0)); markChanged(); }} style={input} /><small style={{ color: "#64748b", fontWeight: 650 }}>Added once. It remains purchasable online; only installation requires a tailored quote.</small></label> : null}
        </div>
        {stepNavigation}
      </section> : null}

      {activeStep === "fulfilment" ? <section style={panel}>
        <h3 style={{ margin: 0 }}>8. Choose the normal supply method</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Pickup remains free, Delivery adds the fixed fee below, and Install sends the configured product through for a tailored quote.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(170px,1fr))", gap: 10 }}>
          {[
            ["pickup", "Pickup", "No price change. Customer collects the finished order."],
            ["delivery", "Delivery", `Adds ${currency.format(deliveryFee)}. Delivery address is collected during WooCommerce checkout.`],
            ["install", "Install", "Request this configuration. Add to Cart is hidden for installation."]
          ].map(([value, label, description]) => <button key={value} type="button" onClick={() => setFulfilment(value)} style={choiceCardStyle(deliveryMethod === value)}><strong>{label}</strong><span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 6 }}>{description}</span></button>)}
        </div>
        <label style={{ display: "grid", gap: 6, fontWeight: 850, maxWidth: 360, marginTop: 15 }}>Delivery fee (AUD)<input type="number" min="0" step="0.01" value={deliveryFee} onChange={(event) => { setDeliveryFee(Math.max(0, Number(event.target.value) || 0)); markChanged(); }} style={input} /><small style={{ color: "#64748b", fontWeight: 650 }}>Added once when Delivery is selected. The customer enters their address during normal WooCommerce checkout.</small></label>
        {stepNavigation}
      </section> : null}

      {activeStep === "review" ? <section style={{ ...panel, background: "linear-gradient(180deg,#f0fdfa,#fff)" }}>
        <h3 style={{ margin: 0 }}>9. Review and save</h3><p style={{ margin: "5px 0 14px", color: "#64748b" }}>Everything above changed instantly without a page load. This single save updates the reusable quote product, production flow and website fields together.</p>
        <div style={{ display: "grid", gap: 9, padding: 16, borderRadius: 14, background: "#fff", border: "1px solid #ccfbf1" }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: "#0f766e", textTransform: "uppercase" }}>Product summary</div>
          <h3 style={{ margin: 0 }}>{baseMaterialMode === "option" ? `${baseMaterialQuestionLabel}: ${baseMaterialChoices.map((choice) => choice.label || materials.find((material) => material.id === choice.materialId)?.name).filter(Boolean).join(", ") || "No choices"}` : selectedMaterial?.name ?? "No physical material"} · {width} × {height} mm · Qty {quantity}</h3>
          {baseMaterialMode === "option" ? <div style={{ color: "#475569", lineHeight: 1.65 }}><b>Default base material:</b> {baseMaterialChoices.find((choice) => choice.materialId === materialId)?.label ?? selectedMaterial?.name ?? "Not selected"} · Each answer is linked to its own inventory material.</div> : null}
          <div style={{ color: "#475569", lineHeight: 1.65 }}><b>Print choices:</b> {printOptions.map((value) => printChoices.find((choice) => choice.value === value)?.label ?? value).join(", ")} · <b>Default:</b> {printChoices.find((choice) => choice.value === defaultPrintMethod)?.label ?? defaultPrintMethod}</div>
          <div style={{ color: "#475569", lineHeight: 1.65 }}><b>Roll media:</b> {selectedRollMedia?.name ?? "Chosen while quoting"} · <b>Ink choices:</b> {inkOptions.map((value) => inkChoices.find((choice) => choice.value === value)?.label ?? value).join(", ")} · <b>Default:</b> {inkChoices.find((choice) => choice.value === defaultInk)?.label ?? defaultInk}</div>
          <div style={{ color: "#475569", lineHeight: 1.65 }}><b>Vinyl backing:</b> {vinylBackingNames.length ? `None, ${vinylBackingNames.join(", ")}` : "None"} · <b>Default:</b> {selectedDefaultVinylBacking?.name ?? "None"}</div>
          <div style={{ color: "#475569", lineHeight: 1.65 }}><b>Laminate choices:</b> {laminateNames.length ? `None, ${laminateNames.join(", ")}` : "None"} · <b>Default:</b> {selectedDefaultLaminate?.name ?? "None"}</div>
          <div style={{ color: "#475569", lineHeight: 1.65 }}><b>Artwork choices:</b> {artworkOptions.map((value) => artworkChoices.find((choice) => choice.value === value)?.label ?? value).join(", ")} · <b>Default:</b> {artworkChoices.find((choice) => choice.value === defaultArtwork)?.label ?? defaultArtwork}{artworkOptions.includes("artwork_check") ? ` · Check ${currency.format(artworkCheckPrice)}` : ""}{artworkOptions.includes("artwork_required") ? ` · Design ${currency.format(artworkDesignPrice)}` : ""}</div>
          <div style={{ color: "#475569", lineHeight: 1.65 }}><b>Finishing defaults:</b> {finishingValues.length ? finishingValues.map((value) => finishingChoices.find((choice) => choice.value === value)?.label ?? value).join(", ") : "None"} · <b>Supply:</b> {deliveryMethod}{deliveryMethod === "delivery" ? ` (${currency.format(deliveryFee)})` : deliveryMethod === "install" ? " (tailored quote)" : " (no charge)"}</div>
          {finishingValues.includes("eyelets") ? <div style={{ color: "#9a3412" }}><b>Eyelets:</b> {eyeletPresets.find((preset) => preset.value === eyeletPreset)?.label ?? "4 corners"}{selectedEyeletMaterial ? ` · ${selectedEyeletMaterial.name}` : ""}</div> : null}
          {mountingHardwareEnabled ? <div style={{ color: "#1e3a8a" }}><b>Holes / standoffs:</b> default {defaultHoleQuantity} hole{defaultHoleQuantity === 1 ? "" : "s"} per sign plus a position note · Silver: {selectedSilverStandoffMaterial?.name ?? "not available"} · Black: {selectedBlackStandoffMaterial?.name ?? "not available"}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setActiveStep("fulfilment")} style={{ minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#334155", fontWeight: 900, padding: "0 15px", cursor: "pointer" }}>← Supply</button>
          <div style={{ display: "grid", gap: 9, justifyItems: "end" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 850, fontSize: 13, color: "#475569" }}><input type="checkbox" name="makeActive" defaultChecked={currentStatus === "draft" || currentStatus === "active"} /> Available for staff to quote</label>
            <SaveButton />
          </div>
        </div>
      </section> : null}

      <details style={{ ...panel, padding: 0, overflow: "hidden" }}>
        <summary style={{ cursor: "pointer", padding: 17, fontWeight: 950, color: "#475569" }}>Advanced sequence and uncommon production steps</summary>
        <div style={{ borderTop: "1px solid #e2e8f0", padding: 17, display: "grid", gap: 12 }}>
          <p style={{ margin: 0, color: "#64748b" }}>The normal production sequence is generated from the defaults. Open this only for a special sequence or a custom saved production step.</p>
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
          <p style={{ margin: 0, color: "#64748b" }}>{dirty ? "Your new choices are held locally. Save once from Review to refresh the calculation." : "This is the internal cost and sell price used while quoting."}</p>
        </div>
        <Link href={`/products/${productId}?tab=pricing`} style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>Open full price check →</Link>
      </div>
      {preview ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9, marginTop: 15 }}>
        {[["Material", preview.materialCost], ["Machines", preview.machineCost], ["Ink", preview.inkCost], ["Labour", preview.labourCost], ["Total cost", preview.totalCost], ["Sell price", preview.sellPrice]].map(([label, value]) => <div key={String(label)} style={{ padding: 12, borderRadius: 12, background: "#fff", border: "1px solid #dbe4f0" }}><div style={{ fontSize: 12, color: "#64748b" }}>{label}</div><div style={{ marginTop: 5, fontSize: 18, fontWeight: 950 }}>{currency.format(Number(value))}</div></div>)}
      </div> : <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#fff", border: "1px solid #dbe4f0", color: "#475569" }}>Save the product setup to calculate its cost and sell price.</div>}
    </section>
  </div>;
}
