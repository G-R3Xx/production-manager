import "server-only";

import { pool } from "@production-manager/db";
import type { MaterialRecord } from "@/server/materials";
import type { SupplierRecord } from "@/server/suppliers";
import { buildXlsxWorkbook, parseXlsxWorkbook, type XlsxCell } from "@/server/xlsx-lite";

export type MaterialPriceSheetFormat = "production-manager-xlsx" | "production-manager" | "legacy-small-format" | "unknown";
export type MaterialPriceRowStatus = "change" | "unchanged" | "unmatched" | "ambiguous" | "invalid";
export type MaterialSheetOperation = "update" | "add" | "hide" | "delete" | "restore" | "none";

type NewMaterialRow = {
  materialGroup: string;
  supplierId: string | null;
  name: string;
  customerFacingName: string | null;
  sku: string | null;
  materialType: string;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: number;
  purchaseCost: number;
  widthMm: number | null;
  lengthMm: number | null;
  rollWidthMm: number | null;
  gsm: number | null;
  minimumBillableSheetFraction: number | null;
  rollBillingIncrementMetres: number | null;
  reversePrintable: boolean;
  usedForBacking: boolean;
  priceCheckedAt: string | null;
  notes: string | null;
};

export type MaterialPricePreviewRow = {
  rowNumber: number;
  sheetName?: string;
  sourceName: string;
  sourceSupplier: string | null;
  matchedMaterialId: string | null;
  matchedMaterialName: string | null;
  currentPurchaseCost: number | null;
  proposedPurchaseCost: number | null;
  priceCheckedAt: string | null;
  operation: MaterialSheetOperation;
  status: MaterialPriceRowStatus;
  note: string;
  newMaterial?: NewMaterialRow | null;
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
  addRows: number;
  hideRows: number;
  deleteRows: number;
  restoreRows: number;
  updateRows: number;
};

const GROUPS = [
  { key: "signage", sheet: "Signage", label: "Signage" },
  { key: "small-format", sheet: "Small Format", label: "Small Format" },
  { key: "plan-printing", sheet: "Plan Printing", label: "Plan Printing" },
  { key: "poster-printing", sheet: "Poster Printing", label: "Poster Printing" },
  { key: "shared", sheet: "Shared + Consumables", label: "Shared / Consumables" }
] as const;

