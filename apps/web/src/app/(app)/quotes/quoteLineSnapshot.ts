export type QuickQuoteFlowType = "" | "signage" | "plan_printing" | "poster_printing" | "small_format" | "service" | "component";
export type QuickQuoteLabourBasis = "per_item" | "line_total";
export type QuickQuoteDropDirection = "auto" | "vertical" | "horizontal";
export type QuickQuoteStep =
  | "flow"
  | "base"
  | "thickness"
  | "colour"
  | "size"
  | "artwork"
  | "print"
  | "media"
  | "ink"
  | "sides"
  | "laminate"
  | "finishing"
  | "small_type"
  | "ncr_details"
  | "small_stock"
  | "small_size"
  | "small_sides"
  | "small_print"
  | "small_coating"
  | "small_finishing"
  | "small_quantity"
  | "service_type"
  | "service_details"
  | "service_fixings"
  | "component_details"
  | "component_parts"
  | "component_labour"
  | "dispatch"
  | "review";

export type SnapshotMaterial = {
  id: string;
  name: string;
  customerFacingName?: string | null;
  materialType?: string | null;
  materialGroup?: string | null;
  minimumBillableSheetFraction?: string | null;
  rollBillingIncrementMetres?: string | null;
  reversePrintable?: boolean;
  usedForBacking?: boolean;
  supplierName?: string | null;
  sku?: string | null;
  stockUom?: string | null;
  purchaseUom?: string | null;
  stockQuantity?: string | null;
  purchaseCost?: string | null;
  widthMm?: string | null;
  lengthMm?: string | null;
  rollWidthMm?: string | null;
  gsm?: string | null;
  notes?: string | null;
};

export type QuickQuoteSnapshot = {
  version: 1;
  source: "quick_quote_builder" | "legacy_quote_rebuild";
  reconstructed?: boolean;
  surveyImported?: boolean;
  surveyNeedsConfiguration?: boolean;
  surveyContext?: Record<string, unknown>;
  linkedDispatchLineId?: string | null;
  parentLineId?: string | null;
  builderMode?: "quick" | "advanced";
  activeStep?: QuickQuoteStep;
  flowType: QuickQuoteFlowType;
  baseType?: string;
  thickness?: string;
  colour?: string;
  widthMm?: string;
  heightMm?: string;
  bleedSpacingMm?: string;
  dropDirection?: QuickQuoteDropDirection;
  dropOverlapMm?: string;
  dropCount?: number;
  dropPanelWidthMm?: string;
  dropLengthMm?: string;
  artworkChoice?: string;
  artworkMinutes?: string;
  printMethod?: string;
  printSetupMinutes?: string;
  printSetupLabourBasis?: QuickQuoteLabourBasis;
  mediaId?: string;
  ink?: string;
  sides?: string;
  printDirection?: string;
  backingId?: string;
  laminateId?: string;
  laminateMinutes?: string;
  laminateLabourBasis?: QuickQuoteLabourBasis;
  finishings?: string[];
  finishingMinutes?: Record<string, string>;
  finishingLabourBasis?: Record<string, QuickQuoteLabourBasis>;
  eyeletPresetLabel?: string;
  customEyeletQty?: string;
  smallType?: string;
  smallStockId?: string;
  customSmallStockEnabled?: boolean;
  customSmallStockName?: string;
  customSmallStockSupplier?: string;
  customSmallStockCost?: string;
  customSmallStockWidthMm?: string;
  customSmallStockLengthMm?: string;
  customSmallStockGsm?: string;
  ncrCopies?: string;
  ncrSetsPerBook?: string;
  ncrPageColours?: string[];
  ncrCoverColour?: string;
  ncrTapeColour?: string;
  smallPrintColour?: string;
  smallCoatingId?: string;
  smallFinishings?: string[];
  smallFinishingMinutes?: Record<string, string>;
  smallFinishingLabourBasis?: Record<string, QuickQuoteLabourBasis>;
  serviceType?: string;
  deliveryCharge?: string;
  installCrewSize?: string;
  installMinutes?: string;
  travelCharge?: string;
  serviceFixings?: string[];
  serviceFixingQty?: Record<string, string>;
  serviceFixingRate?: Record<string, string>;
  componentName?: string;
  componentDescription?: string;
  componentParts?: Array<Record<string, string>>;
  componentLabourLabel?: string;
  componentLabourMinutes?: string;
  quantity?: string;
  unitPriceOverridden?: boolean;
  manualUnitPrice?: string;
  notes?: string;
  materialSnapshots?: {
    main?: SnapshotMaterial | null;
    media?: SnapshotMaterial | null;
    backing?: SnapshotMaterial | null;
    laminate?: SnapshotMaterial | null;
    smallStock?: SnapshotMaterial | null;
    smallCoating?: SnapshotMaterial | null;
    eyelet?: SnapshotMaterial | null;
    componentParts?: SnapshotMaterial[];
  };
  pricingSnapshot?: {
    markupMultiplier?: number;
    profitMultiplier?: number;
    labourRate?: number;
    inkRatePerSqm?: number;
    inkBillingIncrementSqm?: number;
    monoRatePerSqm?: number;
    rawCost?: number;
    autoUnitPrice?: number;
    priceLevelCode?: string;
    priceLevelName?: string;
    priceLevelFactor?: number;
    manualQuoteDiscountPercent?: number;
    pricingBreakdown?: Array<Record<string, unknown>>;
  };
};

