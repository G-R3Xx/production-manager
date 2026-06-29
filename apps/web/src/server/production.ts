import "server-only";

import { pool } from "@production-manager/db";

export type ProductionJobRecord = {
  id: string;
  tenantId: string;
  artworkApprovalId: string;
  quoteId: string;
  quoteNumber: string | null;
  clientName: string;
  contactName: string | null;
  projectName: string | null;
  status: string;
  priority: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  internalNotes: string | null;
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
  printReadyUrl: string | null;
  printReadyStoragePath: string | null;
  printReadyFileName: string | null;
  printReadyFileType: string | null;
  printReadyNotes: string | null;
  printReadyUploadedAt: string | null;
  printReadyUploadedBy: string | null;
  quoteProductName: string | null;
  quoteOptionSummary: string | null;
  quoteLineNotes: string | null;
  quoteLineTotal: string | null;
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
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
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

export type ProductionBoardColumnKey = "printing" | "finishing" | "install" | "deliver" | "pickup";

export type ProductionBoardCardRecord = {
  id: string;
  column: ProductionBoardColumnKey;
  jobId: string;
  itemId: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  clientName: string;
  contactName: string | null;
  projectName: string | null;
  jobStatus: string;
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
  stepsDone: string;
  stepsTotal: string;
  updatedAt: string;
};

function nullableText(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim();
  return cleaned.length ? cleaned : null;
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

function uniqueSteps(steps: string[]): string[] {
  const seen = new Set<string>();
  return steps.filter((step) => {
    const key = cleanSearchText(step);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      ADD COLUMN IF NOT EXISTS priority varchar(50),
      ADD COLUMN IF NOT EXISTS due_date date,
      ADD COLUMN IF NOT EXISTS assigned_to varchar(255),
      ADD COLUMN IF NOT EXISTS internal_notes text,
      ADD COLUMN IF NOT EXISTS payload_json jsonb NOT NULL DEFAULT '{}'::jsonb
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_artwork_approval_unique_idx
      ON production.production_jobs (artwork_approval_id)
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
      priority,
      due_date::text as "dueDate",
      assigned_to as "assignedTo",
      internal_notes as "internalNotes",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;
}

export async function listProductionJobsForTenant(tenantId: string, options?: { includeDeleted?: boolean }): Promise<ProductionJobRecord[]> {
  await ensureProductionTables();
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

export async function getProductionJobById(tenantId: string, jobId: string): Promise<ProductionJobRecord | null> {
  await ensureProductionTables();
  const result = await pool.query<ProductionJobRecord>(`
    SELECT ${productionJobSelectSql()}
    FROM production.production_jobs
    WHERE tenant_id = $1::uuid AND id = $2::uuid
    LIMIT 1
  `, [tenantId, jobId]);
  return result.rows[0] ?? null;
}

export async function getProductionJobForArtworkApproval(tenantId: string, approvalId: string): Promise<ProductionJobRecord | null> {
  await ensureProductionTables();
  const result = await pool.query<ProductionJobRecord>(`
    SELECT ${productionJobSelectSql()}
    FROM production.production_jobs
    WHERE tenant_id = $1::uuid AND artwork_approval_id = $2::uuid
    LIMIT 1
  `, [tenantId, approvalId]);
  return result.rows[0] ?? null;
}

export async function listProductionItemsForJob(jobId: string): Promise<ProductionItemRecord[]> {
  await ensureProductionTables();
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
      pi.print_ready_url as "printReadyUrl",
      pi.print_ready_storage_path as "printReadyStoragePath",
      pi.print_ready_file_name as "printReadyFileName",
      pi.print_ready_file_type as "printReadyFileType",
      pi.print_ready_notes as "printReadyNotes",
      pi.print_ready_uploaded_at as "printReadyUploadedAt",
      pi.print_ready_uploaded_by as "printReadyUploadedBy",
      ql.product_name as "quoteProductName",
      ql.option_summary as "quoteOptionSummary",
      ql.notes as "quoteLineNotes",
      ql.line_total::text as "quoteLineTotal",
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
export async function listProductionStepsForJob(jobId: string): Promise<ProductionStepRecord[]> {
  await ensureProductionTables();
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
      sort_order as "sortOrder",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM production.production_steps
    WHERE job_id = $1::uuid
    ORDER BY item_id NULLS FIRST, sort_order ASC, created_at ASC
  `, [jobId]);
  return result.rows;
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
  return "printing";
}

function productionBoardColumnForNextStep(row: Omit<ProductionBoardCardRecord, "id" | "column">): ProductionBoardColumnKey {
  const nextStep = cleanSearchText([row.nextStepLabel, row.nextStepType].filter(Boolean).join(" · "));

  if (!nextStep) {
    return productionBoardColumnForText([
      row.jobStatus,
      row.projectName,
      row.itemTitle,
      row.productionType,
      row.substrateSummary,
      row.colourSummary,
      row.finishingSummary,
      row.quoteProductName,
      row.quoteOptionSummary
    ].filter(Boolean).join(" · "));
  }

  if (/\b(ready for install|install|installed|installer|site install)\b/.test(nextStep)) return "install";
  if (/\b(ready for delivery|deliver|delivery|courier|freight|drop off|dispatch)\b/.test(nextStep)) return "deliver";
  if (/\b(ready for pickup|pickup|pick up|collect|collection)\b/.test(nextStep)) return "pickup";

  if (/\b(laminate|lamination|cello|fold|score|crease|bind|staple|number|numbering|pad|tape|trim|guillotine|cut|route|router|cnc|jingwei|finish|finishing|quality|pack|packed|apply|mount|mounted|eyelet|drill|hole|holes)\b/.test(nextStep)) return "finishing";

  return "printing";
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
  await ensureProductionTables();
  const result = await pool.query<Omit<ProductionBoardCardRecord, "id" | "column">>(`
    SELECT
      pj.id as "jobId",
      pi.id as "itemId",
      pj.quote_id as "quoteId",
      pj.quote_number as "quoteNumber",
      pj.client_name as "clientName",
      pj.contact_name as "contactName",
      pj.project_name as "projectName",
      pj.status as "jobStatus",
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
      next_step.label as "nextStepLabel",
      next_step.step_type as "nextStepType",
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
      AND (pi.id IS NULL OR next_step.id IS NOT NULL)
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
  await ensureProductionTables();
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

  if (input.productionType === "small_format") {
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
      CASE WHEN aap.production_type = 'small_format' THEN aap.small_format_summary ELSE aap.install_summary END as "finishingSummary",
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
    INSERT INTO production.production_jobs (
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
      updated_at = now()
    RETURNING id
  `, [tenantId, approvalId, triggeredBy ?? null]);

  const jobId = result.rows[0]?.id;
  if (!jobId) return null;
  await syncProductionItemsAndSteps(jobId);
  return { id: jobId };
}

export async function syncProductionJobForTenant(tenantId: string, jobId: string): Promise<void> {
  const job = await getProductionJobById(tenantId, jobId);
  if (!job) return;
  await syncProductionItemsAndSteps(job.id);
}

export async function updateProductionJobDetailsForTenant(tenantId: string, jobId: string, input: {
  priority?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;
  internalNotes?: string | null;
}): Promise<void> {
  await ensureProductionTables();
  await pool.query(`
    UPDATE production.production_jobs
    SET priority = $3::varchar,
        due_date = NULLIF($4::text, '')::date,
        assigned_to = $5::varchar,
        internal_notes = $6::text,
        updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, jobId, nullableText(input.priority) ?? "normal", nullableText(input.dueDate), nullableText(input.assignedTo), nullableText(input.internalNotes)]);
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

export async function setProductionStepStatusForTenant(tenantId: string, stepId: string, status: "pending" | "done", checkedBy?: string | null): Promise<{ jobId: string | null }> {
  await ensureProductionTables();
  const result = await pool.query<{ jobId: string }>(`
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
      RETURNING ps.job_id, ps.item_id
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
    SELECT job_id as "jobId" FROM updated_step
  `, [tenantId, stepId, status, checkedBy ?? null]);
  return { jobId: result.rows[0]?.jobId ?? null };
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
  await ensureProductionTables();
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