function text(value: unknown): string { return String(value ?? "").trim(); }
function cleanNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/\s+/g, "").replace(/\$/g, "").replace(/,/g, "");
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}
function normalise(value: unknown): string {
  return text(value).toLowerCase().replace(/&/g, " and ").replace(/\bgram(?:s)?\b/g, "gsm").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function normaliseHeader(value: unknown): string { return normalise(value).replace(/\s/g, ""); }
function csvEscape(value: unknown): string { const raw = String(value ?? ""); return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; }
function boolValue(value: unknown): boolean {
  return ["1", "true", "yes", "y", "on"].includes(text(value).toLowerCase());
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char === '"') { if (csv[index + 1] === '"') { field += '"'; index += 1; } else quoted = false; }
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") { if (char === "\r" && csv[index + 1] === "\n") index += 1; row.push(field); field = ""; rows.push(row); row = []; }
    else field += char;
  }
  row.push(field); if (row.some((cell) => cell !== "")) rows.push(row); return rows;
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
  const purchaseUom = text(material.purchaseUom).toLowerCase(); const stockUom = text(material.stockUom).toLowerCase();
  if ((purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box") || purchaseUom.includes("bag")) && stockQuantity > 0) return purchaseCost / stockQuantity;
  if (purchaseUom.includes("roll") && stockQuantity > 0 && ["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(stockUom)) return purchaseCost / stockQuantity;
  return purchaseCost;
}
function priceCheckedAt(material: MaterialRecord): string { const value = text(material.costJson?.priceCheckedAt); return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""; }
function materialSheetState(material: MaterialRecord): string {
  if (material.active) return "Active";
  const state = text(material.costJson?.catalogSheetState).toLowerCase();
  if (state === "hidden") return "Hidden";
  if (state === "deleted") return "Deleted";
  return "Deleted / hidden";
}

const WORKBOOK_HEADERS = [
  "Action", "PM Material ID", "Status", "Internal Material Name", "Customer-facing Name", "Supplier", "PM Supplier ID", "SKU", "Material Type",
  "Purchase UOM", "Stock UOM", "Pack Qty / Roll Length", "Purchase Cost", "Calculated Unit Cost", "Width mm", "Length mm", "Roll Width mm", "GSM",
  "Minimum Billable Sheet Fraction", "Roll Billing Increment Metres", "Reverse Printable", "Used For Backing", "Price Checked", "Notes"
];

export function buildMaterialPriceWorkbook(materials: MaterialRecord[]): Buffer {
  const materialSheets = GROUPS.map((group) => {
    const rows: XlsxCell[][] = [
      [`${group.label} materials`],
      ["Edit Purchase Cost and Price Checked for existing rows. Add a new row with Action = ADD and leave PM Material ID blank."],
      ["Actions: ADD = create new material · HIDE = remove from normal selection but retain history · DELETE = archive/remove from normal lists (never hard-deletes historical records) · RESTORE = reactivate."],
      WORKBOOK_HEADERS
    ];
    materials.filter((material) => materialGroup(material) === group.key).forEach((material) => {
      rows.push([
        "", material.id, materialSheetState(material), material.name, material.customerFacingName ?? "", material.supplierName ?? "", material.supplierId ?? "", material.sku ?? "", material.materialType ?? "",
        material.purchaseUom ?? "", material.stockUom ?? "", cleanNumber(material.stockQuantity) ?? 0, Number(material.purchaseCost || 0), calculatedUnitCost(material), cleanNumber(material.widthMm) ?? "", cleanNumber(material.lengthMm) ?? "", cleanNumber(material.rollWidthMm) ?? "", cleanNumber(material.gsm) ?? "",
        cleanNumber(material.minimumBillableSheetFraction) ?? "", cleanNumber(material.rollBillingIncrementMetres) ?? "", material.reversePrintable ? "Yes" : "No", material.usedForBacking ? "Yes" : "No", priceCheckedAt(material), material.notes ?? ""
      ]);
    });
    // Give the user blank rows ready for ADD in Google Sheets.
    for (let i = 0; i < 12; i += 1) rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    return {
      name: group.sheet,
      rows,
      freezeRows: 4,
      headerRow: 4,
      moneyColumns: [12, 13],
      columnWidths: [12, 20, 14, 30, 28, 22, 20, 18, 18, 14, 14, 18, 15, 17, 12, 12, 14, 10, 18, 18, 16, 16, 16, 36]
    };
  });
  const instructions = {
    name: "Instructions",
    rows: [
      ["Production Manager material workbook"],
      ["Open this .xlsx in Google Sheets. Each department has its own tab."],
      ["Existing material: change Purchase Cost and/or Price Checked. Leave Action blank."],
      ["New material: use the correct department tab, add a row, set Action to ADD, leave PM Material ID blank, then complete at least Internal Material Name, Material Type, Purchase UOM, Stock UOM, Pack Qty / Roll Length and Purchase Cost."],
      ["Hide material: set Action to HIDE. Delete/archive: set Action to DELETE. Restore an inactive material: set Action to RESTORE."],
      ["DELETE is deliberately non-destructive: PM archives the material so old quotes, jobs and purchase records remain valid."],
      ["Supplier for a new material must match an existing PM supplier name exactly. Existing rows retain their current supplier."],
      ["When finished in Google Sheets: File → Download → Microsoft Excel (.xlsx), then upload that file to Production Manager and Preview before Apply."]
    ],
    freezeRows: 1,
    headerRow: 1,
    columnWidths: [105]
  };
  return buildXlsxWorkbook([instructions, ...materialSheets]);
}

// Retained for legacy/single-tab CSV workflows.
export function buildMaterialPriceSheetCsv(materials: MaterialRecord[], requestedGroup: string): string {
  const group = requestedGroup === "all" ? "all" : requestedGroup || "small-format";
  const filtered = materials.filter((material) => material.active && (group === "all" || materialGroup(material) === group));
  const headers = ["PM Material ID", "Material Group", "Internal Material Name", "Customer-facing Name", "Supplier", "SKU", "Purchase UOM", "Stock UOM", "Pack Qty / Roll Length", "Purchase Cost", "Calculated Unit Cost", "Price Checked", "Notes"];
  const rows = filtered.map((material) => [material.id, materialGroup(material), material.name, material.customerFacingName ?? "", material.supplierName ?? "", material.sku ?? "", material.purchaseUom ?? "", material.stockUom ?? "", material.stockQuantity ?? "", Number(material.purchaseCost || 0).toFixed(5), calculatedUnitCost(material).toFixed(5), priceCheckedAt(material), material.notes ?? ""]);
  const noteRows = [["Production Manager price update sheet"], ["Edit only Purchase Cost and optional Price Checked. Keep PM Material ID unchanged; other columns are reference values."], ["Purchase Cost is the cost for the saved Purchase UOM."], []];
  return [...noteRows, headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

function parseDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 1) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
  }
  const raw = text(value); if (!raw) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/); if (!match) return null;
  const day = Number(match[1]); const month = Number(match[2]); let year = Number(match[3]); if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day)); if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function tokenSet(value: string): Set<string> { const ignored = new Set(["gsm", "stock", "paper", "card", "sheet", "sheets", "the", "and", "fsc", "wrapped"]); return new Set(normalise(value).split(" ").filter((token) => token.length > 1 && !ignored.has(token))); }