type MaterialLike = SnapshotMaterial;

type SummaryRow = { label: string; value: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringValue(item)]));
}

function labourBasisValue(value: unknown): QuickQuoteLabourBasis | undefined {
  return value === "per_item" || value === "line_total" ? value : undefined;
}

function recordOfLabourBasis(value: unknown): Record<string, QuickQuoteLabourBasis> {
  if (!isRecord(value)) return {};
  const result: Record<string, QuickQuoteLabourBasis> = {};
  for (const [key, item] of Object.entries(value)) {
    const basis = labourBasisValue(item);
    if (basis) result[key] = basis;
  }
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item)).filter(Boolean) : [];
}

function normalise(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/×/g, "x").replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseQuoteSummary(summary: string | null | undefined): SummaryRow[] {
  return String(summary ?? "")
    .split(/\s+[·•]\s+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colonIndex = part.indexOf(":");
      if (colonIndex > 0 && colonIndex < 48) return { label: part.slice(0, colonIndex).trim(), value: part.slice(colonIndex + 1).trim() };
      return { label: "Detail", value: part };
    });
}

function snapshotMaterial(value: unknown): SnapshotMaterial | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id).trim();
  const name = stringValue(value.name).trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    customerFacingName: stringValue(value.customerFacingName) || null,
    materialType: stringValue(value.materialType) || null,
    materialGroup: stringValue(value.materialGroup) || null,
    minimumBillableSheetFraction: stringValue(value.minimumBillableSheetFraction) || null,
    rollBillingIncrementMetres: stringValue(value.rollBillingIncrementMetres) || null,
    reversePrintable: value.reversePrintable === true || stringValue(value.reversePrintable).trim().toLowerCase() === "true",
    usedForBacking: value.usedForBacking === true || stringValue(value.usedForBacking).trim().toLowerCase() === "true",
    supplierName: stringValue(value.supplierName) || null,
    sku: stringValue(value.sku) || null,
    stockUom: stringValue(value.stockUom) || null,
    purchaseUom: stringValue(value.purchaseUom) || null,
    stockQuantity: stringValue(value.stockQuantity) || null,
    purchaseCost: stringValue(value.purchaseCost) || null,
    widthMm: stringValue(value.widthMm) || null,
    lengthMm: stringValue(value.lengthMm) || null,
    rollWidthMm: stringValue(value.rollWidthMm) || null,
    gsm: stringValue(value.gsm) || null,
    notes: stringValue(value.notes) || null
  };
}

