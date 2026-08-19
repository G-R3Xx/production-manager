import "server-only";

import { pool } from "@production-manager/db";

export type ProductionJobRecord = {
  id: string;
  tenantId: string;
  artworkApprovalId: string | null;
  quoteId: string;
  quoteNumber: string | null;
  clientName: string;
  contactName: string | null;
  projectName: string | null;
  status: string;
  dispatchType: string | null;
  priority: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  internalNotes: string | null;
  linkedCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductionItemRecord = {
  id: string;
  jobId: string;
  artworkPageId: string | null;
  sourceQuoteLineId: string | null;
  itemCode: string | null;
  title: string;
  productionType: string;
  quantity: string;
  sizeSummary: string | null;
  substrateSummary: string | null;
  colourSummary: string | null;
  finishingSummary: string | null;
  proofImageUrl: string | null;
  proofFileName: string | null;
  selectedImageUrl: string | null;
  selectedImageAlt: string | null;
  printReadyUrl: string | null;
  printReadyStoragePath: string | null;
  printReadyFileName: string | null;
  printReadyFileType: string | null;
  printReadyNotes: string | null;
  printReadyUploadedAt: string | null;
  printReadyUploadedBy: string | null;
  artworkFiles: Array<{ name: string; downloadUrl: string; mime?: string | null; size?: number | null }>;
  quoteProductName: string | null;
  quoteOptionSummary: string | null;
  quoteLineNotes: string | null;
  quoteLineTotal: string | null;
  websitePaymentMethod: string | null;
  websitePaymentTitle: string | null;
  websiteAccountTerms: string | null;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductionStepRecord = {
  id: string;
  jobId: string;
  itemId: string | null;
  label: string;
  stepType: string;
  status: string;
  checkedAt: string | null;
  checkedBy: string | null;
  notes: string | null;
  assigneeProfileIds: string[];
  dueDate: string | null;
  assignmentSource: "inherited" | "manual" | string;
  assignmentProcessKey: "production" | "dispatch" | string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductionJobStepSummary = {
  jobId: string;
  currentStep: string;
  stepsDone: number;
  stepsTotal: number;
};

export type ApprovedArtworkOptionRecord = {
  approvalId: string;
  quoteId: string;
  quoteNumber: string | null;
  clientName: string;
  projectName: string | null;
  approvedAt: string | null;
  productionJobId: string | null;
  pageCount: string;
};

export type ProductionBoardColumnKey = "printing" | "plan_printing" | "poster_printing" | "finishing" | "install" | "deliver" | "pickup";


export type ProductionReferencePhotoPayload = {
  url: string;
  storagePath?: string | null;
  fileName?: string | null;
  originalFileName?: string | null;
  mime?: string | null;
  caption?: string | null;
  source?: string | null;
  signTitle?: string | null;
  location?: string | null;
};

export type ProductionInstallSchedulerPayload = {
  tenantId: string;
  productionManagerJobId: string;
  productionManagerItemId: string | null;
  productionManagerStepId: string;
  quoteId: string | null;
  quoteNumber: string | null;
  clientName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  siteAddress: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  priority: string | null;
  projectName: string | null;
  jobName: string;
  description: string;
  itemSummary: string | null;
  substrateSummary: string | null;
  colourSummary: string | null;
  finishingSummary: string | null;
  quoteProductName: string | null;
  quoteOptionSummary: string | null;
  readyStepLabel: string;
  destination: ProductionBoardColumnKey;
  productionManagerBaseUrl: string;
  clientLogoUrl: string | null;
  clientLogoStoragePath: string | null;
  referencePhotos: ProductionReferencePhotoPayload[];
};

export type ProductionBoardCardRecord = {
  id: string;
  column: ProductionBoardColumnKey;
  jobId: string;
  itemId: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  clientName: string;
  contactName: string | null;
  clientLogoUrl: string | null;
  projectName: string | null;
  jobStatus: string;
  dispatchType: string | null;
  priority: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  itemCode: string | null;
  itemTitle: string | null;
  productionType: string | null;
  quantity: string | null;
  sizeSummary: string | null;
  substrateSummary: string | null;
  colourSummary: string | null;
  finishingSummary: string | null;
  quoteProductName: string | null;
  quoteOptionSummary: string | null;
  nextStepId: string | null;
  nextStepLabel: string | null;
  nextStepType: string | null;
  handoffColumn: ProductionBoardColumnKey | null;
  stepsDone: string;
  stepsTotal: string;
  updatedAt: string;
};

function nullableText(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned.length ? cleaned : null;
}

function normaliseDispatchType(value: string | null | undefined): "pickup" | "delivery" | "install" | null {
  const clean = String(value ?? "").trim().toLowerCase();
  if (clean === "pickup" || clean === "pick up" || clean === "collection" || clean === "collect") return "pickup";
  if (clean === "delivery" || clean === "deliver" || clean === "courier") return "delivery";
  if (clean === "install" || clean === "installation" || clean === "site install") return "install";
  return null;
}

function readyStepLabelForDispatch(value: string | null | undefined): string | null {
  const dispatch = normaliseDispatchType(value);
  if (dispatch === "install") return "Ready for install";
  if (dispatch === "delivery") return "Ready for delivery";
  if (dispatch === "pickup") return "Ready for pickup";
  return null;
}

function dispatchStepTypeForDispatch(value: string | null | undefined): string {
  const dispatch = normaliseDispatchType(value);
  if (dispatch === "install") return "ready_for_install";
  if (dispatch === "delivery") return "ready_for_delivery";
  if (dispatch === "pickup") return "ready_for_pickup";
  return "ready_for_dispatch";
}

function variationProductNameForDispatch(value: string | null | undefined): string {
  const dispatch = normaliseDispatchType(value);
  if (dispatch === "install") return "Sign Install";
  if (dispatch === "delivery") return "Delivery";
  if (dispatch === "pickup") return "Pickup / collection change";
  return "Production variation";
}


function normaliseMoney(value: string | null | undefined, fallback = "1"): string {
  const cleaned = String(value ?? "").replace(/[$,]/g, "").trim();
  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function cleanSearchText(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/[_/\\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function departmentColumnFromText(value: string | null | undefined): ProductionBoardColumnKey | null {
  const source = cleanSearchText(value);
  if (/\b(plan printing|plans?|drawing|drawings|cad|architectural|engineering|blueprint|a0|a1|a2)\b/.test(source)) return "plan_printing";
  if (/\b(poster printing|poster|posters|photo print|photo prints|presentation print|display print|display prints)\b/.test(source)) return "poster_printing";
  return null;
}

function isReadyHandoffText(value: string | null | undefined): boolean {
  const source = cleanSearchText(value);
  return /\b(ready for install|ready for pickup|ready for delivery|ready for collect|ready for collection|ready to install|ready to deliver|ready to pickup|ready to collect|dispatch|packed)\b/.test(source);
}

function destinationColumnFromText(value: string | null | undefined, fallback: ProductionBoardColumnKey = "install"): ProductionBoardColumnKey {
  const source = cleanSearchText(value);
  if (/\b(pickup|pick up|collect|collection|counter)\b/.test(source)) return "pickup";
  if (/\b(deliver|delivery|courier|freight|drop off|dispatch)\b/.test(source)) return "deliver";
  if (/\b(install|installed|installer|site install|site)\b/.test(source)) return "install";
  return fallback;
}

function cleanBaseUrl(value: string | undefined): string {
  return (value || "").trim().replace(/\/$/, "");
}

function uniqueSteps(steps: string[]): string[] {
  const seen = new Set<string>();
  return steps.filter((step) => {
    const key = cleanSearchText(step);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonText(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned.length ? cleaned : null;
}

function displayAnswerText(displayAnswers: JsonRecord, labelPattern: RegExp): string | null {
  for (const [label, value] of Object.entries(displayAnswers)) {
    if (!labelPattern.test(label)) continue;
    if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim()).filter(Boolean).join(', ') || null;
    return jsonText(value);
  }
  return null;
}

function photoUrlFromJson(value: unknown): string | null {
  const photo = asJsonRecord(value);
  return jsonText(photo.url) || jsonText(photo.downloadUrl) || jsonText(photo.photoUrl) || jsonText(photo.photoURL);
}

function normaliseReferencePhoto(value: unknown, index: number, defaults?: { signTitle?: string | null; location?: string | null }): ProductionReferencePhotoPayload | null {
  const photo = asJsonRecord(value);
  const url = photoUrlFromJson(photo);
  if (!url) return null;
  const fileName = jsonText(photo.fileName) || jsonText(photo.originalFileName) || jsonText(photo.name) || `Survey photo ${index + 1}`;
  const signTitle = jsonText(photo.signTitle) || defaults?.signTitle || null;
  const location = jsonText(photo.location) || defaults?.location || null;
  return {
    url,
    storagePath: jsonText(photo.storagePath),
    fileName,
    originalFileName: jsonText(photo.originalFileName),
    mime: jsonText(photo.mime) || jsonText(photo.contentType),
    caption: [signTitle, location].filter(Boolean).join(" · ") || null,
    source: "Install Scheduler survey",
    signTitle,
    location,
  };
}

function surveyReferencePhotosFromPayload(payload: unknown): ProductionReferencePhotoPayload[] {
  const root = asJsonRecord(payload);
  const photos: ProductionReferencePhotoPayload[] = [];
  const pushPhoto = (photo: unknown, defaults?: { signTitle?: string | null; location?: string | null }) => {
    const normalised = normaliseReferencePhoto(photo, photos.length, defaults);
    if (normalised) photos.push(normalised);
  };

  asJsonArray(root.surveyPhotos).forEach((photo) => pushPhoto(photo));
  asJsonArray(root.referencePhotos).forEach((photo) => pushPhoto(photo));

  const scanSigns = (signs: unknown) => {
    asJsonArray(signs).forEach((sign) => {
      const record = asJsonRecord(sign);
      const signTitle = jsonText(record.title) || jsonText(record.signTitle) || jsonText(record.location);
      const location = jsonText(record.location);
      asJsonArray(record.photos).forEach((photo) => pushPhoto(photo, { signTitle, location }));
      asJsonArray(record.referencePhotos).forEach((photo) => pushPhoto(photo, { signTitle, location }));
    });
  };

  scanSigns(root.signs);
  scanSigns(asJsonRecord(root.rawSurvey).signs);

  const seen = new Set<string>();
  return photos.filter((photo) => {
    const key = photo.url.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactProductionText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function productionPartsForSummary(row: {
  itemTitle?: string | null;
  quoteProductName?: string | null;
  quoteOptionSummary?: string | null;
  sizeSummary?: string | null;
  substrateSummary?: string | null;
  colourSummary?: string | null;
  finishingSummary?: string | null;
}): string[] {
  return [row.quoteProductName, row.quoteOptionSummary, row.substrateSummary, row.colourSummary, row.finishingSummary, row.sizeSummary, row.itemTitle]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/\s*[·\n]\s*/g))
    .map(compactProductionText)
    .filter(Boolean);
}

function cleanProductionSizeNumber(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toFixed(2).replace(/\.00$/g, "").replace(/(\.\d)0$/g, "$1");
}

function normaliseProductionSize(value: string | null | undefined): string | null {
  const source = compactProductionText(value).replace(/[×*]/g, "x");
  const match = source.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|m)?/i);
  if (!match) return null;
  return `${cleanProductionSizeNumber(match[1])}x${cleanProductionSizeNumber(match[2])}${(match[3] || "mm").toLowerCase()}`;
}

function isStockSizeSummaryPart(value: string): boolean {
  const source = value.toLowerCase();
  return /\b(material|substrate|stock|sheet|roll|media|acm|aluminium composite|acrylic|corflute|coreflute|pvc|foamboard|vinyl|banner)\b/.test(source)
    && /\b\d+(?:\.\d+)?\s*mm\b/.test(source);
}

function finishedSizeForInstallSummary(row: {
  itemTitle?: string | null;
  quoteOptionSummary?: string | null;
  sizeSummary?: string | null;
}): string | null {
  const parts = String(row.quoteOptionSummary ?? "")
    .split(/\s*[·\n]\s*/g)
    .map(compactProductionText)
    .filter(Boolean);
  const labelled = parts.find((part) => /^(?:finished\s*)?size\s*:/i.test(part));
  const labelledSize = normaliseProductionSize(labelled);
  if (labelledSize) return labelledSize;
  const standalone = parts.find((part) => /^\d+(?:\.\d+)?\s*[×x*]\s*\d+(?:\.\d+)?\s*(?:mm|m)?$/i.test(part));
  const standaloneSize = normaliseProductionSize(standalone);
  if (standaloneSize) return standaloneSize;
  const nonStock = parts.find((part) => normaliseProductionSize(part) && !isStockSizeSummaryPart(part));
  return normaliseProductionSize(nonStock) || normaliseProductionSize(row.sizeSummary) || normaliseProductionSize(row.itemTitle);
}

function materialNameForInstallSummary(row: {
  itemTitle?: string | null;
  quoteProductName?: string | null;
  quoteOptionSummary?: string | null;
  substrateSummary?: string | null;
}): string {
  const source = productionPartsForSummary(row).join(" · ").toLowerCase();
  const materials = ["ACM", "Acrylic", "Corflute", "Coreflute", "PVC", "Foamboard", "Foamex", "Banner", "SAV", "Vinyl", "Poster", "Paper", "Card"];
  const found = materials.find((material) => source.includes(material.toLowerCase()));
  if (found) return found === "Coreflute" ? "Corflute" : found;
  return compactProductionText(row.quoteProductName) || compactProductionText(row.substrateSummary) || "Signage";
}

function stripProductionLabel(value: string): string {
  return compactProductionText(value.replace(/^(?:material|substrate|stock|base|size|sizes|print|laminate|coating|finishing|finish|install|small format)\s*:\s*/i, ""));
}

function substrateForInstallSummary(row: {
  itemTitle?: string | null;
  quoteProductName?: string | null;
  quoteOptionSummary?: string | null;
  substrateSummary?: string | null;
}): string | null {
  const parts = productionPartsForSummary(row);
  const substrate = parts.find((part) => /^(?:material|substrate|stock|base)\s*:/i.test(part))
    || parts.find((part) => /\b(acm|acrylic|corflute|coreflute|pvc|foamboard|foamex|polycarbonate)\b/i.test(part) && /\b\d+(?:\.\d+)?\s*mm\b/i.test(part))
    || compactProductionText(row.substrateSummary)
    || compactProductionText(row.quoteProductName);
  const cleaned = stripProductionLabel(substrate || "")
    .replace(/\b\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*(?:mm|m)?\b/gi, "")
    .replace(/^\w+\s*-\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const thicknessThenMaterial = cleaned.match(/\b(\d+(?:\.\d+)?\s*mm\s*(?:ACM|Acrylic|Corflute|Coreflute|PVC|Foamboard|Foamex|Polycarbonate))\b/i)?.[1];
  if (thicknessThenMaterial) return compactProductionText(thicknessThenMaterial).replace(/\bCoreflute\b/i, "Corflute");
  const materialThenThickness = cleaned.match(/\b(ACM|Acrylic|Corflute|Coreflute|PVC|Foamboard|Foamex|Polycarbonate)\s*(\d+(?:\.\d+)?\s*mm)\b/i);
  if (materialThenThickness) return `${materialThenThickness[2]} ${materialThenThickness[1]}`.replace(/\bCoreflute\b/i, "Corflute");
  return cleaned || null;
}

function printForInstallSummary(row: { quoteOptionSummary?: string | null; colourSummary?: string | null; itemTitle?: string | null }): string | null {
  const source = cleanSearchText([row.quoteOptionSummary, row.colourSummary, row.itemTitle].filter(Boolean).join(" · "));
  if (/\bno print\b|\bmaterial only\b/.test(source)) return "No print";
  if (/\bcut vinyl\b/.test(source)) return "Cut vinyl";
  if (/\broll stock\b|\bprint vinyl\b|\bbanner media\b/.test(source)) return "Roll stock";
  if (/\bdirect print\b/.test(source)) return "Direct";
  if (/\bcmyk\b|\bwhite ink\b|\bprinted\b|\bprint\b/.test(source)) return "Print";
  return null;
}

function laminateForInstallSummary(row: { quoteOptionSummary?: string | null; finishingSummary?: string | null; itemTitle?: string | null }): string | null {
  const raw = [row.quoteOptionSummary, row.finishingSummary, row.itemTitle].filter(Boolean).join(" · ");
  const explicit = raw.match(/Laminate:\s*([^·,\n]+)/i)?.[1];
  if (explicit) return compactProductionText(explicit);
  const lamCode = raw.match(/\b(LAM-[A-Za-z0-9 +\-]*?(?:Gloss|Matt|Matte|Anti Graffiti|Whiteboard)[A-Za-z0-9 +\-]*)\b/i)?.[1];
  if (lamCode) return compactProductionText(lamCode);
  if (/gloss\s+lam/i.test(raw) || /laminate[^·,\n]*gloss/i.test(raw)) return "Gloss Laminate";
  if (/(matt|matte)\s+lam/i.test(raw) || /laminate[^·,\n]*(matt|matte)/i.test(raw)) return "Matt Laminate";
  return null;
}

function finishingForInstallSummary(row: { quoteOptionSummary?: string | null; finishingSummary?: string | null; itemTitle?: string | null }, laminate: string | null): string[] {
  const laminateKey = cleanSearchText(laminate ?? "");
  return Array.from(new Set(productionPartsForSummary(row)
    .filter((part) => /\b(finishing|finish|eyelet|eyelets|hole|holes|drill|jingwei|router|route|cnc|cut|cutting|fold|score|crease|bind|staple|numbering|pad|tape|trim|guillotine|mount|apply)\b/i.test(part))
    .map(stripProductionLabel)
    .flatMap((part) => part.split(/\s*,\s*/g))
    .map(compactProductionText)
    .filter((part) => {
      const key = cleanSearchText(part);
      if (!key || /^none$/i.test(part)) return false;
      if (laminateKey && key === laminateKey) return false;
      return !/\b(print setup|artwork|direct print|roll stock|cut vinyl|single sided|double sided|cmyk|white ink)\b/i.test(part);
    }))).slice(0, 6);
}

function quantityForInstallSummary(value: string | null | undefined): string {
  const count = Number(String(value ?? "1").replace(/,/g, ""));
  if (!Number.isFinite(count) || count <= 0) return "1";
  return Number.isInteger(count) ? String(count) : count.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function buildInstallSchedulerProductionDetails(row: {
  itemCode?: string | null;
  itemTitle?: string | null;
  quantity?: string | null;
  sizeSummary?: string | null;
  substrateSummary?: string | null;
  colourSummary?: string | null;
  finishingSummary?: string | null;
  quoteProductName?: string | null;
  quoteOptionSummary?: string | null;
  quoteNumber?: string | null;
  stepLabel?: string | null;
}): { itemSummary: string; description: string; substrateSummary: string | null; printSummary: string | null; laminateSummary: string | null; finishingDetails: string[] } {
  const code = compactProductionText(row.itemCode) || "S1";
  const material = materialNameForInstallSummary(row);
  const size = finishedSizeForInstallSummary(row);
  const qty = quantityForInstallSummary(row.quantity);
  const itemSummary = [code, material, size].filter(Boolean).join(" - ") + ` (Qty ${qty})`;
  const substrate = substrateForInstallSummary(row);
  const print = printForInstallSummary(row);
  const laminate = laminateForInstallSummary(row);
  const finishings = finishingForInstallSummary(row, laminate);
  const lines = [
    "Signage details:",
    itemSummary,
    substrate ? `Substrate: ${substrate}` : null,
    print ? `Print: ${print}` : null,
    laminate ? `Laminate: ${laminate}` : null,
    ...finishings.map((detail) => (/eyelet/i.test(detail) ? `Eyelets: ${detail.replace(/^Eyelets?:\s*/i, "")}` : `Finishing: ${detail}`)),
    row.stepLabel ? `Next step: ${row.stepLabel}` : null,
    row.quoteNumber ? `Quote: ${row.quoteNumber}` : null,
  ].filter(Boolean);
  return { itemSummary, description: lines.join("\n"), substrateSummary: substrate, printSummary: print, laminateSummary: laminate, finishingDetails: finishings };
}

export async function ensureProductionTables(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await pool.query(`CREATE SCHEMA IF NOT EXISTS production`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS production.production_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
      artwork_approval_id uuid NOT NULL REFERENCES sales.artwork_approvals(id) ON DELETE CASCADE,
      quote_id uuid NOT NULL REFERENCES sales.quote_drafts(id) ON DELETE CASCADE,
      quote_number varchar(50),
      client_name varchar(255) NOT NULL,
      contact_name varchar(255),
      project_name varchar(255),
      status varchar(50) NOT NULL DEFAULT 'ready_to_start',
      dispatch_type varchar(40),
      priority varchar(50),
      due_date date,
      assigned_to varchar(255),
      internal_notes text,
      payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE production.production_jobs
      ADD COLUMN IF NOT EXISTS quote_number varchar(50),
      ADD COLUMN IF NOT EXISTS contact_name varchar(255),
      ADD COLUMN IF NOT EXISTS project_name varchar(255),
      ADD COLUMN IF NOT EXISTS dispatch_type varchar(40),
      ADD COLUMN IF NOT EXISTS priority varchar(50),
      ADD COLUMN IF NOT EXISTS due_date date,
      ADD COLUMN IF NOT EXISTS assigned_to varchar(255),
      ADD COLUMN IF NOT EXISTS internal_notes text,
      ADD COLUMN IF NOT EXISTS source_type varchar(60),
      ADD COLUMN IF NOT EXISTS external_order_id varchar(160),
      ADD COLUMN IF NOT EXISTS linked_customer_id uuid REFERENCES app.customers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
  `);

  await pool.query(`ALTER TABLE production.production_jobs ALTER COLUMN artwork_approval_id DROP NOT NULL`);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_artwork_approval_unique_idx
      ON production.production_jobs (artwork_approval_id)
      WHERE artwork_approval_id IS NOT NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_external_order_unique_idx
      ON production.production_jobs (tenant_id, source_type, external_order_id)
      WHERE external_order_id IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS production_jobs_tenant_status_updated_idx
      ON production.production_jobs (tenant_id, status, updated_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS production.production_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL REFERENCES production.production_jobs(id) ON DELETE CASCADE,
      artwork_page_id uuid REFERENCES sales.artwork_approval_pages(id) ON DELETE SET NULL,
      source_quote_line_id uuid,
      item_code varchar(40),
      title varchar(255) NOT NULL,
      production_type varchar(50) NOT NULL DEFAULT 'signage',
      quantity numeric NOT NULL DEFAULT 1,
      size_summary text,
      substrate_summary text,
      colour_summary text,
      finishing_summary text,
      proof_image_url text,
      proof_file_name varchar(255),
      print_ready_url text,
      print_ready_storage_path text,
      print_ready_file_name varchar(255),
      print_ready_file_type varchar(80),
      print_ready_notes text,
      print_ready_uploaded_at timestamptz,
      print_ready_uploaded_by varchar(255),
      status varchar(50) NOT NULL DEFAULT 'waiting_on_file',
      sort_order integer NOT NULL DEFAULT 0,
      payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE production.production_items
      ADD COLUMN IF NOT EXISTS source_quote_line_id uuid,
      ADD COLUMN IF NOT EXISTS item_code varchar(40),
      ADD COLUMN IF NOT EXISTS production_type varchar(50) NOT NULL DEFAULT 'signage',
      ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS size_summary text,
      ADD COLUMN IF NOT EXISTS substrate_summary text,
      ADD COLUMN IF NOT EXISTS colour_summary text,
      ADD COLUMN IF NOT EXISTS finishing_summary text,
      ADD COLUMN IF NOT EXISTS proof_image_url text,
      ADD COLUMN IF NOT EXISTS proof_file_name varchar(255),
      ADD COLUMN IF NOT EXISTS print_ready_url text,
      ADD COLUMN IF NOT EXISTS print_ready_storage_path text,
      ADD COLUMN IF NOT EXISTS print_ready_file_name varchar(255),
      ADD COLUMN IF NOT EXISTS print_ready_file_type varchar(80),
      ADD COLUMN IF NOT EXISTS print_ready_notes text,
      ADD COLUMN IF NOT EXISTS print_ready_uploaded_at timestamptz,
      ADD COLUMN IF NOT EXISTS print_ready_uploaded_by varchar(255),
      ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS production_items_artwork_page_unique_idx
      ON production.production_items (job_id, artwork_page_id)
      WHERE artwork_page_id IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS production_items_quote_line_unique_idx
      ON production.production_items (job_id, source_quote_line_id)
      WHERE source_quote_line_id IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS production.production_steps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL REFERENCES production.production_jobs(id) ON DELETE CASCADE,
      item_id uuid REFERENCES production.production_items(id) ON DELETE CASCADE,
      label varchar(255) NOT NULL,
      step_type varchar(80) NOT NULL DEFAULT 'general',
      status varchar(50) NOT NULL DEFAULT 'pending',
      checked_at timestamptz,
      checked_by varchar(255),
      notes text,
      assignee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
      due_date date,
      assignment_source varchar(24) NOT NULL DEFAULT 'inherited',
      assignment_process_key varchar(40) NOT NULL DEFAULT 'production',
      sort_order integer NOT NULL DEFAULT 0,
      payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE production.production_steps
      ADD COLUMN IF NOT EXISTS step_type varchar(80) NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS checked_at timestamptz,
      ADD COLUMN IF NOT EXISTS checked_by varchar(255),
      ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS assignee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
      ADD COLUMN IF NOT EXISTS due_date date,
      ADD COLUMN IF NOT EXISTS assignment_source varchar(24) NOT NULL DEFAULT 'inherited',
      ADD COLUMN IF NOT EXISTS assignment_process_key varchar(40) NOT NULL DEFAULT 'production',
      ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS production_steps_item_label_unique_idx
      ON production.production_steps (job_id, item_id, lower(label))
      WHERE item_id IS NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS production_steps_job_sort_idx
      ON production.production_steps (job_id, item_id, sort_order, created_at)
  `);
}

function productionJobSelectSql(): string {
  return `
      id,
      tenant_id as "tenantId",
      artwork_approval_id as "artworkApprovalId",
      quote_id as "quoteId",
      quote_number as "quoteNumber",
      client_name as "clientName",
      contact_name as "contactName",
      project_name as "projectName",
      status,
      dispatch_type as "dispatchType",
      priority,
      due_date::text as "dueDate",
      assigned_to as "assignedTo",
      internal_notes as "internalNotes",
      linked_customer_id as "linkedCustomerId",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;
}

export async function listProductionJobsForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<ProductionJobRecord[]> {
  const result = await pool.query<ProductionJobRecord>(`
    SELECT ${productionJobSelectSql()}
    FROM production.production_jobs
    WHERE tenant_id = $1::uuid
      AND ($2::boolean OR status <> 'deleted')
    ORDER BY
      CASE status
        WHEN 'ready_to_start' THEN 1
        WHEN 'waiting_on_files' THEN 2
        WHEN 'waiting_on_material' THEN 3
        WHEN 'in_production' THEN 4
        WHEN 'ready_for_dispatch' THEN 5
        WHEN 'completed' THEN 6
        ELSE 7
      END,
      updated_at DESC,
      created_at DESC
  `, [tenantId, Boolean(options?.includeDeleted)]);
  return result.rows;
}

export async function listProductionJobStepSummariesForTenant(tenantId: string): Promise<ProductionJobStepSummary[]> {
  const result = await pool.query<{
    jobId: string;
    currentStep: string | null;
    stepsDone: string;
    stepsTotal: string;
  }>(`
    SELECT
      pj.id as "jobId",
      COALESCE(
        (
          SELECT ps.label
          FROM production.production_steps ps
          WHERE ps.job_id = pj.id AND ps.status <> 'done'
          ORDER BY ps.sort_order ASC, ps.created_at ASC
          LIMIT 1
        ),
        CASE
          WHEN EXISTS (SELECT 1 FROM production.production_steps ps WHERE ps.job_id = pj.id) THEN 'All steps complete'
          ELSE 'No production steps'
        END
      ) as "currentStep",
      (SELECT count(*) FROM production.production_steps ps WHERE ps.job_id = pj.id AND ps.status = 'done')::text as "stepsDone",
      (SELECT count(*) FROM production.production_steps ps WHERE ps.job_id = pj.id)::text as "stepsTotal"
    FROM production.production_jobs pj
    WHERE pj.tenant_id = $1::uuid
  `, [tenantId]);

  return result.rows.map((row) => ({
    jobId: row.jobId,
    currentStep: row.currentStep || "No production steps",
    stepsDone: Number(row.stepsDone) || 0,
    stepsTotal: Number(row.stepsTotal) || 0
  }));
}

export async function getProductionJobById(tenantId: string, jobId: string): Promise<ProductionJobRecord | null> {
  const result = await pool.query<ProductionJobRecord>(`
    SELECT ${productionJobSelectSql()}
    FROM production.production_jobs
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `, [tenantId, jobId]);
  return result.rows[0] ?? null;
}

export async function getProductionJobForArtworkApproval(tenantId: string, approvalId: string): Promise<ProductionJobRecord | null> {
  const result = await pool.query<ProductionJobRecord>(`
    SELECT ${productionJobSelectSql()}
    FROM production.production_jobs
    WHERE tenant_id = $1::uuid AND artwork_approval_id = $2::uuid
    LIMIT 1
  `, [tenantId, approvalId]);
  return result.rows[0] ?? null;
}

export async function getProductionJobForQuote(tenantId: string, quoteId: string): Promise<ProductionJobRecord | null> {
  const result = await pool.query<ProductionJobRecord>(`
    SELECT ${productionJobSelectSql()}
    FROM production.production_jobs
    WHERE tenant_id = $1::uuid AND quote_id = $2::uuid AND status <> 'deleted'
    ORDER BY updated_at DESC
    LIMIT 1
  `, [tenantId, quoteId]);
  return result.rows[0] ?? null;
}

export async function listProductionItemsForJob(jobId: string): Promise<ProductionItemRecord[]> {
  const result = await pool.query<ProductionItemRecord>(`
    SELECT
      pi.id,
      pi.job_id as "jobId",
      pi.artwork_page_id as "artworkPageId",
      pi.source_quote_line_id as "sourceQuoteLineId",
      pi.item_code as "itemCode",
      pi.title,
      pi.production_type as "productionType",
      pi.quantity::text as quantity,
      pi.size_summary as "sizeSummary",
      pi.substrate_summary as "substrateSummary",
      pi.colour_summary as "colourSummary",
      pi.finishing_summary as "finishingSummary",
      pi.proof_image_url as "proofImageUrl",
      pi.proof_file_name as "proofFileName",
      NULLIF(pi.payload_json -> 'selectedImage' ->> 'url','') as "selectedImageUrl",
      NULLIF(pi.payload_json -> 'selectedImage' ->> 'alt','') as "selectedImageAlt",
      pi.print_ready_url as "printReadyUrl",
      pi.print_ready_storage_path as "printReadyStoragePath",
      pi.print_ready_file_name as "printReadyFileName",
      pi.print_ready_file_type as "printReadyFileType",
      pi.print_ready_notes as "printReadyNotes",
      pi.print_ready_uploaded_at as "printReadyUploadedAt",
      pi.print_ready_uploaded_by as "printReadyUploadedBy",
      COALESCE(pi.payload_json -> 'artworkFiles', '[]'::jsonb) as "artworkFiles",
      ql.product_name as "quoteProductName",
      ql.option_summary as "quoteOptionSummary",
      ql.notes as "quoteLineNotes",
      ql.line_total::text as "quoteLineTotal",
      NULLIF(ql.configuration_snapshot -> 'payment' ->> 'method','') as "websitePaymentMethod",
      NULLIF(ql.configuration_snapshot -> 'payment' ->> 'title','') as "websitePaymentTitle",
      NULLIF(ql.configuration_snapshot -> 'payment' ->> 'accountTerms','') as "websiteAccountTerms",
      pi.status,
      pi.sort_order as "sortOrder",
      pi.created_at as "createdAt",
      pi.updated_at as "updatedAt"
    FROM production.production_items pi
    LEFT JOIN sales.quote_lines ql ON ql.id = pi.source_quote_line_id
    WHERE pi.job_id = $1::uuid
    ORDER BY pi.sort_order ASC, pi.created_at ASC
  `, [jobId]);
  return result.rows;
}

async function syncInheritedProductionStepAssignments(input: {
  productionJobId?: string | null;
  tenantId?: string | null;
  workflowJobId?: string | null;
}): Promise<void> {
  const schema = await pool.query<{ jobsTable: string | null; assignmentsTable: string | null }>(`
    SELECT
      to_regclass('app.jobs')::text as "jobsTable",
      to_regclass('app.job_process_assignments')::text as "assignmentsTable"
  `);
  if (!schema.rows[0]?.jobsTable || !schema.rows[0]?.assignmentsTable) return;

  await pool.query(`
    WITH step_defaults AS (
      SELECT
        step.id,
        CASE
          WHEN lower(COALESCE(step.step_type, '') || ' ' || COALESCE(step.label, '')) ~ '(ready|install|delivery|deliver|pickup|collect|dispatch)'
            THEN 'dispatch'
          ELSE 'production'
        END AS process_key
      FROM production.production_steps step
      INNER JOIN production.production_jobs production_job ON production_job.id = step.job_id
      INNER JOIN app.jobs workflow_job
        ON workflow_job.tenant_id = production_job.tenant_id
       AND workflow_job.production_job_id = production_job.id
      WHERE step.assignment_source = 'inherited'
        AND (NULLIF($1::text, '') IS NULL OR production_job.id = NULLIF($1::text, '')::uuid)
        AND (NULLIF($2::text, '') IS NULL OR production_job.tenant_id = NULLIF($2::text, '')::uuid)
        AND (NULLIF($3::text, '') IS NULL OR workflow_job.id = NULLIF($3::text, '')::uuid)
    ), resolved_defaults AS (
      SELECT
        defaults.id,
        defaults.process_key,
        COALESCE(assignment.assignee_profile_ids, '{}'::uuid[]) AS assignee_profile_ids,
        assignment.due_date
      FROM step_defaults defaults
      LEFT JOIN production.production_steps step ON step.id = defaults.id
      LEFT JOIN production.production_jobs production_job ON production_job.id = step.job_id
      LEFT JOIN app.jobs workflow_job
        ON workflow_job.tenant_id = production_job.tenant_id
       AND workflow_job.production_job_id = production_job.id
      LEFT JOIN app.job_process_assignments assignment
        ON assignment.job_id = workflow_job.id
       AND assignment.process_key = defaults.process_key
    )
    UPDATE production.production_steps step
    SET assignment_process_key = defaults.process_key,
        assignee_profile_ids = defaults.assignee_profile_ids,
        due_date = defaults.due_date,
        updated_at = CASE
          WHEN step.assignment_process_key IS DISTINCT FROM defaults.process_key
            OR step.assignee_profile_ids IS DISTINCT FROM defaults.assignee_profile_ids
            OR step.due_date IS DISTINCT FROM defaults.due_date
          THEN now()
          ELSE step.updated_at
        END
    FROM resolved_defaults defaults
    WHERE step.id = defaults.id
  `, [input.productionJobId ?? "", input.tenantId ?? "", input.workflowJobId ?? ""]);
}

export async function syncProductionStepAssignmentsFromJobProcessForTenant(tenantId: string, workflowJobId: string): Promise<void> {
  await ensureProductionTables();
  await syncInheritedProductionStepAssignments({ tenantId, workflowJobId });
}

export async function listProductionStepsForJob(jobId: string): Promise<ProductionStepRecord[]> {
  await ensureProductionTables();
  await syncInheritedProductionStepAssignments({ productionJobId: jobId });
  const result = await pool.query<ProductionStepRecord>(`
    SELECT
      id,
      job_id as "jobId",
      item_id as "itemId",
      label,
      step_type as "stepType",
      status,
      checked_at as "checkedAt",
      checked_by as "checkedBy",
      notes,
      COALESCE(assignee_profile_ids, '{}'::uuid[]) as "assigneeProfileIds",
      due_date::text as "dueDate",
      assignment_source as "assignmentSource",
      assignment_process_key as "assignmentProcessKey",
      sort_order as "sortOrder",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM production.production_steps
    WHERE job_id = $1::uuid
    ORDER BY item_id NULLS FIRST, sort_order ASC, created_at ASC
  `, [jobId]);
  return result.rows;
}

export async function updateProductionStepAssignmentForTenant(tenantId: string, input: {
  stepId: string;
  assigneeProfileIds?: string[];
  dueDate?: string | null;
  inherit?: boolean;
}): Promise<ProductionStepRecord | null> {
  await ensureProductionTables();
  if (input.inherit) {
    const reset = await pool.query<{ jobId: string }>(`
      UPDATE production.production_steps step
      SET assignment_source = 'inherited', updated_at = now()
      FROM production.production_jobs production_job
      WHERE production_job.id = step.job_id
        AND production_job.tenant_id = $1::uuid
        AND step.id = $2::uuid
      RETURNING step.job_id as "jobId"
    `, [tenantId, input.stepId]);
    if (!reset.rows[0]) return null;
    await syncInheritedProductionStepAssignments({ productionJobId: reset.rows[0].jobId, tenantId });
  } else {
    const requestedIds = Array.from(new Set((input.assigneeProfileIds ?? []).map((id) => id.trim()).filter(Boolean)));
    const validStaff = requestedIds.length
      ? await pool.query<{ id: string }>(`
          SELECT DISTINCT profile.id
          FROM app.memberships membership
          INNER JOIN app.user_profiles profile ON profile.id = membership.user_profile_id
          WHERE membership.tenant_id = $1::uuid
            AND membership.status = 'active'
            AND profile.id = ANY($2::uuid[])
        `, [tenantId, requestedIds])
      : { rows: [] as Array<{ id: string }> };
    if (validStaff.rows.length !== requestedIds.length) {
      throw new Error("One or more selected staff members are no longer active in this workspace.");
    }
    const updated = await pool.query<{ id: string }>(`
      UPDATE production.production_steps step
      SET assignee_profile_ids = $3::uuid[],
          due_date = NULLIF($4::text,'')::date,
          assignment_source = 'manual',
          updated_at = now()
      FROM production.production_jobs production_job
      WHERE production_job.id = step.job_id
        AND production_job.tenant_id = $1::uuid
        AND step.id = $2::uuid
      RETURNING step.id
    `, [tenantId, input.stepId, requestedIds, input.dueDate ?? null]);
    if (!updated.rows[0]) return null;
  }

  const result = await pool.query<ProductionStepRecord>(`
    SELECT
      step.id,
      step.job_id as "jobId",
      step.item_id as "itemId",
      step.label,
      step.step_type as "stepType",
      step.status,
      step.checked_at as "checkedAt",
      step.checked_by as "checkedBy",
      step.notes,
      COALESCE(step.assignee_profile_ids, '{}'::uuid[]) as "assigneeProfileIds",
      step.due_date::text as "dueDate",
      step.assignment_source as "assignmentSource",
      step.assignment_process_key as "assignmentProcessKey",
      step.sort_order as "sortOrder",
      step.created_at as "createdAt",
      step.updated_at as "updatedAt"
    FROM production.production_steps step
    INNER JOIN production.production_jobs production_job ON production_job.id = step.job_id
    WHERE production_job.tenant_id = $1::uuid AND step.id = $2::uuid
    LIMIT 1
  `, [tenantId, input.stepId]);
  return result.rows[0] ?? null;
}


function productionBoardColumnForText(text: string): ProductionBoardColumnKey {
  const source = cleanSearchText(text);
  const finalStep = /\b(ready for install|ready for pickup|ready for delivery|dispatch|packed)\b/.test(source);

  if (finalStep) {
    if (/\binstall|installed|installer|site\b/.test(source)) return "install";
    if (/\bdeliver|delivery|courier|freight|drop off\b/.test(source)) return "deliver";
    return "pickup";
  }

  if (/\binstall|installed|installer|site\b/.test(source)) return "install";
  if (/\bdeliver|delivery|courier|freight|drop off\b/.test(source)) return "deliver";
  if (/\bpickup|pick up|collect|collection\b/.test(source)) return "pickup";
  if (/\b(laminate|lamination|cello|fold|score|crease|bind|staple|number|numbering|pad|tape|trim|guillotine|cut|route|router|cnc|jingwei|finish|finishing|quality|pack|packed|apply|mount|mounted|eyelet)\b/.test(source)) return "finishing";
  return departmentColumnFromText(source) ?? "printing";
}

function productionBoardColumnForNextStep(row: Omit<ProductionBoardCardRecord, "id" | "column">): ProductionBoardColumnKey {
  if (!row.nextStepId && row.handoffColumn) return row.handoffColumn;

  const nextStep = cleanSearchText([row.nextStepLabel, row.nextStepType].filter(Boolean).join(" · "));
  const dispatch = cleanSearchText(row.dispatchType ?? "");
  const dispatchColumn: ProductionBoardColumnKey | null = dispatch === "pickup" ? "pickup" : dispatch === "delivery" ? "deliver" : dispatch === "install" ? "install" : null;
  const isGenericReadyStep = /ready/.test(nextStep) && /install/.test(nextStep) && /pickup/.test(nextStep) && /delivery/.test(nextStep);
  if (isGenericReadyStep && dispatchColumn) return dispatchColumn;

  const departmentSearchText = [
    row.jobStatus,
    row.projectName,
    row.itemTitle,
    row.productionType,
    row.substrateSummary,
    row.colourSummary,
    row.finishingSummary,
    row.quoteProductName,
    row.quoteOptionSummary
  ].filter(Boolean).join(" · ");

  if (!nextStep) {
    return productionBoardColumnForText(departmentSearchText);
  }

  if (/\b(ready for install|install|installed|installer|site install)\b/.test(nextStep)) return "install";
  if (/\b(ready for delivery|deliver|delivery|courier|freight|drop off|dispatch)\b/.test(nextStep)) return "deliver";
  if (/\b(ready for pickup|pickup|pick up|collect|collection)\b/.test(nextStep)) return "pickup";

  if (/\b(laminate|lamination|cello|fold|score|crease|bind|staple|number|numbering|pad|tape|trim|guillotine|cut|route|router|cnc|jingwei|finish|finishing|quality|pack|packed|apply|mount|mounted|eyelet|drill|hole|holes)\b/.test(nextStep)) return "finishing";

  return departmentColumnFromText(departmentSearchText) ?? "printing";
}

function productionBoardCardFromRow(row: Omit<ProductionBoardCardRecord, "id" | "column">): ProductionBoardCardRecord {
  const column = productionBoardColumnForNextStep(row);

  return {
    ...row,
    id: row.itemId ? `${row.jobId}:${row.itemId}` : row.jobId,
    column
  };
}

export async function listProductionBoardCardsForTenant(tenantId: string): Promise<ProductionBoardCardRecord[]> {
  const result = await pool.query<Omit<ProductionBoardCardRecord, "id" | "column">>(`
    SELECT
      pj.id as "jobId",
      pi.id as "itemId",
      pj.quote_id as "quoteId",
      pj.quote_number as "quoteNumber",
      pj.client_name as "clientName",
      pj.contact_name as "contactName",
      COALESCE(enq.client_logo_url, NULLIF(c.payload_json->>'logoUrl', '')) as "clientLogoUrl",
      pj.project_name as "projectName",
      pj.status as "jobStatus",
      pj.dispatch_type as "dispatchType",
      pj.priority,
      pj.due_date::text as "dueDate",
      pj.assigned_to as "assignedTo",
      pi.item_code as "itemCode",
      pi.title as "itemTitle",
      pi.production_type as "productionType",
      pi.quantity::text as quantity,
      pi.size_summary as "sizeSummary",
      pi.substrate_summary as "substrateSummary",
      pi.colour_summary as "colourSummary",
      pi.finishing_summary as "finishingSummary",
      ql.product_name as "quoteProductName",
      ql.option_summary as "quoteOptionSummary",
      next_step.id as "nextStepId",
      COALESCE(next_step.label, final_handoff.label) as "nextStepLabel",
      COALESCE(next_step.step_type, final_handoff.step_type) as "nextStepType",
      final_handoff.handoff_column as "handoffColumn",
      COALESCE(progress.steps_done, 0)::text as "stepsDone",
      COALESCE(progress.steps_total, 0)::text as "stepsTotal",
      GREATEST(
        pj.updated_at,
        COALESCE(pi.updated_at, pj.updated_at),
        COALESCE(step_activity.steps_updated_at, pj.updated_at)
      ) as "updatedAt"
    FROM production.production_jobs pj
    LEFT JOIN production.production_items pi ON pi.job_id = pj.id
    LEFT JOIN sales.quote_lines ql ON ql.id = pi.source_quote_line_id
    LEFT JOIN sales.quote_drafts qd ON qd.id = pj.quote_id
    LEFT JOIN app.enquiries enq ON enq.id = qd.enquiry_id
    LEFT JOIN app.customers c ON c.id = qd.linked_customer_id
    LEFT JOIN LATERAL (
      SELECT ps.id, ps.label, ps.step_type, ps.sort_order
      FROM production.production_steps ps
      WHERE ps.item_id = pi.id
        AND ps.status <> 'done'
        AND NOT (
          lower(ps.label) LIKE '%apply%mount%substrate%'
          AND concat_ws(' ', pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%direct print%'
        )
      ORDER BY ps.sort_order ASC, ps.created_at ASC
      LIMIT 1
    ) next_step ON true
    LEFT JOIN LATERAL (
      SELECT
        ps.id,
        ps.label,
        ps.step_type,
        CASE
          WHEN pj.dispatch_type = 'pickup' THEN 'pickup'
          WHEN pj.dispatch_type = 'delivery' THEN 'deliver'
          WHEN pj.dispatch_type = 'install' THEN 'install'
          WHEN concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%pickup%'
            OR concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%pick up%'
            OR concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%collect%'
            OR concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%counter%'
          THEN 'pickup'
          WHEN concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%deliver%'
            OR concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%courier%'
            OR concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%freight%'
            OR concat_ws(' ', pj.project_name, pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%drop off%'
          THEN 'deliver'
          ELSE 'install'
        END as handoff_column
      FROM production.production_steps ps
      WHERE ps.item_id = pi.id
        AND ps.status = 'done'
        AND (
          lower(ps.label) LIKE '%ready for install%'
          OR lower(ps.label) LIKE '%ready for pickup%'
          OR lower(ps.label) LIKE '%ready for delivery%'
          OR lower(ps.label) LIKE '%ready%pickup%'
          OR lower(ps.label) LIKE '%ready%delivery%'
          OR lower(ps.label) LIKE '%ready%install%'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM production.production_steps pending
          WHERE pending.item_id = pi.id
            AND pending.status <> 'done'
            AND NOT (
              lower(pending.label) LIKE '%apply%mount%substrate%'
              AND concat_ws(' ', pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%direct print%'
            )
        )
      ORDER BY ps.sort_order DESC, ps.updated_at DESC
      LIMIT 1
    ) final_handoff ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE NOT (lower(ps.label) LIKE '%apply%mount%substrate%' AND concat_ws(' ', pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%direct print%')) as steps_total,
        count(*) FILTER (WHERE ps.status = 'done' AND NOT (lower(ps.label) LIKE '%apply%mount%substrate%' AND concat_ws(' ', pi.title, pi.production_type, pi.size_summary, pi.substrate_summary, pi.colour_summary, pi.finishing_summary, ql.product_name, ql.option_summary) ILIKE '%direct print%')) as steps_done
      FROM production.production_steps ps
      WHERE ps.item_id = pi.id
    ) progress ON true
    LEFT JOIN LATERAL (
      SELECT max(ps.updated_at) as steps_updated_at
      FROM production.production_steps ps
      WHERE ps.item_id = pi.id
    ) step_activity ON true
    WHERE pj.tenant_id = $1::uuid
      AND pj.status NOT IN ('deleted', 'completed')
      AND (pi.id IS NULL OR next_step.id IS NOT NULL OR final_handoff.id IS NOT NULL)
    ORDER BY
      CASE WHEN pj.priority ILIKE 'urgent%' THEN 0 ELSE 1 END,
      pj.due_date ASC NULLS LAST,
      pj.updated_at DESC,
      pi.sort_order ASC NULLS LAST,
      pi.created_at ASC NULLS LAST
  `, [tenantId]);

  return result.rows.map(productionBoardCardFromRow);
}

export async function listApprovedArtworkReadyForProduction(tenantId: string): Promise<ApprovedArtworkOptionRecord[]> {
  const result = await pool.query<ApprovedArtworkOptionRecord>(`
    SELECT
      aa.id as "approvalId",
      aa.quote_id as "quoteId",
      qd.quote_number as "quoteNumber",
      aa.client_name as "clientName",
      aa.project_name as "projectName",
      aa.approved_at as "approvedAt",
      pj.id as "productionJobId",
      count(aap.id)::text as "pageCount"
    FROM sales.artwork_approvals aa
    JOIN sales.quote_drafts qd ON qd.id = aa.quote_id
    LEFT JOIN sales.artwork_approval_pages aap ON aap.approval_id = aa.id
    LEFT JOIN production.production_jobs pj ON pj.artwork_approval_id = aa.id
    WHERE aa.tenant_id = $1::uuid
      AND aa.status = 'approved'
      AND pj.id IS NULL
    GROUP BY aa.id, qd.quote_number, pj.id
    ORDER BY aa.approved_at DESC NULLS LAST, aa.updated_at DESC
  `, [tenantId]);
  return result.rows;
}

function stepPlanForItem(input: {
  productionType: string | null;
  title: string | null;
  substrateSummary: string | null;
  colourSummary: string | null;
  finishingSummary: string | null;
  sizeSummary: string | null;
  quoteProductName?: string | null;
  quoteOptionSummary?: string | null;
}): string[] {
  const combined = cleanSearchText([
    input.productionType,
    input.title,
    input.quoteProductName,
    input.quoteOptionSummary,
    input.substrateSummary,
    input.colourSummary,
    input.finishingSummary,
    input.sizeSummary
  ].filter(Boolean).join(" · "));

  const steps: string[] = ["Artwork checked", "Print-ready file attached", "Material / stock allocated"];

  if (input.productionType === "small_format" || input.productionType === "plan_printing" || input.productionType === "poster_printing") {
    steps.push("Print");
    if (/\b(cello|laminate|lamination|coating|gloss|matt|matte)\b/.test(combined)) steps.push("Cello / laminate");
    if (/\b(fold|folding|score|scoring|crease|creasing)\b/.test(combined)) steps.push("Fold / score");
    if (/\b(staple|saddle|book|booklet|bind|binding)\b/.test(combined)) steps.push("Bind / staple");
    if (/\b(number|numbering|sequential)\b/.test(combined)) steps.push("Numbering");
    if (/\b(pad|padding|tape|taped)\b/.test(combined)) steps.push("Pad / tape");
    steps.push("Trim / guillotine", "Quality checked", "Packed", "Ready for pickup / delivery");
    return uniqueSteps(steps);
  }

  const isDirectPrint = /\bdirect print\b/.test(combined);
  const hasPrintedOrCutMedia = /\b(roll stock|print vinyl|printed vinyl|vinyl|sav|cut vinyl|banner media|banner|self adhesive|apply|applied|mount|mounted)\b/.test(combined);
  const hasSeparateSubstrate = /\b(acm|aluminium composite|acrylic|pvc|foamboard|substrate|panel)\b/.test(combined);

  if (/\b(roll|vinyl|banner|cmyk|mono|direct print|white ink|print)\b/.test(combined)) steps.push("Print");
  if (/\b(laminate|lamination|gloss|matt|matte|anti graffiti|whiteboard)\b/.test(combined)) steps.push("Laminate");
  if (!isDirectPrint && hasPrintedOrCutMedia && hasSeparateSubstrate) steps.push("Apply / mount to substrate");
  if (/\b(jingwei|router|cnc|cut|cutting|drill|holes|eyelet|eyelets)\b/.test(combined)) steps.push("Cut / route / finish");
  steps.push("Quality checked", "Packed", "Ready for install / pickup / delivery");
  return uniqueSteps(steps);
}

async function syncProductionItemsAndSteps(jobId: string): Promise<void> {
  const pageResult = await pool.query<{
    id: string;
    sourceQuoteLineId: string | null;
    signCode: string | null;
    title: string;
    productionType: string;
    quantity: string;
    sizeSummary: string | null;
    substrateSummary: string | null;
    colourSummary: string | null;
    finishingSummary: string | null;
    proofImageUrl: string | null;
    proofFileName: string | null;
    sortOrder: number;
    quoteProductName: string | null;
    quoteOptionSummary: string | null;
  }>(`
    SELECT
      aap.id,
      aap.source_quote_line_id as "sourceQuoteLineId",
      aap.sign_code as "signCode",
      aap.title,
      aap.production_type as "productionType",
      aap.quantity::text as quantity,
      aap.size_summary as "sizeSummary",
      aap.substrate_summary as "substrateSummary",
      aap.colour_summary as "colourSummary",
      CASE WHEN aap.production_type IN ('small_format','plan_printing','poster_printing') THEN aap.small_format_summary ELSE aap.install_summary END as "finishingSummary",
      aap.image_url as "proofImageUrl",
      aap.file_name as "proofFileName",
      aap.sort_order as "sortOrder",
      ql.product_name as "quoteProductName",
      ql.option_summary as "quoteOptionSummary"
    FROM production.production_jobs pj
    JOIN sales.artwork_approval_pages aap ON aap.approval_id = pj.artwork_approval_id
    LEFT JOIN sales.quote_lines ql ON ql.id = aap.source_quote_line_id
    WHERE pj.id = $1::uuid
    ORDER BY aap.sort_order ASC, aap.created_at ASC
  `, [jobId]);

  for (const page of pageResult.rows) {
    const item = await pool.query<{ id: string }>(`
      INSERT INTO production.production_items (
        job_id,
        artwork_page_id,
        source_quote_line_id,
        item_code,
        title,
        production_type,
        quantity,
        size_summary,
        substrate_summary,
        colour_summary,
        finishing_summary,
        proof_image_url,
        proof_file_name,
        status,
        sort_order,
        created_at,
        updated_at
      ) VALUES (
        $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::numeric,$8,$9,$10,$11,$12,$13,'waiting_on_file',$14,now(),now()
      )
      ON CONFLICT (job_id, artwork_page_id)
      WHERE artwork_page_id IS NOT NULL
      DO UPDATE SET
        source_quote_line_id = EXCLUDED.source_quote_line_id,
        item_code = EXCLUDED.item_code,
        title = EXCLUDED.title,
        production_type = EXCLUDED.production_type,
        quantity = EXCLUDED.quantity,
        size_summary = EXCLUDED.size_summary,
        substrate_summary = EXCLUDED.substrate_summary,
        colour_summary = EXCLUDED.colour_summary,
        finishing_summary = EXCLUDED.finishing_summary,
        proof_image_url = EXCLUDED.proof_image_url,
        proof_file_name = EXCLUDED.proof_file_name,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
      RETURNING id
    `, [
      jobId,
      page.id,
      page.sourceQuoteLineId,
      page.signCode,
      page.title,
      page.productionType || "signage",
      normaliseMoney(page.quantity, "1"),
      page.sizeSummary,
      page.substrateSummary,
      page.colourSummary,
      page.finishingSummary,
      page.proofImageUrl,
      page.proofFileName,
      page.sortOrder || 0
    ]);

    const itemId = item.rows[0]?.id;
    if (!itemId) continue;
    const steps = stepPlanForItem(page);
    for (let index = 0; index < steps.length; index += 1) {
      const label = steps[index];
      await pool.query(`
        INSERT INTO production.production_steps (job_id, item_id, label, step_type, status, sort_order, created_at, updated_at)
        VALUES ($1::uuid,$2::uuid,$3,$4,'pending',$5,now(),now())
        ON CONFLICT (job_id, item_id, (lower(label)))
        WHERE item_id IS NOT NULL
        DO UPDATE SET sort_order = EXCLUDED.sort_order, updated_at = production.production_steps.updated_at
      `, [jobId, itemId, label, cleanSearchText(label).replace(/\s+/g, "_"), (page.sortOrder || 0) * 100 + index + 1]);
    }

    await pool.query(`
      DELETE FROM production.production_steps ps
      WHERE ps.job_id = $1::uuid
        AND ps.item_id = $2::uuid
        AND ps.status <> 'done'
        AND lower(ps.label) = ANY($3::text[])
        AND NOT (lower(ps.label) = ANY($4::text[]))
    `, [
      jobId,
      itemId,
      ["apply / mount to substrate"],
      steps.map((step) => cleanSearchText(step))
    ]);
  }
}

export async function createProductionJobFromArtworkApprovalForTenant(tenantId: string, approvalId: string, triggeredBy?: string | null): Promise<{ id: string } | null> {
  await ensureProductionTables();

  const result = await pool.query<{ id: string }>(`
    INSERT INTO production.production_jobs AS existing_job (
      tenant_id,
      artwork_approval_id,
      quote_id,
      quote_number,
      client_name,
      contact_name,
      project_name,
      status,
      priority,
      internal_notes,
      created_at,
      updated_at
    )
    SELECT
      aa.tenant_id,
      aa.id,
      aa.quote_id,
      qd.quote_number,
      aa.client_name,
      aa.contact_name,
      COALESCE(NULLIF(aa.project_name, ''), qd.client_name),
      'ready_to_start',
      'normal',
      concat_ws(E'\n',
        'Created from approved artwork approval.',
        CASE WHEN $3::text IS NOT NULL THEN 'Created by: ' || $3::text ELSE NULL END,
        CASE WHEN aa.internal_notes IS NOT NULL THEN 'Artwork notes: ' || aa.internal_notes ELSE NULL END,
        CASE WHEN qd.notes IS NOT NULL THEN 'Quote notes: ' || qd.notes ELSE NULL END
      ),
      now(),
      now()
    FROM sales.artwork_approvals aa
    JOIN sales.quote_drafts qd ON qd.id = aa.quote_id
    WHERE aa.tenant_id = $1::uuid
      AND aa.id = $2::uuid
      AND aa.status = 'approved'
    ON CONFLICT (artwork_approval_id)
    DO UPDATE SET
      quote_number = EXCLUDED.quote_number,
      client_name = EXCLUDED.client_name,
      contact_name = EXCLUDED.contact_name,
      project_name = EXCLUDED.project_name,
      status = CASE
        WHEN existing_job.status IN ('completed', 'deleted') THEN existing_job.status
        ELSE 'ready_to_start'
      END,
      updated_at = now()
    RETURNING id
  `, [tenantId, approvalId, triggeredBy ?? null]);

  const jobId = result.rows[0]?.id;
  if (!jobId) return null;
  await syncProductionItemsAndSteps(jobId);
  return { id: jobId };
}

type WebsiteArtworkFile = {
  name: string;
  size: number | null;
  mime: string | null;
  downloadUrl: string;
  storagePath: string | null;
};

function websiteArtworkFiles(value: unknown): WebsiteArtworkFile[] {
  return asJsonArray(value).flatMap((entry): WebsiteArtworkFile[] => {
    const file = asJsonRecord(entry);
    const downloadUrl = jsonText(file.downloadUrl) || jsonText(file.url);
    if (!downloadUrl) return [];
    const parsedSize = Number(file.size);
    return [{
      name: jsonText(file.name) || "Website artwork",
      size: Number.isFinite(parsedSize) ? parsedSize : null,
      mime: jsonText(file.mime) || jsonText(file.type),
      downloadUrl,
      storagePath: jsonText(file.storagePath)
    }];
  });
}

export async function createProductionJobFromWebsiteOrderForTenant(tenantId: string, input: {
  quoteId: string;
  externalOrderId: string;
  orderNumber: string;
  linkedCustomerId?: string | null;
  clientName: string;
  contactName?: string | null;
  dispatchType?: string | null;
  address?: string | null;
  payloadJson?: Record<string, unknown>;
}): Promise<{ id: string; artworkFileCount: number }> {
  await ensureProductionTables();
  const dispatchType = normaliseDispatchType(input.dispatchType) ?? "pickup";
  const deliveryAddress = dispatchType === "delivery" ? nullableText(input.address) : null;
  const jobResult = await pool.query<{ id: string }>(`
    INSERT INTO production.production_jobs AS existing_job (
      tenant_id,artwork_approval_id,quote_id,quote_number,client_name,contact_name,project_name,
      status,dispatch_type,priority,internal_notes,source_type,external_order_id,linked_customer_id,payload_json,created_at,updated_at
    )
    SELECT
      qd.tenant_id,NULL,qd.id,qd.quote_number,$4::varchar,$5::varchar,
      ('WooCommerce order ' || $3::text),'ready_to_start',$6::varchar,'normal',
      concat_ws(E'\n','Created automatically from paid WooCommerce order ' || $3::text,
        CASE WHEN $6::text='delivery' AND $7::text IS NOT NULL THEN 'Delivery address: ' || $7::text ELSE NULL END),
      'wordpress_woocommerce',$2::varchar,$8::uuid,$9::jsonb,now(),now()
    FROM sales.quote_drafts qd
    WHERE qd.tenant_id=$1::uuid AND qd.id=$10::uuid
    ON CONFLICT (tenant_id,source_type,external_order_id)
    WHERE external_order_id IS NOT NULL
    DO UPDATE SET linked_customer_id=EXCLUDED.linked_customer_id,client_name=EXCLUDED.client_name,
      contact_name=EXCLUDED.contact_name,dispatch_type=EXCLUDED.dispatch_type,
      internal_notes=concat_ws(E'\n',
        NULLIF(btrim(regexp_replace(COALESCE(existing_job.internal_notes,''), E'(^|\\n)Delivery address:[^\\n]*', '', 'g')), ''),
        CASE WHEN EXCLUDED.dispatch_type='delivery' AND $7::text IS NOT NULL THEN 'Delivery address: ' || $7::text ELSE NULL END),
      payload_json=EXCLUDED.payload_json,updated_at=now()
    RETURNING id
  `, [tenantId, input.externalOrderId, input.orderNumber, input.clientName, input.contactName ?? null,
    dispatchType, deliveryAddress, input.linkedCustomerId ?? null, JSON.stringify(input.payloadJson ?? {}), input.quoteId]);
  const jobId = jobResult.rows[0]?.id;
  if (!jobId) throw new Error("Could not create a production job for the website order");

  const lines = await pool.query<{
    id: string; productName: string; optionSummary: string | null; quantity: string;
    configurationSnapshot: Record<string, unknown>;
  }>(`
    SELECT id,product_name AS "productName",option_summary AS "optionSummary",quantity::text AS quantity,
      configuration_snapshot AS "configurationSnapshot"
    FROM sales.quote_lines WHERE quote_id=$1::uuid ORDER BY created_at ASC
  `, [input.quoteId]);
  let artworkFileCount = 0;
  for (let index = 0; index < lines.rows.length; index += 1) {
    const line = lines.rows[index];
    const snapshot = asJsonRecord(line.configurationSnapshot);
    const rawConfiguration = asJsonRecord(snapshot.rawConfiguration);
    const selectedImage = asJsonRecord(snapshot.selectedImage ?? rawConfiguration.selectedImage);
    const answers = asJsonRecord(snapshot.answers);
    const displayAnswers = asJsonRecord(snapshot.displayAnswers);
    const autoMaterialSelections = Array.isArray(snapshot.autoMaterialSelections) ? snapshot.autoMaterialSelections : [];
    const autoStockSummary = autoMaterialSelections.flatMap((rawSelection) => {
      const selection = asJsonRecord(rawSelection);
      const materialName = jsonText(selection.materialName);
      if (!materialName) return [];
      const customerChoice = jsonText(selection.customerChoice) || jsonText(selection.componentLabel);
      const rollWidth = Number(selection.rollWidthMm);
      return [`${customerChoice ? `${customerChoice}: ` : ""}${materialName}${Number.isFinite(rollWidth) && rollWidth > 0 ? ` (${rollWidth} mm roll)` : ""}`];
    }).join(" · ");
    const internalFinishingSummary = [line.optionSummary, autoStockSummary ? `Auto-selected stock: ${autoStockSummary}` : null].filter(Boolean).join(" · ");
    const files = websiteArtworkFiles(rawConfiguration.artworkFiles ?? snapshot.artworkFiles);
    artworkFileCount += files.length;
    const firstFile = files[0];
    const width = Number(snapshot.widthMm);
    const height = Number(snapshot.heightMm);
    const sizeSummary = Number.isFinite(width) && Number.isFinite(height) ? `${width} × ${height} mm` : null;
    const itemResult = await pool.query<{ id: string }>(`
      INSERT INTO production.production_items (
        job_id,source_quote_line_id,title,production_type,quantity,size_summary,substrate_summary,
        finishing_summary,print_ready_url,print_ready_storage_path,print_ready_file_name,print_ready_file_type,
        print_ready_notes,print_ready_uploaded_at,print_ready_uploaded_by,status,sort_order,payload_json,created_at,updated_at
      ) VALUES (
        $1::uuid,$2::uuid,$3::varchar,'signage',$4::numeric,$5::text,$6::text,$7::text,
        $8::text,$9::text,$10::varchar,$11::varchar,$12::text,
        CASE WHEN $8::text IS NULL THEN NULL ELSE now() END,
        CASE WHEN $8::text IS NULL THEN NULL ELSE 'WooCommerce customer upload' END,
        CASE WHEN $8::text IS NULL THEN 'waiting_on_file' ELSE 'ready_to_start' END,$13::int,$14::jsonb,now(),now()
      )
      ON CONFLICT (job_id,source_quote_line_id) WHERE source_quote_line_id IS NOT NULL
      DO UPDATE SET title=EXCLUDED.title,quantity=EXCLUDED.quantity,size_summary=EXCLUDED.size_summary,
        substrate_summary=EXCLUDED.substrate_summary,finishing_summary=EXCLUDED.finishing_summary,
        print_ready_url=EXCLUDED.print_ready_url,print_ready_storage_path=EXCLUDED.print_ready_storage_path,
        print_ready_file_name=EXCLUDED.print_ready_file_name,print_ready_file_type=EXCLUDED.print_ready_file_type,
        print_ready_notes=EXCLUDED.print_ready_notes,print_ready_uploaded_at=EXCLUDED.print_ready_uploaded_at,
        print_ready_uploaded_by=EXCLUDED.print_ready_uploaded_by,status=EXCLUDED.status,payload_json=EXCLUDED.payload_json,updated_at=now()
      RETURNING id
    `, [jobId, line.id, line.productName, normaliseMoney(line.quantity, "1"), sizeSummary,
      displayAnswerText(displayAnswers, /material|substrate|stock/i) || jsonText(answers.material) || jsonText(answers.substrate), internalFinishingSummary,
      firstFile?.downloadUrl ?? null, firstFile?.storagePath ?? null, firstFile?.name ?? null,
      firstFile?.mime ?? null, files.length > 1 ? `${files.length} artwork files supplied; all links are stored on this item.` : null,
      index, JSON.stringify({ source: "wordpress_woocommerce", answers, displayAnswers, autoMaterialSelections, selectedImage, artworkFiles: files, rawConfiguration })]);
    const itemId = itemResult.rows[0]?.id;
    if (!itemId) continue;
    const steps = stepPlanForItem({
      productionType: "signage", title: line.productName, substrateSummary: displayAnswerText(displayAnswers, /material|substrate|stock/i) || jsonText(answers.material) || jsonText(answers.substrate),
      colourSummary: displayAnswerText(displayAnswers, /^ink$/i) || jsonText(answers.ink), finishingSummary: line.optionSummary, sizeSummary, quoteProductName: line.productName,
      quoteOptionSummary: line.optionSummary
    });
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
      const label = steps[stepIndex];
      await pool.query(`
        INSERT INTO production.production_steps(job_id,item_id,label,step_type,status,sort_order,created_at,updated_at)
        VALUES($1::uuid,$2::uuid,$3::varchar,$4::varchar,'pending',$5::int,now(),now())
        ON CONFLICT (job_id,item_id,(lower(label))) WHERE item_id IS NOT NULL
        DO UPDATE SET sort_order=EXCLUDED.sort_order,updated_at=now()
      `, [jobId, itemId, label, cleanSearchText(label).replace(/\s+/g, "_"), index * 100 + stepIndex + 1]);
    }
  }
  await pool.query(`UPDATE production.production_jobs SET status=$2::varchar,updated_at=now() WHERE id=$1::uuid`, [
    jobId, artworkFileCount > 0 ? "ready_to_start" : "waiting_on_files"
  ]);
  return { id: jobId, artworkFileCount };
}

export async function syncProductionJobForTenant(tenantId: string, jobId: string): Promise<void> {
  const job = await getProductionJobById(tenantId, jobId);
  if (!job) return;
  await syncProductionItemsAndSteps(job.id);
}

export async function updateProductionJobDetailsForTenant(tenantId: string, jobId: string, input: {
  dispatchType?: string | null;
  dispatchNotes?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;
  internalNotes?: string | null;
}): Promise<void> {
  await ensureProductionTables();
  await pool.query(`
    UPDATE production.production_jobs
    SET dispatch_type = NULLIF($3::text, '')::varchar,
        priority = $4::varchar,
        due_date = NULLIF($5::text, '')::date,
        assigned_to = $6::varchar,
        internal_notes = $7::text,
        payload_json = jsonb_set(
          jsonb_set(COALESCE(payload_json, '{}'::jsonb), '{dispatchType}', to_jsonb(COALESCE(NULLIF($3::text, ''), '')::text), true),
          '{dispatchNotes}', to_jsonb(COALESCE(NULLIF($8::text, ''), '')::text), true
        ),
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, jobId, nullableText(input.dispatchType), nullableText(input.priority) ?? "normal", nullableText(input.dueDate), nullableText(input.assignedTo), nullableText(input.internalNotes), nullableText(input.dispatchNotes)]);

  if (input.dispatchType) {
    await setProductionJobDispatchTypeForTenant(tenantId, jobId, input.dispatchType);
  }
}


export async function setProductionJobDispatchTypeForTenant(tenantId: string, jobId: string, dispatchType: string | null): Promise<void> {
  await ensureProductionTables();
  const normalised = normaliseDispatchType(dispatchType);
  const readyLabel = readyStepLabelForDispatch(normalised);
  const stepType = dispatchStepTypeForDispatch(normalised);

  await pool.query(`
    UPDATE production.production_jobs
    SET dispatch_type = $3::varchar,
        payload_json = jsonb_set(COALESCE(payload_json, '{}'::jsonb), '{dispatchType}', to_jsonb($3::text), true),
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, jobId, normalised]);

  if (!readyLabel) return;

  await pool.query(`
    WITH ready_steps AS (
      SELECT ps.id,
             row_number() OVER (PARTITION BY ps.item_id ORDER BY ps.sort_order DESC, ps.updated_at DESC, ps.created_at DESC) as keep_rank
      FROM production.production_steps ps
      JOIN production.production_jobs pj ON pj.id = ps.job_id
      WHERE pj.tenant_id = $1::uuid
        AND ps.job_id = $2::uuid
        AND ps.item_id IS NOT NULL
        AND (
          lower(ps.label) LIKE 'ready for%'
          OR lower(ps.label) LIKE 'ready%install%'
          OR lower(ps.label) LIKE 'ready%pickup%'
          OR lower(ps.label) LIKE 'ready%delivery%'
          OR ps.step_type IN ('ready_for_dispatch','ready_for_install','ready_for_delivery','ready_for_pickup')
        )
    )
    DELETE FROM production.production_steps ps
    USING ready_steps rs
    WHERE ps.id = rs.id
      AND rs.keep_rank > 1
      AND ps.status <> 'done'
  `, [tenantId, jobId]);

  await pool.query(`
    UPDATE production.production_steps ps
    SET label = $3::varchar,
        step_type = $4::varchar,
        updated_at = now()
    FROM production.production_jobs pj
    WHERE pj.id = ps.job_id
      AND pj.tenant_id = $1::uuid
      AND ps.job_id = $2::uuid
      AND (
        lower(ps.label) LIKE 'ready for%'
        OR lower(ps.label) LIKE 'ready%install%'
        OR lower(ps.label) LIKE 'ready%pickup%'
        OR lower(ps.label) LIKE 'ready%delivery%'
        OR ps.step_type IN ('ready_for_dispatch','ready_for_install','ready_for_delivery','ready_for_pickup')
      )
  `, [tenantId, jobId, readyLabel, stepType]);

  await pool.query(`
    INSERT INTO production.production_steps (job_id, item_id, label, step_type, status, sort_order, created_at, updated_at)
    SELECT pi.job_id,
           pi.id,
           $3::varchar,
           $4::varchar,
           'pending',
           COALESCE((SELECT max(ps.sort_order) + 1 FROM production.production_steps ps WHERE ps.item_id = pi.id), 999),
           now(),
           now()
    FROM production.production_items pi
    JOIN production.production_jobs pj ON pj.id = pi.job_id
    WHERE pj.tenant_id = $1::uuid
      AND pi.job_id = $2::uuid
      AND NOT EXISTS (
        SELECT 1
        FROM production.production_steps existing
        WHERE existing.item_id = pi.id
          AND (
            lower(existing.label) LIKE 'ready for%'
            OR existing.step_type IN ('ready_for_dispatch','ready_for_install','ready_for_delivery','ready_for_pickup')
          )
      )
  `, [tenantId, jobId, readyLabel, stepType]);
}

export async function addProductionJobVariationLineForTenant(tenantId: string, jobId: string, input: {
  dispatchType?: string | null;
  productName?: string | null;
  optionSummary?: string | null;
  quantity?: string | null;
  unitPrice?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  await ensureProductionTables();
  const normalisedDispatch = normaliseDispatchType(input.dispatchType);
  const productName = nullableText(input.productName) ?? variationProductNameForDispatch(normalisedDispatch);
  const quantity = normaliseMoney(input.quantity, "1");
  const unitPrice = normaliseMoney(input.unitPrice, "0");
  const notes = [
    "Variation added from production job.",
    normalisedDispatch ? `Dispatch type: ${normalisedDispatch}` : null,
    nullableText(input.notes),
    input.createdBy ? `Added by: ${input.createdBy}` : null
  ].filter(Boolean).join("\n");

  await pool.query(`
    WITH target_job AS (
      SELECT id, quote_id
      FROM production.production_jobs
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      LIMIT 1
    ), inserted_line AS (
      INSERT INTO sales.quote_lines (
        quote_id,
        product_id,
        product_name,
        option_summary,
        quantity,
        unit_price,
        line_total,
        notes,
        created_at,
        updated_at
      )
      SELECT
        target_job.quote_id,
        NULL::uuid,
        $3::varchar,
        $4::text,
        $5::numeric,
        $6::numeric,
        ($5::numeric * $6::numeric),
        $7::text,
        now(),
        now()
      FROM target_job
      RETURNING quote_id
    )
    UPDATE sales.quote_drafts qd
    SET updated_at = now(),
        myob_order_status = CASE WHEN qd.myob_order_status = 'synced' THEN 'ready_to_sync' ELSE qd.myob_order_status END,
        myob_order_sync_error = NULL
    WHERE qd.tenant_id = $1::uuid
      AND qd.id IN (SELECT quote_id FROM inserted_line)
  `, [
    tenantId,
    jobId,
    productName,
    nullableText(input.optionSummary),
    quantity,
    unitPrice,
    notes
  ]);

  await pool.query(`
    UPDATE production.production_jobs
    SET payload_json = jsonb_set(
          COALESCE(payload_json, '{}'::jsonb),
          '{lastVariation}',
          $3::jsonb,
          true
        ),
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, jobId, JSON.stringify({ productName, quantity, unitPrice, optionSummary: nullableText(input.optionSummary), notes, addedAt: new Date().toISOString() })]);
}

export async function setProductionJobStatusForTenant(tenantId: string, jobId: string, status: string): Promise<void> {
  await ensureProductionTables();
  await pool.query(`
    UPDATE production.production_jobs
    SET status = $3::varchar,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, jobId, status]);
}

type ProductionJobAutoStatus = "waiting_on_files" | "ready_to_start" | "in_production" | "ready_for_dispatch" | "completed";

function isPreProductionStep(stepType: string | null | undefined, label: string | null | undefined): boolean {
  const value = cleanSearchText(`${stepType} ${label}`).replace(/\s+/g, "_");
  return value.includes("artwork_checked") || value.includes("print_ready_file_attached");
}

function isDispatchReadyStep(stepType: string | null | undefined, label: string | null | undefined): boolean {
  const value = cleanSearchText(`${stepType} ${label}`).replace(/\s+/g, "_");
  return /ready_(?:for|to)_(?:dispatch|install|pickup|delivery)/.test(value)
    || /ready_for_install_pickup_delivery/.test(value)
    || /ready_for_pickup_delivery/.test(value);
}

async function autoProgressProductionJobStatusForTenant(tenantId: string, jobId: string): Promise<ProductionJobAutoStatus | null> {
  const result = await pool.query<{
    currentStatus: string;
    stepType: string | null;
    label: string | null;
    status: string | null;
    missingPrintReadyFiles: boolean;
  }>(`
    SELECT
      pj.status AS "currentStatus",
      ps.step_type AS "stepType",
      ps.label,
      ps.status,
      EXISTS (
        SELECT 1
        FROM production.production_items pi
        WHERE pi.job_id = pj.id
          AND NULLIF(btrim(COALESCE(pi.print_ready_url, '')), '') IS NULL
      ) AS "missingPrintReadyFiles"
    FROM production.production_jobs pj
    LEFT JOIN production.production_steps ps ON ps.job_id = pj.id
    WHERE pj.tenant_id = $1::uuid
      AND pj.id = $2::uuid
    ORDER BY ps.sort_order ASC NULLS LAST, ps.created_at ASC NULLS LAST
  `, [tenantId, jobId]);

  const currentStatus = result.rows[0]?.currentStatus ?? "";
  if (!currentStatus || currentStatus === "deleted") return null;
  const steps = result.rows.filter((row) => row.stepType || row.label);
  if (!steps.length) return null;

  const allDone = steps.every((step) => step.status === "done");
  const dispatchSteps = steps.filter((step) => isDispatchReadyStep(step.stepType, step.label));
  const dispatchDone = dispatchSteps.length > 0 && dispatchSteps.every((step) => step.status === "done");
  const productionStarted = steps.some((step) => step.status === "done" && !isPreProductionStep(step.stepType, step.label) && !isDispatchReadyStep(step.stepType, step.label));
  const missingPrintReadyFiles = Boolean(result.rows[0]?.missingPrintReadyFiles);

  let nextStatus: ProductionJobAutoStatus;
  if (allDone) nextStatus = "completed";
  else if (dispatchDone) nextStatus = "ready_for_dispatch";
  else if (productionStarted) nextStatus = "in_production";
  else if (currentStatus === "waiting_on_material") return null;
  else if (missingPrintReadyFiles) nextStatus = "waiting_on_files";
  else nextStatus = "ready_to_start";

  if (nextStatus === currentStatus) return nextStatus;
  await pool.query(`
    UPDATE production.production_jobs
    SET status = $3::varchar,
        updated_at = now()
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
      AND status <> 'deleted'
  `, [tenantId, jobId, nextStatus]);
  return nextStatus;
}

export async function setProductionStepStatusForTenant(tenantId: string, stepId: string, status: "pending" | "done", checkedBy?: string | null): Promise<{
  jobId: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
  isInstallHandoff: boolean;
  jobStatus: ProductionJobAutoStatus | null;
}> {
  const result = await pool.query<{ jobId: string; checkedAt: string | null; checkedBy: string | null; stepType: string; label: string }>(`
    WITH updated_step AS (
      UPDATE production.production_steps ps
      SET status = $3::varchar,
          checked_at = CASE WHEN $3 = 'done' THEN now() ELSE NULL END,
          checked_by = CASE WHEN $3 = 'done' THEN $4::varchar ELSE NULL END,
          updated_at = now()
      FROM production.production_jobs pj
      WHERE ps.job_id = pj.id
        AND pj.tenant_id = $1::uuid
        AND ps.id = $2::uuid
      RETURNING ps.job_id, ps.item_id, ps.checked_at, ps.checked_by, ps.step_type, ps.label
    ), updated_item AS (
      UPDATE production.production_items pi
      SET updated_at = now()
      FROM updated_step us
      WHERE pi.id = us.item_id
      RETURNING pi.id
    ), updated_job AS (
      UPDATE production.production_jobs pj
      SET updated_at = now()
      FROM updated_step us
      WHERE pj.id = us.job_id
      RETURNING pj.id
    )
    SELECT job_id as "jobId",checked_at as "checkedAt",checked_by as "checkedBy",step_type as "stepType",label
    FROM updated_step
  `, [tenantId, stepId, status, checkedBy ?? null]);
  const row = result.rows[0];
  const handoffText = `${row?.stepType ?? ""} ${row?.label ?? ""}`.toLowerCase();
  const jobStatus = row?.jobId ? await autoProgressProductionJobStatusForTenant(tenantId, row.jobId) : null;
  return {
    jobId: row?.jobId ?? null,
    checkedAt: row?.checkedAt ?? null,
    checkedBy: row?.checkedBy ?? null,
    isInstallHandoff: /ready[_ ]for[_ ]install|ready[_ ]to[_ ]install/.test(handoffText),
    jobStatus
  };
}


export async function getProductionInstallSchedulerPayloadForStep(tenantId: string, stepId: string): Promise<{
  payload: ProductionInstallSchedulerPayload;
  alreadyCreatedJobId: string | null;
  alreadyCreatedJobUrl: string | null;
} | null> {
  await ensureProductionTables();
  const result = await pool.query<{
    stepId: string;
    stepLabel: string;
    stepType: string;
    jobId: string;
    itemId: string | null;
    quoteId: string | null;
    quoteNumber: string | null;
    clientName: string;
    contactName: string | null;
    projectName: string | null;
    priority: string | null;
    dispatchType: string | null;
    dueDate: string | null;
    assignedTo: string | null;
    itemCode: string | null;
    itemTitle: string | null;
    productionType: string | null;
    quantity: string | null;
    sizeSummary: string | null;
    substrateSummary: string | null;
    colourSummary: string | null;
    finishingSummary: string | null;
    quoteProductName: string | null;
    quoteOptionSummary: string | null;
    quotePhone: string | null;
    quoteEmail: string | null;
    artworkSiteAddress: string | null;
    enquirySiteAddress: string | null;
    enquiryClientLogoUrl: string | null;
    enquiryClientLogoStoragePath: string | null;
    customerLogoUrl: string | null;
    latestSurveyPayload: unknown | null;
    existingJobId: string | null;
    existingJobUrl: string | null;
  }>(`
    SELECT
      ps.id as "stepId",
      ps.label as "stepLabel",
      ps.step_type as "stepType",
      pj.id as "jobId",
      pi.id as "itemId",
      pj.quote_id as "quoteId",
      pj.quote_number as "quoteNumber",
      pj.client_name as "clientName",
      pj.contact_name as "contactName",
      pj.project_name as "projectName",
      pj.priority,
      pj.dispatch_type as "dispatchType",
      pj.due_date::text as "dueDate",
      pj.assigned_to as "assignedTo",
      pi.item_code as "itemCode",
      pi.title as "itemTitle",
      pi.production_type as "productionType",
      pi.quantity::text as quantity,
      pi.size_summary as "sizeSummary",
      pi.substrate_summary as "substrateSummary",
      pi.colour_summary as "colourSummary",
      pi.finishing_summary as "finishingSummary",
      ql.product_name as "quoteProductName",
      ql.option_summary as "quoteOptionSummary",
      qd.phone as "quotePhone",
      qd.email as "quoteEmail",
      aa.site_address as "artworkSiteAddress",
      e.site_address as "enquirySiteAddress",
      e.client_logo_url as "enquiryClientLogoUrl",
      e.client_logo_storage_path as "enquiryClientLogoStoragePath",
      c.payload_json->>'logoUrl' as "customerLogoUrl",
      latest_survey.install_scheduler_payload as "latestSurveyPayload",
      pj.payload_json->'installSchedulerInstall'->>'jobId' as "existingJobId",
      pj.payload_json->'installSchedulerInstall'->>'jobUrl' as "existingJobUrl"
    FROM production.production_steps ps
    JOIN production.production_jobs pj ON pj.id = ps.job_id
    LEFT JOIN production.production_items pi ON pi.id = ps.item_id
    LEFT JOIN sales.quote_lines ql ON ql.id = pi.source_quote_line_id
    LEFT JOIN sales.quote_drafts qd ON qd.id = pj.quote_id
    LEFT JOIN sales.artwork_approvals aa ON aa.id = pj.artwork_approval_id
    LEFT JOIN app.enquiries e ON e.id = qd.enquiry_id
    LEFT JOIN app.customers c ON c.id = qd.linked_customer_id
    LEFT JOIN LATERAL (
      SELECT sr.install_scheduler_payload
      FROM app.survey_requests sr
      WHERE sr.tenant_id = pj.tenant_id
        AND sr.install_scheduler_payload IS NOT NULL
        AND (
          (qd.survey_request_id IS NOT NULL AND sr.id = qd.survey_request_id)
          OR (qd.enquiry_id IS NOT NULL AND sr.enquiry_id = qd.enquiry_id)
          OR (qd.linked_customer_id IS NOT NULL AND sr.linked_customer_id = qd.linked_customer_id)
        )
      ORDER BY sr.completed_at DESC NULLS LAST, sr.updated_at DESC
      LIMIT 1
    ) latest_survey ON true
    WHERE pj.tenant_id = $1::uuid
      AND ps.id = $2::uuid
    LIMIT 1
  `, [tenantId, stepId]);

  const row = result.rows[0];
  if (!row || !isReadyHandoffText([row.stepLabel, row.stepType].join(" "))) return null;

  const destinationSource = [
    row.dispatchType,
    row.projectName,
    row.itemTitle,
    row.productionType,
    row.sizeSummary,
    row.substrateSummary,
    row.colourSummary,
    row.finishingSummary,
    row.quoteProductName,
    row.quoteOptionSummary
  ].filter(Boolean).join(" · ");
  const destinationSourceClean = cleanSearchText(destinationSource);
  const dispatchColumn = normaliseDispatchType(row.dispatchType);
  const hasSpecificDestination = /\b(pickup|pick up|collect|collection|counter|deliver|delivery|courier|freight|drop off|dispatch|install|installed|installer|site install|site)\b/.test(destinationSourceClean);
  const stepLabelClean = cleanSearchText(row.stepLabel);
  const genericReadyLabel = /ready/.test(stepLabelClean) && /install/.test(stepLabelClean) && /pickup/.test(stepLabelClean) && /delivery/.test(stepLabelClean);
  const destination = dispatchColumn === "delivery" ? "deliver" : dispatchColumn ?? (hasSpecificDestination
    ? destinationColumnFromText(destinationSource, "install")
    : genericReadyLabel ? "install" : destinationColumnFromText(row.stepLabel, "install"));

  if (destination !== "install") return null;

  const installSummary = buildInstallSchedulerProductionDetails(row);
  const referencePhotos = surveyReferencePhotosFromPayload(row.latestSurveyPayload);
  const jobName = [row.clientName, row.quoteNumber].filter(Boolean).join(" - ") || row.clientName;

  const payload: ProductionInstallSchedulerPayload = {
    tenantId,
    productionManagerJobId: row.jobId,
    productionManagerItemId: row.itemId,
    productionManagerStepId: row.stepId,
    quoteId: row.quoteId,
    quoteNumber: row.quoteNumber,
    clientName: row.clientName,
    contactName: row.contactName,
    phone: row.quotePhone,
    email: row.quoteEmail,
    siteAddress: row.artworkSiteAddress || row.enquirySiteAddress,
    dueDate: row.dueDate,
    assignedTo: row.assignedTo,
    priority: row.priority,
    projectName: row.projectName,
    jobName,
    description: installSummary.description,
    itemSummary: installSummary.itemSummary,
    substrateSummary: installSummary.substrateSummary ?? row.substrateSummary,
    colourSummary: installSummary.printSummary ?? row.colourSummary,
    finishingSummary: [installSummary.laminateSummary ? `Laminate: ${installSummary.laminateSummary}` : null, ...installSummary.finishingDetails].filter(Boolean).join(" · ") || row.finishingSummary,
    quoteProductName: row.quoteProductName,
    quoteOptionSummary: row.quoteOptionSummary,
    readyStepLabel: row.stepLabel,
    destination,
    productionManagerBaseUrl: cleanBaseUrl(process.env.NEXT_PUBLIC_APP_URL),
    clientLogoUrl: row.enquiryClientLogoUrl || row.customerLogoUrl || null,
    clientLogoStoragePath: row.enquiryClientLogoStoragePath,
    referencePhotos,
  };

  return { payload, alreadyCreatedJobId: row.existingJobId, alreadyCreatedJobUrl: row.existingJobUrl };
}

export async function recordProductionInstallSchedulerBridgeResultForStep(tenantId: string, stepId: string, input: {
  status: "created" | "error" | "not_configured" | "skipped";
  jobId?: string | null;
  jobUrl?: string | null;
  error?: string | null;
}): Promise<void> {
  await ensureProductionTables();
  await pool.query(`
    UPDATE production.production_jobs pj
    SET payload_json = jsonb_set(
          COALESCE(pj.payload_json, '{}'::jsonb),
          '{installSchedulerInstall}',
          $3::jsonb,
          true
        ),
        updated_at = now()
    FROM production.production_steps ps
    WHERE ps.job_id = pj.id
      AND pj.tenant_id = $1::uuid
      AND ps.id = $2::uuid
  `, [tenantId, stepId, JSON.stringify({
    status: input.status,
    jobId: input.jobId ?? null,
    jobUrl: input.jobUrl ?? null,
    error: input.error ?? null,
    stepId,
    syncedAt: new Date().toISOString(),
  })]);
}

export async function addProductionStepForTenant(tenantId: string, jobId: string, itemId: string | null, label: string): Promise<void> {
  await ensureProductionTables();
  await pool.query(`
    INSERT INTO production.production_steps (job_id, item_id, label, step_type, status, sort_order, created_at, updated_at)
    SELECT pj.id,
           NULLIF($3::text, '')::uuid,
           $4::varchar,
           'manual',
           'pending',
           COALESCE((SELECT max(sort_order) + 1 FROM production.production_steps WHERE job_id = pj.id AND (($3::text = '' AND item_id IS NULL) OR item_id = NULLIF($3::text, '')::uuid)), 999),
           now(),
           now()
    FROM production.production_jobs pj
    WHERE pj.tenant_id = $1::uuid AND pj.id = $2::uuid
  `, [tenantId, jobId, itemId ?? "", label]);
}

export async function updateProductionItemPrintReadyFileForTenant(tenantId: string, itemId: string, input: {
  fileUrl: string;
  storagePath?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  notes?: string | null;
  uploadedBy?: string | null;
}): Promise<{ jobId: string | null }> {
  await ensureProductionTables();
  const result = await pool.query<{ jobId: string }>(`
    UPDATE production.production_items pi
    SET print_ready_url = $3::text,
        print_ready_storage_path = $4::text,
        print_ready_file_name = $5::varchar,
        print_ready_file_type = $6::varchar,
        print_ready_notes = $7::text,
        print_ready_uploaded_at = now(),
        print_ready_uploaded_by = $8::varchar,
        status = 'file_attached',
        updated_at = now()
    FROM production.production_jobs pj
    WHERE pi.job_id = pj.id
      AND pj.tenant_id = $1::uuid
      AND pi.id = $2::uuid
    RETURNING pi.job_id as "jobId"
  `, [tenantId, itemId, input.fileUrl, input.storagePath ?? null, input.fileName ?? null, input.fileType ?? null, input.notes ?? null, input.uploadedBy ?? null]);

  const jobId = result.rows[0]?.jobId ?? null;
  if (jobId) {
    await pool.query(`
      UPDATE production.production_steps
      SET status = 'done', checked_at = COALESCE(checked_at, now()), checked_by = COALESCE(checked_by, $3), updated_at = now()
      WHERE job_id = $1::uuid
        AND item_id = $2::uuid
        AND lower(label) = lower('Print-ready file attached')
    `, [jobId, itemId, input.uploadedBy ?? null]);
    await autoProgressProductionJobStatusForTenant(tenantId, jobId);
  }
  return { jobId };
}

export async function removeProductionItemPrintReadyFileForTenant(tenantId: string, itemId: string): Promise<{ jobId: string | null }> {
  await ensureProductionTables();
  const result = await pool.query<{ jobId: string }>(`
    UPDATE production.production_items pi
    SET print_ready_url = NULL,
        print_ready_storage_path = NULL,
        print_ready_file_name = NULL,
        print_ready_file_type = NULL,
        print_ready_notes = NULL,
        print_ready_uploaded_at = NULL,
        print_ready_uploaded_by = NULL,
        status = 'waiting_on_file',
        updated_at = now()
    FROM production.production_jobs pj
    WHERE pi.job_id = pj.id
      AND pj.tenant_id = $1::uuid
      AND pi.id = $2::uuid
    RETURNING pi.job_id as "jobId"
  `, [tenantId, itemId]);

  const jobId = result.rows[0]?.jobId ?? null;
  if (jobId) {
    await pool.query(`
      UPDATE production.production_steps
      SET status = 'pending', checked_at = NULL, checked_by = NULL, updated_at = now()
      WHERE job_id = $1::uuid
        AND item_id = $2::uuid
        AND lower(label) = lower('Print-ready file attached')
    `, [jobId, itemId]);
    await autoProgressProductionJobStatusForTenant(tenantId, jobId);
  }
  return { jobId };
}

export async function removeProductionJobForTenant(tenantId: string, jobId: string): Promise<void> {
  await setProductionJobStatusForTenant(tenantId, jobId, "deleted");
}

export async function restoreProductionJobForTenant(tenantId: string, jobId: string): Promise<void> {
  await setProductionJobStatusForTenant(tenantId, jobId, "ready_to_start");
}

export async function getProductionItemByIdForTenant(tenantId: string, itemId: string): Promise<ProductionItemRecord | null> {
  const result = await pool.query<ProductionItemRecord>(`
    SELECT
      pi.id,
      pi.job_id as "jobId",
      pi.artwork_page_id as "artworkPageId",
      pi.source_quote_line_id as "sourceQuoteLineId",
      pi.item_code as "itemCode",
      pi.title,
      pi.production_type as "productionType",
      pi.quantity::text as quantity,
      pi.size_summary as "sizeSummary",
      pi.substrate_summary as "substrateSummary",
      pi.colour_summary as "colourSummary",
      pi.finishing_summary as "finishingSummary",
      pi.proof_image_url as "proofImageUrl",
      pi.proof_file_name as "proofFileName",
      NULLIF(pi.payload_json -> 'selectedImage' ->> 'url','') as "selectedImageUrl",
      NULLIF(pi.payload_json -> 'selectedImage' ->> 'alt','') as "selectedImageAlt",
      pi.print_ready_url as "printReadyUrl",
      pi.print_ready_storage_path as "printReadyStoragePath",
      pi.print_ready_file_name as "printReadyFileName",
      pi.print_ready_file_type as "printReadyFileType",
      pi.print_ready_notes as "printReadyNotes",
      pi.print_ready_uploaded_at as "printReadyUploadedAt",
      pi.print_ready_uploaded_by as "printReadyUploadedBy",
      pi.status,
      pi.sort_order as "sortOrder",
      pi.created_at as "createdAt",
      pi.updated_at as "updatedAt"
    FROM production.production_items pi
    JOIN production.production_jobs pj ON pj.id = pi.job_id
    WHERE pj.tenant_id = $1::uuid AND pi.id = $2::uuid
    LIMIT 1
  `, [tenantId, itemId]);
  return result.rows[0] ?? null;
}