function tokenSimilarity(left: string, right: string): number { const a = tokenSet(left); const b = tokenSet(right); if (!a.size || !b.size) return 0; let intersection = 0; for (const token of a) if (b.has(token)) intersection += 1; return intersection / Math.max(a.size, b.size); }
function gsmFrom(value: string): number | null { const match = normalise(value).match(/\b(\d{2,4})\s*gsm\b/) ?? normalise(value).match(/\b(\d{2,4})\b/); if (!match) return null; const amount = Number(match[1]); return Number.isFinite(amount) && amount >= 50 && amount <= 1000 ? amount : null; }
function candidateHaystack(material: MaterialRecord): string { return [material.name, material.customerFacingName, material.sku, material.supplierName, material.gsm, material.notes].filter(Boolean).join(" "); }
function legacyMatchScore(material: MaterialRecord, sourceName: string, supplier: string, brand: string): number {
  const sourceNorm = normalise(sourceName); const materialNorm = normalise(material.name); const customerNorm = normalise(material.customerFacingName); if (sourceNorm && (sourceNorm === materialNorm || sourceNorm === customerNorm)) return 1000;
  const haystack = candidateHaystack(material); const haystackNorm = normalise(haystack); let score = 0; if (sourceNorm.length >= 5 && (haystackNorm.includes(sourceNorm) || sourceNorm.includes(materialNorm))) score += 160;
  if (supplier && normalise(material.supplierName) === normalise(supplier)) score += 25; const sourceGsm = gsmFrom(`${sourceName} ${brand}`); const materialGsm = cleanNumber(material.gsm) ?? gsmFrom(haystack);
  if (sourceGsm && materialGsm) { if (Math.abs(sourceGsm - materialGsm) < 0.01) score += 45; else return -1000; }
  if (brand && normalise(brand).length >= 4) { if (haystackNorm.includes(normalise(brand))) score += 60; else return -1000; }
  score += tokenSimilarity(`${sourceName} ${brand}`, haystack) * 80; return score;
}
function proposePurchaseCostFromLegacyUnitPrice(material: MaterialRecord, sheetPrice: number): { value: number; note: string } {
  const purchaseUom = text(material.purchaseUom).toLowerCase(); const stockUom = text(material.stockUom).toLowerCase(); const quantity = Math.max(0, Number(material.stockQuantity || 0));
  if ((purchaseUom.includes("ream") || purchaseUom.includes("pack") || purchaseUom.includes("box")) && quantity > 0 && (stockUom.includes("sheet") || stockUom.includes("each"))) return { value: sheetPrice * quantity, note: `Legacy sheet price converted using PM's saved ${quantity} ${stockUom || "units"}/${purchaseUom}.` };
  if (purchaseUom.includes("roll") && quantity > 0 && ["lm", "m", "metre", "meter", "linear metre", "linear meter"].includes(stockUom)) return { value: sheetPrice * quantity, note: `Legacy unit price converted using PM's saved ${quantity}${stockUom}/${purchaseUom}.` };
  return { value: sheetPrice, note: `Legacy unit price used directly because PM purchases this material as ${purchaseUom || "a single unit"}.` };
}
function makePreview(rows: MaterialPricePreviewRow[], format: MaterialPriceSheetFormat): MaterialPriceSheetPreview {
  const count = (status: MaterialPriceRowStatus) => rows.filter((row) => row.status === status).length;
  const op = (operation: MaterialSheetOperation) => rows.filter((row) => row.status === "change" && row.operation === operation).length;
  return { format, rows, parsedRows: rows.length, matchedRows: rows.filter((row) => Boolean(row.matchedMaterialId)).length, changeRows: count("change"), unchangedRows: count("unchanged"), unmatchedRows: count("unmatched"), ambiguousRows: count("ambiguous"), invalidRows: count("invalid"), addRows: op("add"), hideRows: op("hide"), deleteRows: op("delete"), restoreRows: op("restore"), updateRows: op("update") };
}