export function readQuickQuoteSnapshot(value: unknown): QuickQuoteSnapshot | null {
  let sourceValue = value;
  if (typeof sourceValue === "string") {
    try {
      sourceValue = JSON.parse(sourceValue) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(sourceValue)) return null;
  const source = stringValue(sourceValue.source);
  if (source !== "quick_quote_builder" && source !== "legacy_quote_rebuild") return null;

  const materialData = isRecord(sourceValue.materialSnapshots) ? sourceValue.materialSnapshots : {};
  const componentMaterials = Array.isArray(materialData.componentParts)
    ? materialData.componentParts.map(snapshotMaterial).filter((item): item is SnapshotMaterial => Boolean(item))
    : [];

  return {
    ...(sourceValue as QuickQuoteSnapshot),
    version: 1,
    source,
    flowType: stringValue(sourceValue.flowType, "signage") as QuickQuoteFlowType,
    printSetupLabourBasis: labourBasisValue(sourceValue.printSetupLabourBasis),
    laminateLabourBasis: labourBasisValue(sourceValue.laminateLabourBasis),
    finishings: stringArray(sourceValue.finishings),
    finishingMinutes: recordOfStrings(sourceValue.finishingMinutes),
    finishingLabourBasis: recordOfLabourBasis(sourceValue.finishingLabourBasis),
    ncrPageColours: stringArray(sourceValue.ncrPageColours),
    smallFinishings: stringArray(sourceValue.smallFinishings),
    smallFinishingMinutes: recordOfStrings(sourceValue.smallFinishingMinutes),
    smallFinishingLabourBasis: recordOfLabourBasis(sourceValue.smallFinishingLabourBasis),
    serviceFixings: stringArray(sourceValue.serviceFixings),
    serviceFixingQty: recordOfStrings(sourceValue.serviceFixingQty),
    serviceFixingRate: recordOfStrings(sourceValue.serviceFixingRate),
    componentParts: Array.isArray(sourceValue.componentParts)
      ? sourceValue.componentParts.filter(isRecord).map((item) => Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, stringValue(entry)])))
      : [],
    materialSnapshots: {
      main: snapshotMaterial(materialData.main),
      media: snapshotMaterial(materialData.media),
      backing: snapshotMaterial(materialData.backing),
      laminate: snapshotMaterial(materialData.laminate),
      smallStock: snapshotMaterial(materialData.smallStock),
      smallCoating: snapshotMaterial(materialData.smallCoating),
      eyelet: snapshotMaterial(materialData.eyelet),
      componentParts: componentMaterials
    }
  };
}

export function materialsFromSnapshot(snapshot: QuickQuoteSnapshot | null | undefined): SnapshotMaterial[] {
  if (!snapshot?.materialSnapshots) return [];
  const values = [
    snapshot.materialSnapshots.main,
    snapshot.materialSnapshots.media,
    snapshot.materialSnapshots.backing,
    snapshot.materialSnapshots.laminate,
    snapshot.materialSnapshots.smallStock,
    snapshot.materialSnapshots.smallCoating,
    snapshot.materialSnapshots.eyelet,
    ...(snapshot.materialSnapshots.componentParts ?? [])
  ].filter((item): item is SnapshotMaterial => Boolean(item?.id && item?.name));
  const seen = new Set<string>();
  return values.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function findMaterial(materials: MaterialLike[], name: string): MaterialLike | undefined {
  const target = normalise(name);
  if (!target) return undefined;
  return materials.find((material) => normalise(material.name) === target)
    ?? materials.find((material) => normalise(material.name).includes(target) || target.includes(normalise(material.name)));
}

function baseTypeFromText(value: string): string {
  const text = normalise(value);
  if (text.includes("acrylic") || text.includes("perspex")) return "acrylic";
  if (text.includes("aluminium composite") || text.includes("aluminum composite") || /\bacm\b/.test(text)) return "acm";
  if (text.includes("corflute") || text.includes("correx")) return "corflute";
  if (text.includes("foam") || /\bpvc\b/.test(text)) return "pvc";
  if (text.includes("banner") || text.includes("canvas")) return "banner";
  return "other_sheet";
}

function thicknessFromMaterial(material: MaterialLike | undefined): string {
  const match = String(material?.name ?? material?.notes ?? "").match(/(\d+(?:\.\d+)?)\s*mm/i);
  return match ? `${match[1]}mm` : "Standard";
}

function colourFromMaterial(material: MaterialLike | undefined): string {
  const text = normalise(`${material?.name ?? ""} ${material?.notes ?? ""}`);
  const colours = ["clear", "opal", "white", "black", "blue", "red", "green", "yellow", "pink", "silver", "gold", "grey", "gray"];
  const match = colours.find((colour) => text.includes(colour));
  return match ? match.replace(/^./, (letter) => letter.toUpperCase()) : "Standard";
}

function minutesFrom(value: string): string {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:min|minute)/i);
  return match?.[1] ?? "";
}

