import type { ArtworkSpecificationItem, ArtworkSpecificationSnapshot } from "@/components/ArtworkSpecificationPanel";

type QuoteLineLike = {
  id?: string | null;
  productName?: string | null;
  optionSummary?: string | null;
  quantity?: string | null;
  updatedAt?: string | null;
  configurationSnapshot?: Record<string, unknown> | null;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function numberText(value: unknown): string {
  const numeric = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return text(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function materialName(value: unknown): string {
  const material = recordValue(value);
  if (!material) return "";
  return text(material.customerFacingName) || text(material.name);
}

function materialLooksLikeRoll(value: unknown): boolean {
  const material = recordValue(value);
  if (!material) return false;
  return Number(material.rollWidthMm ?? 0) > 0
    || /^(?:lm|linear\s*m(?:etre)?s?)$/i.test(text(material.stockUom))
    || /\b(roll|vinyl|banner|sav|media)\b/i.test(`${text(material.materialType)} ${text(material.materialGroup)} ${text(material.name)}`);
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function printMethodLabel(value: unknown): string {
  const key = lower(value);
  if (key === "direct_print") return "Direct print";
  if (key === "roll_stock") return "Roll-to-roll print";
  if (key === "cut_vinyl") return "Cut vinyl";
  if (key === "no_print") return "No print";
  return key ? titleCase(key) : "";
}

function inkLabel(value: unknown): string {
  const key = lower(value);
  if (key === "both") return "CMYK + White";
  if (key === "cmyk") return "CMYK";
  if (key === "white") return "White ink";
  if (key === "mono") return "Mono";
  return key ? titleCase(key) : "";
}

function sidesLabel(value: unknown): string {
  const key = lower(value);
  if (key === "double") return "Double sided";
  if (key === "single") return "Single sided";
  return key ? titleCase(key) : "";
}

const finishingLabels: Record<string, string> = {
  jingwei: "Jingwei cutting",
  eyelets: "Eyelets",
  vinyl_cutting: "Vinyl cutting",
  print_vinyl_application: "Print / vinyl application",
  tape_hem_banner: "Tape / hem banner",
};

function optionParts(summary: string | null | undefined): string[] {
  return String(summary ?? "").split(/\s+[·•]\s+/g).map((part) => part.trim()).filter(Boolean);
}

function optionValues(summary: string | null | undefined, labels: RegExp): string[] {
  return optionParts(summary).flatMap((part) => {
    const colon = part.indexOf(":");
    if (colon <= 0) return labels.test(part) ? [part] : [];
    const label = part.slice(0, colon).trim();
    return labels.test(label) ? [part.slice(colon + 1).trim()] : [];
  }).filter(Boolean);
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return values.map((value) => text(value)).filter(Boolean).filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function add(items: ArtworkSpecificationItem[], item: ArtworkSpecificationItem | null) {
  if (!item || !text(item.value)) return;
  if (items.some((existing) => existing.key === item.key && existing.value.toLowerCase() === item.value.toLowerCase())) return;
  items.push(item);
}

export function buildArtworkSpecificationSnapshot(line: QuoteLineLike, capturedAt = new Date().toISOString()): ArtworkSpecificationSnapshot {
  const snapshot = recordValue(line.configurationSnapshot) ?? {};
  const materials = recordValue(snapshot.materialSnapshots) ?? {};
  const main = materials.main;
  const media = materials.media;
  const backing = materials.backing;
  const laminate = materials.laminate ?? materials.smallCoating;
  const smallStock = materials.smallStock;
  const standoff = materials.standoff;
  const flowType = lower(snapshot.flowType) || "signage";
  const printMethod = lower(snapshot.printMethod);
  const mainIsRoll = materialLooksLikeRoll(main);
  const isPrintFlow = ["small_format", "plan_printing", "poster_printing"].includes(flowType);
  const baseMaterial = isPrintFlow ? (smallStock ?? main) : (mainIsRoll && printMethod === "roll_stock" ? null : main);
  const printMedia = media ?? (mainIsRoll && printMethod === "roll_stock" ? main : null);
  const items: ArtworkSpecificationItem[] = [];

  const substrate = materialName(baseMaterial);
  if (substrate) add(items, { key: "substrate", label: isPrintFlow ? "Stock" : "Substrate", value: substrate, icon: "substrate" });

  const printParts = unique([
    printMethodLabel(snapshot.printMethod),
    materialName(printMedia),
    inkLabel(snapshot.ink ?? snapshot.smallPrintColour),
    sidesLabel(snapshot.sides ?? snapshot.smallSides),
    lower(snapshot.printDirection) === "reverse" ? "Reverse print" : lower(snapshot.printDirection) === "positive" ? "Positive print" : null,
  ]).filter((part) => !/^no print$/i.test(part));
  if (printParts.length) add(items, { key: "print", label: "Imaging / print", value: printParts.join(" · "), icon: "print" });
  else if (printMethod === "no_print") add(items, { key: "print", label: "Imaging / print", value: "No print", icon: "print" });

  const backingName = materialName(backing);
  if (backingName) add(items, { key: "backing", label: "Backing", value: backingName, icon: "backing" });

  const laminateName = materialName(laminate);
  if (laminateName) add(items, { key: "laminate", label: "Laminate / finish", value: laminateName, icon: "laminate" });
  else if (text(snapshot.laminateId).toLowerCase() === "none") add(items, { key: "laminate", label: "Laminate / finish", value: "No laminate", icon: "laminate" });

  const finishings = Array.isArray(snapshot.finishings) ? snapshot.finishings.map(text).filter(Boolean) : [];
  const cutParts = unique([
    ...finishings.filter((key) => key !== "eyelets").map((key) => finishingLabels[key] ?? titleCase(key)),
    ...optionValues(line.optionSummary, /^(?:corners?|corner finish|cut|shape|holes drilled|hole location)$/i),
  ]);
  if (cutParts.length) add(items, { key: "cut", label: "Cut / shape", value: cutParts.join(" · "), icon: "cut" });

  const mountingParts: string[] = [];
  const standoffName = materialName(standoff);
  const standoffQty = numberText(snapshot.standoffQtyPerItem);
  if (standoffName && Number(standoffQty) > 0) mountingParts.push(`${standoffName} × ${standoffQty}`);
  if (finishings.includes("eyelets")) {
    const preset = text(snapshot.eyeletPresetLabel) || "Eyelets";
    const customQty = numberText(snapshot.customEyeletQty);
    const presetQtyMatch = preset.match(/\((\d+)\)/);
    const presetKey = preset.toLowerCase();
    const knownPresetQty = presetKey.includes("4 corners") || presetKey.includes("pole fixing") ? "4"
      : presetKey.includes("top corners") || presetKey.includes("centre top") || presetKey.includes("center top") ? "2"
        : "";
    const qty = Number(customQty) > 0 ? customQty : presetQtyMatch?.[1] ?? knownPresetQty;
    mountingParts.push(qty ? `Eyelets · ${preset} · ${qty}` : `Eyelets · ${preset}`);
  }
  const mountingFromSummary = optionValues(line.optionSummary, /^(?:mounting|standoffs?|fixing method)$/i);
  mountingParts.push(...mountingFromSummary);
  if (mountingParts.length) add(items, { key: "mounting", label: "Mounting", value: unique(mountingParts).join(" · "), icon: "mounting" });

  const width = numberText(snapshot.widthMm);
  const height = numberText(snapshot.heightMm);
  const sizeFromSnapshot = Number(width) > 0 && Number(height) > 0 ? `${width} × ${height}mm` : "";
  const sizeFromSummary = optionValues(line.optionSummary, /^(?:finished\s*)?size$/i)[0] ?? "";
  const size = sizeFromSnapshot || sizeFromSummary;
  if (size) add(items, { key: "size", label: "Finished size", value: size, icon: "size" });

  const qty = numberText(snapshot.quantity ?? line.quantity ?? "1") || "1";
  add(items, { key: "quantity", label: "Quantity", value: qty, icon: "quantity" });

  return {
    version: 1,
    capturedAt,
    sourceQuoteLineId: line.id ?? null,
    sourceLineUpdatedAt: line.updatedAt ?? null,
    items,
  };
}

export function readArtworkSpecificationSnapshot(value: unknown): ArtworkSpecificationSnapshot | null {
  const record = recordValue(value);
  if (!record || Number(record.version) !== 1 || !Array.isArray(record.items)) return null;
  const items = record.items.flatMap((raw) => {
    const item = recordValue(raw);
    if (!item) return [];
    const key = text(item.key);
    const label = text(item.label);
    const valueText = text(item.value);
    const icon = text(item.icon) as ArtworkSpecificationItem["icon"];
    if (!key || !label || !valueText || !["substrate", "print", "laminate", "backing", "cut", "mounting", "size", "quantity", "finish"].includes(icon)) return [];
    return [{ key, label, value: valueText, detail: text(item.detail) || null, icon } satisfies ArtworkSpecificationItem];
  });
  if (!items.length) return null;
  return {
    version: 1,
    capturedAt: text(record.capturedAt),
    sourceQuoteLineId: text(record.sourceQuoteLineId) || null,
    sourceLineUpdatedAt: text(record.sourceLineUpdatedAt) || null,
    items,
  };
}

export function specificationForRevision(payload: unknown, revision: string | null | undefined): ArtworkSpecificationSnapshot | null {
  const record = recordValue(payload);
  if (!record) return null;
  const byRevision = recordValue(record.specificationByRevision);
  const revisionKey = text(revision) || "A";
  return readArtworkSpecificationSnapshot(byRevision?.[revisionKey])
    ?? readArtworkSpecificationSnapshot(record.specification);
}