function previewProductionManagerSheet(rows: string[][], materials: MaterialRecord[]): MaterialPriceSheetPreview {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normaliseHeader(cell) === "pmmaterialid")); if (headerIndex < 0) return makePreview([], "unknown");
  const headers = rows[headerIndex].map(normaliseHeader); const indexOf = (...keys: string[]) => headers.findIndex((header) => keys.includes(header));
  const idIndex = indexOf("pmmaterialid", "materialid"); const nameIndex = indexOf("internalmaterialname", "materialname", "stocktype"); const costIndex = indexOf("purchasecost", "cost"); const checkedIndex = indexOf("pricechecked", "pricecheckedat", "checked"); const materialMap = new Map(materials.map((material) => [material.id, material]));
  const previewRows: MaterialPricePreviewRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]; const id = text(row[idIndex]); if (!id && !row.some((cell) => text(cell))) continue; const material = materialMap.get(id); const proposed = cleanNumber(row[costIndex]); const sourceName = text(row[nameIndex]) || material?.name || `Row ${rowIndex + 1}`; const checked = parseDate(row[checkedIndex]);
    if (!material) { previewRows.push({ rowNumber: rowIndex + 1, sourceName, sourceSupplier: null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "unmatched", note: "PM Material ID was not found in this workspace. Download a fresh workbook before importing." }); continue; }
    if (proposed == null || proposed < 0) { previewRows.push({ rowNumber: rowIndex + 1, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: Number(material.purchaseCost || 0), proposedPurchaseCost: null, priceCheckedAt: checked, operation: "none", status: "invalid", note: "Purchase Cost is blank or invalid." }); continue; }
    const current = Number(material.purchaseCost || 0); const changed = Math.abs(current - proposed) > 0.000001 || Boolean(checked && checked !== priceCheckedAt(material));
    previewRows.push({ rowNumber: rowIndex + 1, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: current, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: changed ? "update" : "none", status: changed ? "change" : "unchanged", note: changed ? "Matched by PM Material ID." : "No price/date change." });
  }
  return makePreview(previewRows, "production-manager");
}

function defaultMaterialType(group: string): string { if (group === "small-format" || group === "plan-printing" || group === "poster-printing") return "paper_stock"; if (group === "signage") return "sheet_media"; return "item"; }
function defaultStockUom(type: string): string { if (["roll_media", "roll_laminate", "cello_stock", "roll"].includes(type)) return "lm"; if (["paper_stock", "card_stock", "sheet_media", "paper", "sheet"].includes(type)) return "sheet"; return "each"; }
function defaultPurchaseUom(type: string): string { if (["roll_media", "roll_laminate", "cello_stock", "roll"].includes(type)) return "roll"; if (["paper_stock", "card_stock", "paper"].includes(type)) return "ream"; if (["sheet_media", "sheet"].includes(type)) return "sheet"; return "box"; }
function normalizeAction(value: unknown): string { return text(value).toUpperCase().replace(/\s+/g, " "); }
function groupFromSheet(name: string): string | null { const norm = normalise(name).replace(/ /g, "-"); const found = GROUPS.find((item) => normalise(item.sheet).replace(/ /g, "-") === norm); return found?.key ?? null; }
function findHeader(rows: XlsxCell[][]): number { return rows.findIndex((row) => row.some((cell) => normaliseHeader(cell) === "pmmaterialid") && row.some((cell) => normaliseHeader(cell) === "action")); }