function dimensionsFrom(value: string): { widthMm: string; heightMm: string } {
  const match = value.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  return { widthMm: match?.[1] ?? "", heightMm: match?.[2] ?? "" };
}

function firstDetail(rows: SummaryRow[], predicate: (value: string) => boolean): string {
  return rows.find((row) => row.label === "Detail" && predicate(row.value))?.value ?? "";
}

function inferFinishing(value: string): { finishings: string[]; eyeletPresetLabel: string; customEyeletQty: string } {
  const text = normalise(value);
  const finishings: string[] = [];
  if (text.includes("jingwei")) finishings.push("jingwei");
  if (text.includes("eyelet")) finishings.push("eyelets");
  if (text.includes("vinyl cutting")) finishings.push("vinyl_cutting");
  if (text.includes("print vinyl application") || text.includes("vinyl application")) finishings.push("print_vinyl_application");
  if (text.includes("tape hem") || text.includes("banner hem")) finishings.push("tape_hem_banner");
  let eyeletPresetLabel = "4 corners";
  if (text.includes("top corners")) eyeletPresetLabel = "Top corners only";
  else if (text.includes("centre top") || text.includes("center top")) eyeletPresetLabel = "Centre top + bottom";
  else if (text.includes("pole fixing")) eyeletPresetLabel = "2 top + 2 bottom for pole fixing";
  const qtyMatch = value.match(/eyelets?[^()]*\((\d+)\)/i);
  const customEyeletQty = qtyMatch?.[1] ?? "";
  return { finishings, eyeletPresetLabel, customEyeletQty };
}

