import "server-only";

import { pool } from "@production-manager/db";
import type { MaterialRecord } from "@/server/materials";

export type MaterialPriceSheetFormat = "production-manager" | "legacy-small-format" | "unknown";
export type MaterialPriceRowStatus = "change" | "unchanged" | "unmatched" | "ambiguous" | "invalid";

export type MaterialPricePreviewRow = {
  rowNumber: number;
  sourceName: string;
  sourceSupplier: string | null;
  matchedMaterialId: string | null;
  matchedMaterialName: string | null;
  currentPurchaseCost: number | null;
  proposedPurchaseCost: number | null;
  priceCheckedAt: string | null;
  status: MaterialPriceRowStatus;
  note: string;
};

export type MaterialPriceSheetPreview = {
  format: MaterialPriceSheetFormat;
  rows: MaterialPricePreviewRow[];
  parsedRows: number;
  matchedRows: number;
  changeRows: number;
  unchangedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  invalidRows: number;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanNumber(value: unknown): number | null {
  const raw = text(value).replace(/\s+/g, "").replace(/\$/g, "").replace(/,/g, "");
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalise(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bgram(?:s)?\b/g, "gsm")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseHeader(value: unknown): string {
  return normalise(value).replace(/\s/g, "");
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? "");
  if (!/[",\r\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function materialGroup(material: MaterialRecord): string {
  const explicit = text(material.materialGroup).toLowerCase().replace(/_/g, "-");
  if (explicit) return explicit;
  const type = text(material.materialType).toLowerCase();
  if (["paper", "paper_stock", "card stock", "card_stock", "cello_stock", "binding"].includes(type)) return "small-format";
  if (["sheet", "sheet_media", "roll", "roll_media", "roll_laminate"].includes(type)) return "signage";
  return "shared";
}

function calculatedUnitCost(material: MaterialRecord): number {
  const purchaseCost = Math.max(0, Number(material.purchaseCost || 0));
  const stockQuantity = Math.max(0, Number(material.stockQuantity || 0));
  const purchaseUom = text(material.purchaseUom).toLowerCase();
  const stockUom = text(material.stockUom).toLowerCase();

  if ((purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box") || purchaseUom.includes("bag")) && stockQuantity > 0) {
    return purchaseCost / stockQuantity;
  }
  if (purchaseUom.includes("roll") && stockQuantity > 0 && ["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(stockUom)) {
    return purchaseCost / stockQuantity;
  }
  return purchaseCost;
}

function priceCheckedAt(material: MaterialRecord): string {
  const value = text(material.costJson?.priceCheckedAt);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function buildMaterialPriceSheetCsv(materials: MaterialRecord[], requestedGroup: string): string {
  const group = requestedGroup === "all" ? "all" : requestedGroup || "small-format";
  const filtered = materials.filter((material) => material.active && (group === "all" || materialGroup(material) === group));
  const headers = [
    "PM Material ID",
    "Material Group",
    "Internal Material Name",
    "Customer-facing Name",
    "Supplier",
    "SKU",
    "Purchase UOM",
    "Stock UOM",
    "Pack Qty / Roll Length",
    "Purchase Cost",
    "Calculated Unit Cost",
    "Price Checked",
    "Notes"
  ];

  const rows = filtered.map((material) => [
    material.id,
    materialGroup(material),
    material.name,
    material.customerFacingName ?? "",
    material.supplierName ?? "",
    material.sku ?? "",
    material.purchaseUom ?? "",
    material.stockUom ?? "",
    material.stockQuantity ?? "",
    Number(material.purchaseCost || 0).toFixed(5),
    calculatedUnitCost(material).toFixed(5),
    priceCheckedAt(material),
    material.notes ?? ""
  ]);

  const noteRows = [
    ["Production Manager price update sheet"],
    ["Edit only Purchase Cost and optional Price Checked. Keep PM Material ID unchanged; other columns are reference values."],
    ["Purchase Cost is the cost for the saved Purchase UOM. For example: $53.75 per ream of 1000 sheets, not $0.05375 per sheet."],
    []
  ];

  return [...noteRows, headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

function parseDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function tokenSet(value: string): Set<string> {
  const ignored = new Set(["gsm", "stock", "paper", "card", "sheet", "sheets", "the", "and", "fsc", "wrapped"]);
  return new Set(normalise(value).split(" ").filter((token) => token.length > 1 && !ignored.has(token)));
}

function tokenSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.max(a.size, b.size);
}

function gsmFrom(value: string): number | null {
  const match = normalise(value).match(/\b(\d{2,4})\s*gsm\b/) ?? normalise(value).match(/\b(\d{2,4})\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount >= 50 && amount <= 1000 ? amount : null;
}

function candidateHaystack(material: MaterialRecord): string {
  return [material.name, material.customerFacingName, material.sku, material.supplierName, material.gsm, material.notes]
    .filter(Boolean)
    .join(" ");
}

function legacyMatchScore(material: MaterialRecord, sourceName: string, supplier: string, brand: string): number {
  const sourceNorm = normalise(sourceName);
  const materialNorm = normalise(material.name);
  const customerNorm = normalise(material.customerFacingName);
  if (sourceNorm && (sourceNorm === materialNorm || sourceNorm === customerNorm)) return 1000;

  const haystack = candidateHaystack(material);
  const haystackNorm = normalise(haystack);
  let score = 0;
  if (sourceNorm.length >= 5 && (haystackNorm.includes(sourceNorm) || sourceNorm.includes(materialNorm))) score += 160;
  if (supplier && normalise(material.supplierName) === normalise(supplier)) score += 25;
  const sourceGsm = gsmFrom(`${sourceName} ${brand}`);
  const materialGsm = cleanNumber(material.gsm) ?? gsmFrom(haystack);
  if (sourceGsm && materialGsm) {
    if (Math.abs(sourceGsm - materialGsm) < 0.01) score += 45;
    else return -1000;
  }
  if (brand && normalise(brand).length >= 4) {
    if (haystackNorm.includes(normalise(brand))) score += 60;
    else return -1000;
  }
  score += tokenSimilarity(`${sourceName} ${brand}`, haystack) * 80;
  return score;
}

function proposePurchaseCostFromLegacyUnitPrice(material: MaterialRecord, sheetPrice: number): { value: number; note: string } {
  const purchaseUom = text(material.purchaseUom).toLowerCase();
  const stockUom = text(material.stockUom).toLowerCase();
  const quantity = Math.max(0, Number(material.stockQuantity || 0));

  if ((purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box")) && quantity > 0 && (stockUom.includes("sheet") || stockUom.includes("each"))) {
    return { value: sheetPrice * quantity, note: `Legacy sheet price converted using PM's saved ${quantity} ${stockUom || "units"}/${purchaseUom}.` };
  }
  if (purchaseUom.includes("roll") && quantity > 0 && ["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(stockUom)) {
    return { value: sheetPrice * quantity, note: `Legacy unit price converted using PM's saved ${quantity}${stockUom}/${purchaseUom}.` };
  }
  return { value: sheetPrice, note: `Legacy unit price used directly because PM purchases this material as ${purchaseUom || "a single unit"}.` };
}

function makePreview(rows: MaterialPricePreviewRow[], format: MaterialPriceSheetFormat): MaterialPriceSheetPreview {
  const count = (status: MaterialPriceRowStatus) => rows.filter((row) => row.status === status).length;
  return {
    format,
    rows,
    parsedRows: rows.length,
    matchedRows: rows.filter((row) => Boolean(row.matchedMaterialId)).length,
    changeRows: count("change"),
    unchangedRows: count("unchanged"),
    unmatchedRows: count("unmatched"),
    ambiguousRows: count("ambiguous"),
    invalidRows: count("invalid")
  };
}

function previewProductionManagerSheet(rows: string[][], materials: MaterialRecord[]): MaterialPriceSheetPreview {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normaliseHeader(cell) === "pmmaterialid"));
  if (headerIndex < 0) return makePreview([], "unknown");
  const headers = rows[headerIndex].map(normaliseHeader);
  const indexOf = (...keys: string[]) => headers.findIndex((header) => keys.includes(header));
  const idIndex = indexOf("pmmaterialid", "materialid");
  const nameIndex = indexOf("internalmaterialname", "materialname", "stocktype");
  const costIndex = indexOf("purchasecost", "cost");
  const checkedIndex = indexOf("pricechecked", "pricecheckedat", "checked");
  const materialMap = new Map(materials.map((material) => [material.id, material]));

  const previewRows: MaterialPricePreviewRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const id = text(row[idIndex]);
    if (!id && !row.some((cell) => text(cell))) continue;
    const material = materialMap.get(id);
    const proposed = cleanNumber(row[costIndex]);
    const sourceName = text(row[nameIndex]) || material?.name || `Row ${rowIndex + 1}`;
    const checked = parseDate(row[checkedIndex]);

    if (!material) {
      previewRows.push({ rowNumber: rowIndex + 1, sourceName, sourceSupplier: null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, status: "unmatched", note: "PM Material ID was not found in this workspace. Download a fresh sheet before importing." });
      continue;
    }
    if (proposed == null || proposed < 0) {
      previewRows.push({ rowNumber: rowIndex + 1, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: Number(material.purchaseCost || 0), proposedPurchaseCost: null, priceCheckedAt: checked, status: "invalid", note: "Purchase Cost is blank or invalid." });
      continue;
    }
    const current = Number(material.purchaseCost || 0);
    const changed = Math.abs(current - proposed) > 0.000001 || (checked && checked !== priceCheckedAt(material));
    previewRows.push({ rowNumber: rowIndex + 1, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: current, proposedPurchaseCost: proposed, priceCheckedAt: checked, status: changed ? "change" : "unchanged", note: changed ? "Matched by PM Material ID." : "No price/date change." });
  }
  return makePreview(previewRows, "production-manager");
}

function previewLegacySheet(rows: string[][], materials: MaterialRecord[]): MaterialPriceSheetPreview {
  const smallFormat = materials.filter((material) => material.active && materialGroup(material) === "small-format");
  const previewRows: MaterialPricePreviewRow[] = [];
  let blankRun = 0;
  let seenStockHeader = false;

  rows.forEach((row, zeroIndex) => {
    const rowNumber = zeroIndex + 1;
    const sourceName = text(row[0]);
    const sheetPrice = cleanNumber(row[1]);
    const supplier = text(row[2]);
    const brand = text(row[5]);
    const checked = parseDate(row[6]);
    const firstHeader = normaliseHeader(row[0]);
    const secondHeader = normaliseHeader(row[1]);

    if (!row.some((cell) => text(cell))) {
      blankRun += 1;
      if (blankRun >= 5) seenStockHeader = false;
      return;
    }
    blankRun = 0;
    if (firstHeader === "stocktype" && secondHeader.includes("sheetprice")) {
      seenStockHeader = true;
      return;
    }
    if (!seenStockHeader || !sourceName || sheetPrice == null || sheetPrice <= 0) return;

    const scored = smallFormat
      .map((material) => ({ material, score: legacyMatchScore(material, sourceName, supplier, brand) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];
    if (!best || best.score < 70) {
      previewRows.push({ rowNumber, sourceName, sourceSupplier: supplier || null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: sheetPrice, priceCheckedAt: checked, status: "unmatched", note: "No safe automatic PM material match. Download the PM price sheet for guaranteed matching." });
      return;
    }
    if (second && best.score - second.score < 18 && second.score >= 70) {
      previewRows.push({ rowNumber, sourceName, sourceSupplier: supplier || null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: sheetPrice, priceCheckedAt: checked, status: "ambiguous", note: `Could match either ${best.material.name} or ${second.material.name}; skipped for safety.` });
      return;
    }

    const conversion = proposePurchaseCostFromLegacyUnitPrice(best.material, sheetPrice);
    const current = Number(best.material.purchaseCost || 0);
    const changed = Math.abs(current - conversion.value) > 0.000001 || (checked && checked !== priceCheckedAt(best.material));
    previewRows.push({ rowNumber, sourceName, sourceSupplier: supplier || null, matchedMaterialId: best.material.id, matchedMaterialName: best.material.name, currentPurchaseCost: current, proposedPurchaseCost: conversion.value, priceCheckedAt: checked, status: changed ? "change" : "unchanged", note: `${conversion.note} Match score ${Math.round(best.score)}.` });
  });

  return makePreview(previewRows, "legacy-small-format");
}

export function previewMaterialPriceSheet(csv: string, materials: MaterialRecord[]): MaterialPriceSheetPreview {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  if (!rows.length) return makePreview([], "unknown");
  const pmPreview = previewProductionManagerSheet(rows, materials);
  if (pmPreview.format === "production-manager") return pmPreview;

  const hasLegacyHeader = rows.some((row) => normaliseHeader(row[0]) === "stocktype" && normaliseHeader(row[1]).includes("sheetprice"));
  if (hasLegacyHeader) return previewLegacySheet(rows, materials);
  return makePreview([], "unknown");
}

export async function bulkUpdateMaterialPrices(tenantId: string, preview: MaterialPriceSheetPreview, sourceLabel: string): Promise<string[]> {
  const changes = preview.rows.filter((row) => row.status === "change" && row.matchedMaterialId && row.proposedPurchaseCost != null);
  if (!changes.length) return [];
  if (changes.length > 500) throw new Error("Price sheet contains too many changes. Split the update into smaller files.");

  const client = await pool.connect();
  const updatedIds: string[] = [];
  try {
    await client.query("BEGIN");
    for (const row of changes) {
      const checked = row.priceCheckedAt;
      const result = await client.query<{ id: string }>(`
        UPDATE catalog.materials
        SET purchase_cost = $3::numeric,
            cost_json = COALESCE(cost_json, '{}'::jsonb)
              || jsonb_build_object('purchaseCost', $3::numeric)
              || CASE WHEN $4::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('priceCheckedAt', $4::text) END
              || jsonb_build_object('priceSheetSource', $5::text),
            updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        RETURNING id
      `, [tenantId, row.matchedMaterialId, row.proposedPurchaseCost, checked, sourceLabel]);
      if (result.rows[0]?.id) updatedIds.push(result.rows[0].id);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return updatedIds;
}