export function previewMaterialPriceWorkbook(buffer: Buffer, materials: MaterialRecord[], suppliers: SupplierRecord[]): MaterialPriceSheetPreview {
  const workbook = parseXlsxWorkbook(buffer); const materialMap = new Map(materials.map((m) => [m.id, m]));
  const suppliersByName = new Map<string, SupplierRecord[]>(); suppliers.forEach((s) => { const key = normalise(s.displayName); suppliersByName.set(key, [...(suppliersByName.get(key) ?? []), s]); });
  const previewRows: MaterialPricePreviewRow[] = [];

  for (const sheet of workbook) {
    const group = groupFromSheet(sheet.name); if (!group) continue; const headerIndex = findHeader(sheet.rows); if (headerIndex < 0) continue;
    const headers = sheet.rows[headerIndex].map(normaliseHeader); const idx = (...keys: string[]) => headers.findIndex((header) => keys.includes(header));
    const actionIndex = idx("action"); const idIndex = idx("pmmaterialid", "materialid"); const nameIndex = idx("internalmaterialname", "materialname"); const customerIndex = idx("customerfacingname"); const supplierIndex = idx("supplier"); const supplierIdIndex = idx("pmsupplierid"); const skuIndex = idx("sku"); const typeIndex = idx("materialtype"); const purchaseUomIndex = idx("purchaseuom"); const stockUomIndex = idx("stockuom"); const qtyIndex = idx("packqtyrolllength", "stockquantity"); const costIndex = idx("purchasecost"); const widthIndex = idx("widthmm"); const lengthIndex = idx("lengthmm"); const rollWidthIndex = idx("rollwidthmm"); const gsmIndex = idx("gsm"); const sheetFractionIndex = idx("minimumbillablesheetfraction"); const rollIncrementIndex = idx("rollbillingincrementmetres"); const reverseIndex = idx("reverseprintable"); const backingIndex = idx("usedforbacking"); const checkedIndex = idx("pricechecked", "pricecheckedat"); const notesIndex = idx("notes");

    for (let rowIndex = headerIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex]; const id = idIndex >= 0 ? text(row[idIndex]) : ""; const name = nameIndex >= 0 ? text(row[nameIndex]) : ""; const action = actionIndex >= 0 ? normalizeAction(row[actionIndex]) : "";
      if (!id && !name && !action && !row.some((cell) => text(cell))) continue;
      const material = id ? materialMap.get(id) : undefined; const proposed = costIndex >= 0 ? cleanNumber(row[costIndex]) : null; const checked = checkedIndex >= 0 ? parseDate(row[checkedIndex]) : null; const sourceName = name || material?.name || `Row ${rowIndex + 1}`; const rowNumber = rowIndex + 1;

      if (id) {
        if (!material) { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName, sourceSupplier: supplierIndex >= 0 ? text(row[supplierIndex]) || null : null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "unmatched", note: "PM Material ID was not found. Download a fresh workbook." }); continue; }
        if (action === "ADD") { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: Number(material.purchaseCost || 0), proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "invalid", note: "ADD is only for a new row with a blank PM Material ID." }); continue; }
        if (["HIDE", "DELETE", "RESTORE"].includes(action)) {
          const operation = action.toLowerCase() as "hide" | "delete" | "restore"; const already = operation === "restore" ? material.active : !material.active;
          previewRows.push({ rowNumber, sheetName: sheet.name, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: Number(material.purchaseCost || 0), proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: already ? "none" : operation, status: already ? "unchanged" : "change", note: already ? `Material is already ${operation === "restore" ? "active" : "inactive"}.` : operation === "delete" ? "Will archive this material. Historical quotes/jobs remain intact." : operation === "hide" ? "Will hide this material from normal active material selection." : "Will restore this material to active use." });
          continue;
        }
        if (action && action !== "UPDATE" && action !== "KEEP") { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: Number(material.purchaseCost || 0), proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "invalid", note: `Unknown Action '${action}'. Use ADD, HIDE, DELETE, RESTORE, UPDATE or leave blank.` }); continue; }
        if (proposed == null || proposed < 0) { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: Number(material.purchaseCost || 0), proposedPurchaseCost: null, priceCheckedAt: checked, operation: "none", status: "invalid", note: "Purchase Cost is blank or invalid." }); continue; }
        const current = Number(material.purchaseCost || 0); const changed = Math.abs(current - proposed) > 0.000001 || Boolean(checked && checked !== priceCheckedAt(material));
        previewRows.push({ rowNumber, sheetName: sheet.name, sourceName, sourceSupplier: material.supplierName, matchedMaterialId: material.id, matchedMaterialName: material.name, currentPurchaseCost: current, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: changed ? "update" : "none", status: changed ? "change" : "unchanged", note: changed ? "Will update price/date by stable PM Material ID." : "No price/date change." });
        continue;
      }

      if (!name && !action) continue;
      if (action !== "ADD") { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName: name || `Row ${rowNumber}`, sourceSupplier: supplierIndex >= 0 ? text(row[supplierIndex]) || null : null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "invalid", note: "New rows must have Action = ADD and a blank PM Material ID." }); continue; }
      if (!name) { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName: `Row ${rowNumber}`, sourceSupplier: null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "invalid", note: "Internal Material Name is required for ADD." }); continue; }
      if (proposed == null || proposed < 0) { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName: name, sourceSupplier: supplierIndex >= 0 ? text(row[supplierIndex]) || null : null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: null, priceCheckedAt: checked, operation: "none", status: "invalid", note: "Purchase Cost is required for ADD." }); continue; }
      const supplierName = supplierIndex >= 0 ? text(row[supplierIndex]) : ""; const supplierIdFromSheet = supplierIdIndex >= 0 ? text(row[supplierIdIndex]) : ""; let supplierId: string | null = null;
      if (supplierIdFromSheet && suppliers.some((s) => s.id === supplierIdFromSheet)) supplierId = supplierIdFromSheet;
      else if (supplierName) { const matches = suppliersByName.get(normalise(supplierName)) ?? []; if (matches.length === 1) supplierId = matches[0].id; else { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName: name, sourceSupplier: supplierName, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "invalid", note: matches.length > 1 ? "Supplier name matches more than one PM supplier." : "Supplier name was not found in PM. Add/select the supplier in PM first, or leave Supplier blank." }); continue; } }
      const materialType = text(typeIndex >= 0 ? row[typeIndex] : "") || defaultMaterialType(group); const stockUom = text(stockUomIndex >= 0 ? row[stockUomIndex] : "") || defaultStockUom(materialType); const purchaseUom = text(purchaseUomIndex >= 0 ? row[purchaseUomIndex] : "") || defaultPurchaseUom(materialType); const stockQuantity = cleanNumber(qtyIndex >= 0 ? row[qtyIndex] : "") ?? 1;
      if (stockQuantity <= 0) { previewRows.push({ rowNumber, sheetName: sheet.name, sourceName: name, sourceSupplier: supplierName || null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "none", status: "invalid", note: "Pack Qty / Roll Length must be greater than zero." }); continue; }
      const newMaterial: NewMaterialRow = { materialGroup: group, supplierId, name, customerFacingName: text(customerIndex >= 0 ? row[customerIndex] : "") || null, sku: text(skuIndex >= 0 ? row[skuIndex] : "") || null, materialType, stockUom, purchaseUom, stockQuantity, purchaseCost: proposed, widthMm: cleanNumber(widthIndex >= 0 ? row[widthIndex] : ""), lengthMm: cleanNumber(lengthIndex >= 0 ? row[lengthIndex] : ""), rollWidthMm: cleanNumber(rollWidthIndex >= 0 ? row[rollWidthIndex] : ""), gsm: cleanNumber(gsmIndex >= 0 ? row[gsmIndex] : ""), minimumBillableSheetFraction: cleanNumber(sheetFractionIndex >= 0 ? row[sheetFractionIndex] : ""), rollBillingIncrementMetres: cleanNumber(rollIncrementIndex >= 0 ? row[rollIncrementIndex] : ""), reversePrintable: boolValue(reverseIndex >= 0 ? row[reverseIndex] : false), usedForBacking: boolValue(backingIndex >= 0 ? row[backingIndex] : false), priceCheckedAt: checked, notes: text(notesIndex >= 0 ? row[notesIndex] : "") || null };
      previewRows.push({ rowNumber, sheetName: sheet.name, sourceName: name, sourceSupplier: supplierName || null, matchedMaterialId: null, matchedMaterialName: "New material", currentPurchaseCost: null, proposedPurchaseCost: proposed, priceCheckedAt: checked, operation: "add", status: "change", note: `Will create as ${group.replace(/-/g, " ")} / ${materialType}.`, newMaterial });
    }
  }
  return makePreview(previewRows, "production-manager-xlsx");
}