export function inferLegacyQuickQuoteSnapshot(input: {
  productName: string;
  optionSummary: string | null;
  quantity: string;
  unitPrice: string;
  notes?: string | null;
  materials: MaterialLike[];
}): QuickQuoteSnapshot {
  const rows = parseQuoteSummary(input.optionSummary);
  const byLabel = new Map(rows.filter((row) => row.label !== "Detail").map((row) => [normalise(row.label), row.value]));
  const allText = `${input.productName} ${input.optionSummary ?? ""}`;
  const text = normalise(allText);

  let flowType: QuickQuoteFlowType = "signage";
  if (text.includes("plan printing")) flowType = "plan_printing";
  else if (text.includes("poster printing")) flowType = "poster_printing";
  else if (["delivery", "pickup", "sign install", "install labour"].some((item) => normalise(input.productName).includes(item))) flowType = "service";
  else if (["business card", "flyer", "brochure", "booklet", "duplicate", "triplicate", "ncr", "sticker"].some((item) => text.includes(item))) flowType = "small_format";

  const substrateName = byLabel.get("substrate") ?? byLabel.get("stock") ?? "";
  const mainMaterial = findMaterial(input.materials, substrateName);
  const finishedSize = byLabel.get("finished size") ?? byLabel.get("size") ?? firstDetail(rows, (value) => /\d+\s*[x×]\s*\d+/.test(value));
  const dimensions = dimensionsFrom(finishedSize);
  const artworkDetail = firstDetail(rows, (value) => normalise(value).startsWith("artwork"));
  const printDetail = firstDetail(rows, (value) => ["direct print", "no print", "roll stock", "cut vinyl"].some((item) => normalise(value).includes(item)));
  const setupDetail = firstDetail(rows, (value) => normalise(value).includes("print setup"));
  const inkDetail = firstDetail(rows, (value) => ["cmyk", "white ink", "cmyk white"].some((item) => normalise(value).includes(item)));
  const sidesDetail = firstDetail(rows, (value) => normalise(value).includes("sided"));
  const directionDetail = firstDetail(rows, (value) => normalise(value).includes("print") && (normalise(value).includes("positive") || normalise(value).includes("reverse")));
  const laminateName = byLabel.get("laminate") ?? "";
  const laminate = laminateName && normalise(laminateName) !== "none" ? findMaterial(input.materials, laminateName) : undefined;
  const finishingValue = byLabel.get("finishing") ?? "";
  const finishing = inferFinishing(finishingValue);
  const dispatchValue = byLabel.get("dispatch") ?? firstDetail(rows, (value) => ["pickup", "delivery", "install"].some((item) => normalise(value).startsWith(item)));
  const dispatchText = normalise(dispatchValue);

  const printMethod = normalise(printDetail).includes("direct") ? "direct_print"
    : normalise(printDetail).includes("roll") ? "roll_stock"
      : normalise(printDetail).includes("cut vinyl") ? "cut_vinyl"
        : normalise(printDetail).includes("no print") ? "no_print" : "";

  const artworkChoice = normalise(artworkDetail).includes("supplied") ? "client_supplied" : artworkDetail ? "required" : "";
  const sides = normalise(sidesDetail).includes("double") ? "double" : sidesDetail ? "single" : "";
  const ink = normalise(inkDetail).includes("white") && normalise(inkDetail).includes("cmyk") ? "both"
    : normalise(inkDetail).includes("white") ? "white" : normalise(inkDetail).includes("cmyk") ? "cmyk" : "";
  const serviceType = dispatchText.includes("install") ? "install" : dispatchText.includes("delivery") ? "delivery" : dispatchText.includes("pickup") ? "pickup" : flowType === "service" ? (normalise(input.productName).includes("install") ? "install" : normalise(input.productName).includes("delivery") ? "delivery" : "pickup") : "";

  const smallStock = flowType === "small_format" || flowType === "plan_printing" || flowType === "poster_printing" ? mainMaterial : undefined;
  const smallType = text.includes("business card") ? "business_cards"
    : text.includes("flyer") ? "flyers"
      : text.includes("brochure") ? "brochures"
        : text.includes("booklet") ? "booklets"
          : (text.includes("duplicate") || text.includes("triplicate") || text.includes("ncr")) ? "duplicate_books"
            : text.includes("sticker") ? "stickers" : "";

  return {
    version: 1,
    source: "legacy_quote_rebuild",
    reconstructed: true,
    builderMode: "advanced",
    activeStep: flowType === "service" ? "service_type" : flowType === "small_format" ? "small_type" : flowType === "plan_printing" || flowType === "poster_printing" ? "small_stock" : "base",
    flowType,
    baseType: baseTypeFromText(`${input.productName} ${substrateName}`),
    thickness: thicknessFromMaterial(mainMaterial),
    colour: colourFromMaterial(mainMaterial),
    widthMm: dimensions.widthMm,
    heightMm: dimensions.heightMm,
    artworkChoice,
    artworkMinutes: minutesFrom(artworkDetail),
    printMethod,
    printSetupMinutes: minutesFrom(setupDetail),
    printSetupLabourBasis: "line_total",
    ink,
    sides,
    printDirection: normalise(directionDetail).includes("reverse") ? "reverse" : directionDetail ? "positive" : "",
    backingId: "",
    laminateId: normalise(laminateName) === "none" ? "none" : laminate?.id ?? "",
    laminateMinutes: "",
    laminateLabourBasis: "line_total",
    finishings: finishing.finishings,
    finishingMinutes: {},
    finishingLabourBasis: {},
    eyeletPresetLabel: finishing.eyeletPresetLabel,
    customEyeletQty: finishing.customEyeletQty,
    smallType,
    smallStockId: smallStock?.id ?? "",
    smallPrintColour: ink === "cmyk" ? "cmyk" : ink ? "special" : "",
    smallCoatingId: normalise(laminateName) === "none" ? "none" : laminate?.id ?? "",
    smallFinishings: [],
    smallFinishingLabourBasis: {},
    serviceType,
    installCrewSize: dispatchValue.match(/(\d+)\s+installer/i)?.[1] ?? "1",
    installMinutes: minutesFrom(dispatchValue),
    quantity: input.quantity || "1",
    unitPriceOverridden: false,
    manualUnitPrice: input.unitPrice || "0",
    notes: input.notes ?? "",
    materialSnapshots: {
      main: flowType === "signage" ? mainMaterial ?? null : null,
      smallStock: smallStock ?? null,
      backing: null,
      laminate: laminate ?? null,
      smallCoating: laminate ?? null,
      componentParts: []
    }
  };
}