function previewLegacySheet(rows: string[][], materials: MaterialRecord[]): MaterialPriceSheetPreview {
  const smallFormat = materials.filter((material) => material.active && materialGroup(material) === "small-format"); const previewRows: MaterialPricePreviewRow[] = []; let blankRun = 0; let seenStockHeader = false;
  rows.forEach((row, zeroIndex) => { const rowNumber = zeroIndex + 1; const sourceName = text(row[0]); const sheetPrice = cleanNumber(row[1]); const supplier = text(row[2]); const brand = text(row[5]); const checked = parseDate(row[6]); const firstHeader = normaliseHeader(row[0]); const secondHeader = normaliseHeader(row[1]);
    if (!row.some((cell) => text(cell))) { blankRun += 1; if (blankRun >= 5) seenStockHeader = false; return; } blankRun = 0; if (firstHeader === "stocktype" && secondHeader.includes("sheetprice")) { seenStockHeader = true; return; } if (!seenStockHeader || !sourceName || sheetPrice == null || sheetPrice <= 0) return;
    const scored = smallFormat.map((material) => ({ material, score: legacyMatchScore(material, sourceName, supplier, brand) })).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score); const best = scored[0]; const second = scored[1];
    if (!best || best.score < 70) { previewRows.push({ rowNumber, sourceName, sourceSupplier: supplier || null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: sheetPrice, priceCheckedAt: checked, operation: "none", status: "unmatched", note: "No safe automatic PM material match. Download the PM workbook for guaranteed matching." }); return; }
    if (second && best.score - second.score < 18 && second.score >= 70) { previewRows.push({ rowNumber, sourceName, sourceSupplier: supplier || null, matchedMaterialId: null, matchedMaterialName: null, currentPurchaseCost: null, proposedPurchaseCost: sheetPrice, priceCheckedAt: checked, operation: "none", status: "ambiguous", note: `Could match either ${best.material.name} or ${second.material.name}; skipped for safety.` }); return; }
    const conversion = proposePurchaseCostFromLegacyUnitPrice(best.material, sheetPrice); const current = Number(best.material.purchaseCost || 0); const changed = Math.abs(current - conversion.value) > 0.000001 || Boolean(checked && checked !== priceCheckedAt(best.material)); previewRows.push({ rowNumber, sourceName, sourceSupplier: supplier || null, matchedMaterialId: best.material.id, matchedMaterialName: best.material.name, currentPurchaseCost: current, proposedPurchaseCost: conversion.value, priceCheckedAt: checked, operation: changed ? "update" : "none", status: changed ? "change" : "unchanged", note: `${conversion.note} Match score ${Math.round(best.score)}.` });
  }); return makePreview(previewRows, "legacy-small-format");
}

export function previewMaterialPriceSheet(csv: string, materials: MaterialRecord[]): MaterialPriceSheetPreview {
  const rows = parseCsv(csv.replace(/^\uFEFF/, "")); if (!rows.length) return makePreview([], "unknown"); const pmPreview = previewProductionManagerSheet(rows, materials); if (pmPreview.format === "production-manager") return pmPreview;
  const hasLegacyHeader = rows.some((row) => normaliseHeader(row[0]) === "stocktype" && normaliseHeader(row[1]).includes("sheetprice")); if (hasLegacyHeader) return previewLegacySheet(rows, materials); return makePreview([], "unknown");
}

function normalizeMaterialType(value: string): string { switch (value) { case "sheet": return "sheet_media"; case "roll": return "roll_media"; case "paper": return "paper_stock"; case "hardware": return "fixing"; case "consumable": return "item"; default: return value || "other"; } }
function legacyMaterialType(value: string): string { const normalized = normalizeMaterialType(value); const allowed = new Set(["sheet_media", "roll_media", "roll_laminate", "card_stock", "paper_stock", "cello_stock", "binding", "finishing", "fixing", "item", "other"]); return allowed.has(normalized) ? normalized : "other"; }

export async function bulkApplyMaterialSheet(tenantId: string, preview: MaterialPriceSheetPreview, sourceLabel: string): Promise<{ updatedIds: string[]; createdIds: string[]; hidden: number; deleted: number; restored: number }> {
  const changes = preview.rows.filter((row) => row.status === "change"); if (!changes.length) return { updatedIds: [], createdIds: [], hidden: 0, deleted: 0, restored: 0 }; if (changes.length > 500) throw new Error("Material workbook contains too many changes. Split the update into smaller files.");
  const client = await pool.connect(); const updatedIds: string[] = []; const createdIds: string[] = []; let hidden = 0; let deleted = 0; let restored = 0;
  try {
    await client.query("BEGIN");
    for (const row of changes) {
      if (row.operation === "add" && row.newMaterial) {
        const m = row.newMaterial; const result = await client.query<{ id: string }>(`
          INSERT INTO catalog.materials (tenant_id,supplier_id,source_product_id,name,customer_facing_name,sku,type,material_type,material_group,minimum_billable_sheet_fraction,roll_billing_increment_metres,reverse_printable,used_for_backing,stock_uom,purchase_uom,stock_quantity,purchase_cost,width_mm,length_mm,roll_width_mm,gsm,notes,cost_json,active,created_at,updated_at)
          VALUES ($1::uuid,$2::uuid,null,$3::varchar,$4::varchar,$5::varchar,$6::material_type,$7::varchar,$8::varchar,$9::numeric,$10::numeric,$11::boolean,$12::boolean,$13::varchar,$14::varchar,$15::numeric,$16::numeric,$17::numeric,$18::numeric,$19::numeric,$20::numeric,$21::varchar,jsonb_build_object('purchaseCost',$16::numeric,'priceSheetSource',$22::text)||CASE WHEN $23::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('priceCheckedAt',$23::text) END,true,now(),now()) RETURNING id
        `, [tenantId, m.supplierId, m.name, m.customerFacingName, m.sku, legacyMaterialType(m.materialType), normalizeMaterialType(m.materialType), m.materialGroup, m.minimumBillableSheetFraction, m.rollBillingIncrementMetres, m.reversePrintable, m.usedForBacking, m.stockUom, m.purchaseUom, m.stockQuantity, m.purchaseCost, m.widthMm, m.lengthMm, m.rollWidthMm, m.gsm, m.notes, sourceLabel, m.priceCheckedAt]);
        if (result.rows[0]?.id) createdIds.push(result.rows[0].id); continue;
      }
      if (!row.matchedMaterialId) continue;
      if (row.operation === "hide" || row.operation === "delete") {
        await client.query(`UPDATE catalog.materials SET active=false, cost_json=COALESCE(cost_json,'{}'::jsonb)||jsonb_build_object('catalogSheetState',$3::text,'catalogSheetSource',$4::text), updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, row.matchedMaterialId, row.operation === "hide" ? "hidden" : "deleted", sourceLabel]);
        if (row.operation === "hide") hidden += 1; else deleted += 1; updatedIds.push(row.matchedMaterialId); continue;
      }
      if (row.operation === "restore") {
        await client.query(`UPDATE catalog.materials SET active=true, cost_json=(COALESCE(cost_json,'{}'::jsonb)-'catalogSheetState')||jsonb_build_object('catalogSheetSource',$3::text), updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, row.matchedMaterialId, sourceLabel]); restored += 1; updatedIds.push(row.matchedMaterialId); continue;
      }
      if (row.operation === "update" && row.proposedPurchaseCost != null) {
        await client.query(`UPDATE catalog.materials SET purchase_cost=$3::numeric,cost_json=COALESCE(cost_json,'{}'::jsonb)||jsonb_build_object('purchaseCost',$3::numeric)||CASE WHEN $4::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('priceCheckedAt',$4::text) END||jsonb_build_object('priceSheetSource',$5::text),updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, row.matchedMaterialId, row.proposedPurchaseCost, row.priceCheckedAt, sourceLabel]); updatedIds.push(row.matchedMaterialId);
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  return { updatedIds: [...new Set(updatedIds)], createdIds, hidden, deleted, restored };
}

export async function bulkUpdateMaterialPrices(tenantId: string, preview: MaterialPriceSheetPreview, sourceLabel: string): Promise<string[]> {
  const result = await bulkApplyMaterialSheet(tenantId, preview, sourceLabel); return result.updatedIds;
}