export function stepForQuoteSummaryRow(label: string, value: string, snapshot: QuickQuoteSnapshot | null | undefined): QuickQuoteStep | null {
  const labelKey = normalise(label);
  const valueKey = normalise(value);
  const flowType = snapshot?.flowType ?? "signage";
  const matchesMaterial = (material: SnapshotMaterial | null | undefined): boolean => {
    if (!material || !valueKey) return false;
    return [material.name, material.customerFacingName].filter(Boolean).some((name) => {
      const key = normalise(String(name));
      return Boolean(key && (valueKey === key || valueKey.includes(key) || key.includes(valueKey)));
    });
  };

  if (matchesMaterial(snapshot?.materialSnapshots?.media)) return "media";
  if (matchesMaterial(snapshot?.materialSnapshots?.backing)) return "laminate";
  if (matchesMaterial(snapshot?.materialSnapshots?.laminate)) return "laminate";
  if (matchesMaterial(snapshot?.materialSnapshots?.smallStock)) return "small_stock";
  if (matchesMaterial(snapshot?.materialSnapshots?.smallCoating)) return "small_coating";
  if (matchesMaterial(snapshot?.materialSnapshots?.main)) return flowType === "signage" ? "thickness" : "small_stock";
  if (valueKey.includes("laminate") || valueKey.includes("cello") || valueKey.includes("coating")) return flowType === "signage" ? "laminate" : "small_coating";

  if (labelKey === "quantity") return flowType === "small_format" || flowType === "plan_printing" || flowType === "poster_printing" ? "small_quantity" : "review";
  if (labelKey === "substrate" || labelKey === "stock" || labelKey === "material") return flowType === "signage" ? "thickness" : "small_stock";
  if (labelKey === "finished size" || labelKey === "size") return flowType === "signage" ? "size" : "small_size";
  if (labelKey === "artwork" || valueKey.startsWith("artwork")) return "artwork";
  if (labelKey === "backing") return flowType === "signage" ? "laminate" : null;
  if (labelKey === "laminate" || labelKey === "coating") return flowType === "signage" ? "laminate" : "small_coating";
  if (labelKey === "finishing") return flowType === "signage" ? "finishing" : "small_finishing";
  if (labelKey === "dispatch" || valueKey.startsWith("pickup") || valueKey.startsWith("delivery") || valueKey.startsWith("install")) return "dispatch";
  if (valueKey.includes("print setup") || valueKey === "direct print" || valueKey === "no print" || valueKey === "roll stock" || valueKey === "cut vinyl") return "print";
  if (valueKey === "cmyk" || valueKey === "white" || valueKey.includes("cmyk white")) return flowType === "signage" ? "ink" : "small_print";
  if (valueKey.includes("sided") || valueKey.includes("positive print") || valueKey.includes("reverse print")) return flowType === "signage" ? "sides" : "small_sides";
  if (valueKey.includes("part book") || valueKey.includes("sets book") || labelKey === "cover" || labelKey === "tape") return "ncr_details";
  if (flowType === "service") return "service_details";
  if (flowType === "component") return labelKey === "parts" ? "component_parts" : "component_details";
  if (labelKey === "detail" && valueKey === normalise(snapshot?.baseType)) return "base";
  return flowType === "signage" ? "base" : flowType === "small_format" ? "small_type" : flowType === "plan_printing" || flowType === "poster_printing" ? "small_stock" : "flow";
}
