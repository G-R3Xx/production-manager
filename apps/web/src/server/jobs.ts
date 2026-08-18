import "server-only";

import { pool } from "@production-manager/db";
import { listEnquiriesForTenant, type EnquiryRecord } from "@/server/enquiries";
import { listSurveyRequestsForTenant, type SurveyRequestRecord } from "@/server/surveys";
import {
  listQuoteDraftsForTenant,
  listArtworkApprovalsForTenant,
  type QuoteDraftRecord,
  type ArtworkApprovalRecord,
} from "@/server/quotes";
import {
  listProductionJobsForTenant,
  listProductionJobStepSummariesForTenant,
  type ProductionJobRecord,
  type ProductionJobStepSummary,
} from "@/server/production";

export type JobStage =
  | "new_enquiry"
  | "survey_required"
  | "survey_scheduled"
  | "quote_required"
  | "quote_awaiting_approval"
  | "quote_changes_requested"
  | "artwork_required"
  | "artwork_sent"
  | "artwork_changes_requested"
  | "artwork_approved"
  | "production"
  | "ready_for_pickup"
  | "ready_for_delivery"
  | "ready_for_install"
  | "invoice_required"
  | "invoiced"
  | "closed";

export type JobRecord = {
  id: string;
  tenantId: string;
  jobNumber: string;
  title: string;
  clientName: string;
  linkedCustomerId: string | null;
  enquiryId: string | null;
  surveyRequestId: string | null;
  quoteId: string | null;
  artworkApprovalId: string | null;
  productionJobId: string | null;
  installSchedulerJobId: string | null;
  installSchedulerJobUrl: string | null;
  myobOrderUid: string | null;
  myobOrderNumber: string | null;
  currentStage: JobStage;
  currentStageLabel: string;
  nextAction: string;
  currentHref: string;
  dueDate: string | null;
  dispatchType: string | null;
  priority: string;
  ownerProfileId: string | null;
  invoiceStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type JobTaskRecord = {
  id: string;
  tenantId: string;
  jobId: string;
  title: string;
  stage: string;
  status: "pending" | "in_progress" | "completed" | "cancelled" | string;
  priority: string;
  dueDate: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  assigneeProfileIds: string[];
  notes: string | null;
  isSystem: boolean;
  systemKey: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobTimelineItem = {
  key: string;
  title: string;
  detail: string;
  at: string | null;
  href?: string | null;
  tone: "blue" | "green" | "orange" | "purple" | "slate";
};

type JobDraft = {
  existingId?: string;
  enquiry?: EnquiryRecord | null;
  survey?: SurveyRequestRecord | null;
  quote?: QuoteDraftRecord | null;
  artwork?: ArtworkApprovalRecord | null;
  production?: ProductionJobRecord | null;
};

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export async function ensureJobWorkspaceSchema(): Promise<void> {
  if (!process.env.DATABASE_URL || schemaReady) return;
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app.jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
        job_number varchar(50) NOT NULL,
        title varchar(255) NOT NULL,
        client_name varchar(255) NOT NULL,
        linked_customer_id uuid,
        enquiry_id uuid,
        survey_request_id uuid,
        quote_id uuid,
        artwork_approval_id uuid,
        production_job_id uuid,
        install_scheduler_job_id varchar(255),
        install_scheduler_job_url text,
        myob_order_uid varchar(255),
        myob_order_number varchar(120),
        current_stage varchar(80) NOT NULL DEFAULT 'new_enquiry',
        current_stage_label varchar(160) NOT NULL DEFAULT 'New enquiry',
        next_action varchar(255) NOT NULL DEFAULT 'Review enquiry',
        current_href text NOT NULL DEFAULT '/enquiries',
        due_date date,
        dispatch_type varchar(50),
        priority varchar(30) NOT NULL DEFAULT 'normal',
        owner_profile_id uuid,
        invoice_status varchar(30) NOT NULL DEFAULT 'not_invoiced',
        closed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE app.jobs ADD COLUMN IF NOT EXISTS owner_profile_id uuid`);
    await pool.query(`ALTER TABLE app.jobs ADD COLUMN IF NOT EXISTS invoice_status varchar(30) NOT NULL DEFAULT 'not_invoiced'`);
    await pool.query(`ALTER TABLE app.jobs ADD COLUMN IF NOT EXISTS current_href text NOT NULL DEFAULT '/enquiries'`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_job_number_uidx ON app.jobs (tenant_id, job_number)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_enquiry_uidx ON app.jobs (tenant_id, enquiry_id) WHERE enquiry_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_survey_uidx ON app.jobs (tenant_id, survey_request_id) WHERE survey_request_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_quote_uidx ON app.jobs (tenant_id, quote_id) WHERE quote_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_artwork_uidx ON app.jobs (tenant_id, artwork_approval_id) WHERE artwork_approval_id IS NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_production_uidx ON app.jobs (tenant_id, production_job_id) WHERE production_job_id IS NOT NULL`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS app.job_tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
        job_id uuid NOT NULL REFERENCES app.jobs(id) ON DELETE CASCADE,
        title varchar(255) NOT NULL,
        stage varchar(80) NOT NULL DEFAULT 'general',
        status varchar(30) NOT NULL DEFAULT 'pending',
        priority varchar(30) NOT NULL DEFAULT 'normal',
        due_date date,
        start_at timestamptz,
        end_at timestamptz,
        all_day boolean NOT NULL DEFAULT true,
        assignee_profile_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
        notes text,
        is_system boolean NOT NULL DEFAULT false,
        system_key varchar(160),
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS job_tasks_tenant_due_idx ON app.job_tasks (tenant_id, due_date, status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS job_tasks_job_idx ON app.job_tasks (job_id, status, due_date)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS job_tasks_system_uidx ON app.job_tasks (job_id, system_key) WHERE system_key IS NOT NULL`);
    schemaReady = true;
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function normalise(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isSurveyComplete(survey: SurveyRequestRecord | null | undefined): boolean {
  if (!survey) return false;
  const status = normalise(survey.status);
  return status.includes("complete") || Boolean(survey.completedAt || survey.installSchedulerCompletedAt);
}

function isSurveyScheduled(survey: SurveyRequestRecord | null | undefined): boolean {
  if (!survey) return false;
  const status = normalise(survey.status);
  const sync = normalise(survey.installSchedulerSyncStatus);
  return Boolean(
    survey.installSchedulerJobId ||
    survey.installSchedulerJobUrl ||
    status.includes("scheduled") ||
    status.includes("sent") ||
    sync.includes("created") ||
    sync.includes("sent") ||
    sync.includes("synced")
  );
}

function quoteStage(quote: QuoteDraftRecord | null | undefined): JobStage | null {
  if (!quote) return null;
  const status = normalise(quote.status);
  if (status.includes("change")) return "quote_changes_requested";
  if (status.includes("accept") || status.includes("approv")) return "artwork_required";
  if (status.includes("sent") || status.includes("issued")) return "quote_awaiting_approval";
  if (status.includes("declin") || status.includes("deleted")) return "closed";
  return "quote_required";
}

function artworkStage(artwork: ArtworkApprovalRecord | null | undefined): JobStage | null {
  if (!artwork) return null;
  const status = normalise(artwork.status);
  if (status.includes("change")) return "artwork_changes_requested";
  if (status.includes("approv")) return "artwork_approved";
  if (artwork.sentAt || status.includes("sent") || status.includes("view")) return "artwork_sent";
  return "artwork_required";
}

function productionStage(production: ProductionJobRecord | null | undefined, invoiceStatus: string): JobStage | null {
  if (!production) return null;
  if (invoiceStatus === "invoiced") return "invoiced";
  const status = normalise(production.status);
  if (status.includes("complete")) return "invoice_required";
  if (status.includes("ready_for_dispatch") || status.includes("ready_for_install") || status.includes("ready_for_delivery") || status.includes("ready_for_pickup")) {
    const dispatch = normalise(production.dispatchType);
    if (dispatch.includes("install")) return "ready_for_install";
    if (dispatch.includes("deliver")) return "ready_for_delivery";
    if (dispatch.includes("pickup") || dispatch.includes("collect")) return "ready_for_pickup";
  }
  return "production";
}

export function jobStageMeta(stage: JobStage): { label: string; nextAction: string; tone: string } {
  const map: Record<JobStage, { label: string; nextAction: string; tone: string }> = {
    new_enquiry: { label: "New enquiry", nextAction: "Review enquiry", tone: "blue" },
    survey_required: { label: "Survey required", nextAction: "Schedule site survey", tone: "purple" },
    survey_scheduled: { label: "Survey scheduled", nextAction: "Complete site survey", tone: "purple" },
    quote_required: { label: "Quote required", nextAction: "Prepare / send quote", tone: "orange" },
    quote_awaiting_approval: { label: "Quote awaiting approval", nextAction: "Await client response", tone: "orange" },
    quote_changes_requested: { label: "Quote changes requested", nextAction: "Amend and resend quote", tone: "orange" },
    artwork_required: { label: "Artwork required", nextAction: "Prepare client proof", tone: "purple" },
    artwork_sent: { label: "Artwork sent", nextAction: "Await artwork approval", tone: "purple" },
    artwork_changes_requested: { label: "Artwork changes requested", nextAction: "Revise artwork", tone: "orange" },
    artwork_approved: { label: "Artwork approved", nextAction: "Release to production", tone: "green" },
    production: { label: "Production", nextAction: "Continue production", tone: "blue" },
    ready_for_pickup: { label: "Ready for pickup", nextAction: "Complete pickup", tone: "green" },
    ready_for_delivery: { label: "Ready for delivery", nextAction: "Complete delivery", tone: "green" },
    ready_for_install: { label: "Ready for install", nextAction: "Complete installation", tone: "green" },
    invoice_required: { label: "Invoice required", nextAction: "Create MYOB invoice", tone: "red" },
    invoiced: { label: "Invoiced", nextAction: "Close job", tone: "green" },
    closed: { label: "Closed", nextAction: "No action required", tone: "slate" },
  };
  return map[stage];
}

function currentHrefForDraft(draft: JobDraft, stage: JobStage): string {
  if (stage === "new_enquiry") {
    return draft.enquiry ? `/enquiries?selected=${encodeURIComponent(draft.enquiry.id)}` : "/enquiries";
  }
  if (stage === "survey_required" || stage === "survey_scheduled") {
    if (draft.survey) return `/surveys?selected=${encodeURIComponent(draft.survey.id)}`;
    return draft.enquiry ? `/enquiries?selected=${encodeURIComponent(draft.enquiry.id)}` : "/surveys";
  }
  if (stage.startsWith("quote_") || stage === "artwork_required") {
    if (stage === "artwork_required") {
      if (draft.artwork) return `/artwork-approvals?selected=${encodeURIComponent(draft.artwork.id)}`;
      if (draft.quote) return `/artwork-approvals?quote=${encodeURIComponent(draft.quote.id)}`;
    }
    return draft.quote ? `/quotes?selected=${encodeURIComponent(draft.quote.id)}` : "/quotes";
  }
  if (stage.startsWith("artwork_")) {
    return draft.artwork ? `/artwork-approvals?selected=${encodeURIComponent(draft.artwork.id)}` : "/artwork-approvals";
  }
  if (draft.production) return `/production?selected=${encodeURIComponent(draft.production.id)}`;
  if (draft.quote) return `/quotes?selected=${encodeURIComponent(draft.quote.id)}`;
  return "/dashboard";
}

function deriveStage(draft: JobDraft, invoiceStatus: string): JobStage {
  const production = productionStage(draft.production, invoiceStatus);
  if (production) return production;
  const artwork = artworkStage(draft.artwork);
  if (artwork) return artwork;
  const quote = quoteStage(draft.quote);
  if (quote) return quote;
  if (draft.survey) {
    if (isSurveyComplete(draft.survey)) return "quote_required";
    if (isSurveyScheduled(draft.survey)) return "survey_scheduled";
    return "survey_required";
  }
  const enquiryStatus = normalise(draft.enquiry?.status);
  if (enquiryStatus.includes("closed") || enquiryStatus.includes("lost") || enquiryStatus.includes("deleted")) return "closed";
  return "new_enquiry";
}

function draftTitle(draft: JobDraft): string {
  return (
    draft.quote?.jobName ||
    draft.production?.projectName ||
    draft.artwork?.projectName ||
    draft.enquiry?.requestSummary ||
    draft.survey?.surveyDetails ||
    `${draft.quote?.clientName || draft.enquiry?.clientName || draft.survey?.clientName || draft.production?.clientName || "Job"}`
  ).trim().slice(0, 255);
}

function draftClientName(draft: JobDraft): string {
  return (
    draft.quote?.clientName ||
    draft.production?.clientName ||
    draft.artwork?.clientName ||
    draft.survey?.clientName ||
    draft.enquiry?.clientName ||
    "Unknown client"
  ).trim();
}

function maxUpdatedAt(draft: JobDraft): string | null {
  const values = [draft.enquiry?.updatedAt, draft.survey?.updatedAt, draft.quote?.updatedAt, draft.artwork?.updatedAt, draft.production?.updatedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!values.length) return null;
  return new Date(Math.max(...values.map((date) => date.getTime()))).toISOString();
}

function mergeDraft(target: JobDraft, patch: Partial<JobDraft>): JobDraft {
  return { ...target, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value != null)) } as JobDraft;
}

async function upsertSystemStageTask(job: JobRecord, dueDate?: string | null): Promise<void> {
  if (job.currentStage === "closed" || job.currentStage === "invoiced") return;
  const meta = jobStageMeta(job.currentStage);
  const systemKey = `stage:${job.currentStage}`;
  await pool.query(`
    UPDATE app.job_tasks
    SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
    WHERE tenant_id = $1::uuid AND job_id = $2::uuid AND is_system = true AND status <> 'completed' AND system_key <> $3
  `, [job.tenantId, job.id, systemKey]);

  await pool.query(`
    INSERT INTO app.job_tasks AS jt (
      tenant_id, job_id, title, stage, status, priority, due_date, is_system, system_key, created_at, updated_at
    ) VALUES ($1::uuid,$2::uuid,$3,$4,'pending',$5,NULLIF($6::text,'')::date,true,$7,now(),now())
    ON CONFLICT (job_id, system_key) WHERE system_key IS NOT NULL
    DO UPDATE SET
      title = EXCLUDED.title,
      stage = EXCLUDED.stage,
      priority = CASE WHEN jt.priority = 'normal' THEN EXCLUDED.priority ELSE jt.priority END,
      due_date = COALESCE(jt.due_date, EXCLUDED.due_date),
      status = jt.status,
      completed_at = jt.completed_at,
      updated_at = now()
  `, [job.tenantId, job.id, meta.nextAction, job.currentStage, job.priority || "normal", dueDate ?? job.dueDate ?? null, systemKey]);
}

export async function synchroniseJobsFromCurrentWorkflow(tenantId: string): Promise<JobRecord[]> {
  await ensureJobWorkspaceSchema();
  const [enquiries, surveys, quotes, artworkApprovals, productionJobs, stepSummaries] = await Promise.all([
    listEnquiriesForTenant(tenantId),
    listSurveyRequestsForTenant(tenantId),
    listQuoteDraftsForTenant(tenantId, { includeWebsiteOrders: true }),
    listArtworkApprovalsForTenant(tenantId),
    listProductionJobsForTenant(tenantId),
    listProductionJobStepSummariesForTenant(tenantId),
  ]);
  const existing = await listJobsForTenant(tenantId, { skipSync: true });
  const existingByEnquiry = new Map(existing.filter((job) => job.enquiryId).map((job) => [job.enquiryId!, job]));
  const existingBySurvey = new Map(existing.filter((job) => job.surveyRequestId).map((job) => [job.surveyRequestId!, job]));
  const existingByQuote = new Map(existing.filter((job) => job.quoteId).map((job) => [job.quoteId!, job]));
  const existingByArtwork = new Map(existing.filter((job) => job.artworkApprovalId).map((job) => [job.artworkApprovalId!, job]));
  const existingByProduction = new Map(existing.filter((job) => job.productionJobId).map((job) => [job.productionJobId!, job]));
  const stepByJob = new Map(stepSummaries.map((row) => [row.jobId, row]));

  const drafts: JobDraft[] = [];
  const byEnquiry = new Map<string, JobDraft>();
  const bySurvey = new Map<string, JobDraft>();
  const byQuote = new Map<string, JobDraft>();

  for (const enquiry of enquiries) {
    const draft: JobDraft = { enquiry, existingId: existingByEnquiry.get(enquiry.id)?.id };
    drafts.push(draft);
    byEnquiry.set(enquiry.id, draft);
  }

  for (const survey of surveys) {
    let draft = (survey.enquiryId ? byEnquiry.get(survey.enquiryId) : null) || bySurvey.get(survey.id);
    if (!draft) {
      draft = { existingId: existingBySurvey.get(survey.id)?.id };
      drafts.push(draft);
    }
    Object.assign(draft, mergeDraft(draft, { survey }));
    bySurvey.set(survey.id, draft);
  }

  for (const quote of quotes) {
    let draft = (quote.enquiryId ? byEnquiry.get(quote.enquiryId) : null) || (quote.surveyRequestId ? bySurvey.get(quote.surveyRequestId) : null) || byQuote.get(quote.id);
    if (!draft) {
      draft = { existingId: existingByQuote.get(quote.id)?.id };
      drafts.push(draft);
    }
    Object.assign(draft, mergeDraft(draft, { quote }));
    byQuote.set(quote.id, draft);
  }

  for (const artwork of artworkApprovals) {
    const existingArtworkJob = existingByArtwork.get(artwork.id);
    let draft = byQuote.get(artwork.quoteId);
    if (!draft) {
      draft = { existingId: existingArtworkJob?.id, artwork };
      drafts.push(draft);
    } else {
      draft.artwork = artwork;
      if (!draft.existingId) draft.existingId = existingArtworkJob?.id;
    }
  }

  for (const production of productionJobs) {
    let draft = byQuote.get(production.quoteId);
    if (!draft) {
      draft = { existingId: existingByProduction.get(production.id)?.id, production };
      drafts.push(draft);
    } else {
      draft.production = production;
      if (!draft.existingId) draft.existingId = existingByProduction.get(production.id)?.id;
    }
  }

  const syncedJobs: JobRecord[] = [];
  for (const draft of drafts) {
    const existingJob = draft.existingId ? existing.find((job) => job.id === draft.existingId) : null;
    const invoiceStatus = existingJob?.invoiceStatus ?? "not_invoiced";
    const stage = deriveStage(draft, invoiceStatus);
    const meta = jobStageMeta(stage);
    const stepSummary: ProductionJobStepSummary | undefined = draft.production ? stepByJob.get(draft.production.id) : undefined;
    const nextAction = stage === "production" && stepSummary?.currentStep ? stepSummary.currentStep : meta.nextAction;
    const dueDate = draft.production?.dueDate || draft.survey?.dueDate || existingJob?.dueDate || null;
    const priority = draft.production?.priority || existingJob?.priority || draft.enquiry?.urgency || "normal";
    const updatedAt = maxUpdatedAt(draft);
    const href = currentHrefForDraft(draft, stage);
    const linkedCustomerId = draft.quote?.linkedCustomerId || draft.production?.linkedCustomerId || draft.survey?.linkedCustomerId || draft.enquiry?.linkedCustomerId || null;

    const result = draft.existingId
      ? await pool.query<JobRecord>(`
          UPDATE app.jobs SET
            title = $3,
            client_name = $4,
            linked_customer_id = COALESCE($5::uuid, linked_customer_id),
            enquiry_id = COALESCE($6::uuid, enquiry_id),
            survey_request_id = COALESCE($7::uuid, survey_request_id),
            quote_id = COALESCE($8::uuid, quote_id),
            artwork_approval_id = COALESCE($9::uuid, artwork_approval_id),
            production_job_id = COALESCE($10::uuid, production_job_id),
            install_scheduler_job_id = COALESCE($11, install_scheduler_job_id),
            install_scheduler_job_url = COALESCE($12, install_scheduler_job_url),
            myob_order_uid = COALESCE($13, myob_order_uid),
            myob_order_number = COALESCE($14, myob_order_number),
            current_stage = $15,
            current_stage_label = $16,
            next_action = $17,
            current_href = $18,
            due_date = COALESCE(NULLIF($19::text,'')::date, due_date),
            dispatch_type = COALESCE($20, dispatch_type),
            priority = COALESCE(NULLIF($21,''), priority),
            updated_at = GREATEST(updated_at, COALESCE($22::timestamptz, now()))
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING ${jobSelectSql()}
        `, [tenantId, draft.existingId, draftTitle(draft), draftClientName(draft), linkedCustomerId, draft.enquiry?.id ?? null, draft.survey?.id ?? null, draft.quote?.id ?? null, draft.artwork?.id ?? null, draft.production?.id ?? null, draft.survey?.installSchedulerJobId ?? null, draft.survey?.installSchedulerJobUrl ?? null, draft.quote?.myobOrderUid ?? null, draft.quote?.myobOrderNumber ?? null, stage, meta.label, nextAction, href, dueDate, draft.production?.dispatchType ?? null, priority, updatedAt])
      : await pool.query<JobRecord>(`
          INSERT INTO app.jobs (
            tenant_id, job_number, title, client_name, linked_customer_id, enquiry_id, survey_request_id, quote_id, artwork_approval_id, production_job_id,
            install_scheduler_job_id, install_scheduler_job_url, myob_order_uid, myob_order_number, current_stage, current_stage_label, next_action, current_href,
            due_date, dispatch_type, priority, invoice_status, created_at, updated_at
          ) VALUES (
            $1::uuid,
            ('J-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))),
            $2,$3,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10,$11,$12,$13,$14,$15,$16,$17,NULLIF($18::text,'')::date,$19,$20,'not_invoiced',now(),COALESCE($21::timestamptz,now())
          ) RETURNING ${jobSelectSql()}
        `, [tenantId, draftTitle(draft), draftClientName(draft), linkedCustomerId, draft.enquiry?.id ?? null, draft.survey?.id ?? null, draft.quote?.id ?? null, draft.artwork?.id ?? null, draft.production?.id ?? null, draft.survey?.installSchedulerJobId ?? null, draft.survey?.installSchedulerJobUrl ?? null, draft.quote?.myobOrderUid ?? null, draft.quote?.myobOrderNumber ?? null, stage, meta.label, nextAction, href, dueDate, draft.production?.dispatchType ?? null, priority, updatedAt]);

    const job = result.rows[0];
    if (job) {
      syncedJobs.push(job);
      await upsertSystemStageTask(job, dueDate);
    }
  }

  return listJobsForTenant(tenantId, { skipSync: true });
}

function jobSelectSql(): string {
  return `
    id,
    tenant_id as "tenantId",
    job_number as "jobNumber",
    title,
    client_name as "clientName",
    linked_customer_id as "linkedCustomerId",
    enquiry_id as "enquiryId",
    survey_request_id as "surveyRequestId",
    quote_id as "quoteId",
    artwork_approval_id as "artworkApprovalId",
    production_job_id as "productionJobId",
    install_scheduler_job_id as "installSchedulerJobId",
    install_scheduler_job_url as "installSchedulerJobUrl",
    myob_order_uid as "myobOrderUid",
    myob_order_number as "myobOrderNumber",
    current_stage as "currentStage",
    current_stage_label as "currentStageLabel",
    next_action as "nextAction",
    current_href as "currentHref",
    due_date::text as "dueDate",
    dispatch_type as "dispatchType",
    priority,
    owner_profile_id as "ownerProfileId",
    invoice_status as "invoiceStatus",
    created_at::text as "createdAt",
    updated_at::text as "updatedAt"
  `;
}

export async function listJobsForTenant(tenantId: string, options?: { skipSync?: boolean }): Promise<JobRecord[]> {
  await ensureJobWorkspaceSchema();
  if (!options?.skipSync) return synchroniseJobsFromCurrentWorkflow(tenantId);
  const result = await pool.query<JobRecord>(`
    SELECT ${jobSelectSql()}
    FROM app.jobs
    WHERE tenant_id = $1::uuid AND current_stage <> 'closed'
    ORDER BY
      CASE current_stage
        WHEN 'invoice_required' THEN 1
        WHEN 'quote_changes_requested' THEN 2
        WHEN 'artwork_changes_requested' THEN 3
        WHEN 'new_enquiry' THEN 4
        WHEN 'survey_required' THEN 5
        WHEN 'quote_required' THEN 6
        ELSE 7
      END,
      due_date NULLS LAST,
      updated_at DESC
  `, [tenantId]);
  return result.rows;
}

export async function getJobById(tenantId: string, jobId: string): Promise<JobRecord | null> {
  await ensureJobWorkspaceSchema();
  const result = await pool.query<JobRecord>(`SELECT ${jobSelectSql()} FROM app.jobs WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`, [tenantId, jobId]);
  return result.rows[0] ?? null;
}

export async function listJobTasksForTenant(tenantId: string, input?: { jobId?: string; month?: string }): Promise<JobTaskRecord[]> {
  await ensureJobWorkspaceSchema();
  const params: unknown[] = [tenantId];
  const conditions = ["tenant_id = $1::uuid"];
  if (input?.jobId) {
    params.push(input.jobId);
    conditions.push(`job_id = $${params.length}::uuid`);
  }
  if (input?.month && /^\d{4}-\d{2}$/.test(input.month)) {
    params.push(`${input.month}-01`);
    const index = params.length;
    conditions.push(`due_date >= $${index}::date AND due_date < ($${index}::date + interval '1 month')`);
  }
  const result = await pool.query<JobTaskRecord>(`
    SELECT
      id, tenant_id as "tenantId", job_id as "jobId", title, stage, status, priority,
      due_date::text as "dueDate", start_at::text as "startAt", end_at::text as "endAt", all_day as "allDay",
      COALESCE(assignee_profile_ids, '{}'::uuid[]) as "assigneeProfileIds", notes, is_system as "isSystem", system_key as "systemKey",
      completed_at::text as "completedAt", created_at::text as "createdAt", updated_at::text as "updatedAt"
    FROM app.job_tasks
    WHERE ${conditions.join(" AND ")}
    ORDER BY due_date NULLS LAST, start_at NULLS LAST, created_at ASC
  `, params);
  return result.rows;
}

export async function createJobTaskForTenant(tenantId: string, input: {
  jobId: string;
  title: string;
  stage?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  allDay?: boolean;
  assigneeProfileIds?: string[];
  notes?: string | null;
}): Promise<void> {
  await ensureJobWorkspaceSchema();
  await pool.query(`
    INSERT INTO app.job_tasks (
      tenant_id, job_id, title, stage, status, priority, due_date, start_at, end_at, all_day, assignee_profile_ids, notes, is_system, created_at, updated_at
    ) VALUES ($1::uuid,$2::uuid,$3,$4,'pending',$5,NULLIF($6::text,'')::date,NULLIF($7::text,'')::timestamptz,NULLIF($8::text,'')::timestamptz,$9,$10::uuid[],$11,false,now(),now())
  `, [tenantId, input.jobId, input.title.trim(), input.stage?.trim() || "general", input.priority?.trim() || "normal", input.dueDate ?? null, input.startAt ?? null, input.endAt ?? null, input.allDay !== false, input.assigneeProfileIds ?? [], input.notes ?? null]);
}

export async function updateJobTaskForTenant(tenantId: string, input: {
  taskId: string;
  title?: string | null;
  stage?: string | null;
  status?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  assigneeProfileIds?: string[];
  notes?: string | null;
}): Promise<void> {
  await ensureJobWorkspaceSchema();
  const status = input.status?.trim() || "pending";
  await pool.query(`
    UPDATE app.job_tasks SET
      title = COALESCE(NULLIF($3,''), title),
      stage = COALESCE(NULLIF($4,''), stage),
      status = $5,
      priority = COALESCE(NULLIF($6,''), priority),
      due_date = NULLIF($7::text,'')::date,
      assignee_profile_ids = $8::uuid[],
      notes = $9,
      completed_at = CASE WHEN $5 = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END,
      updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, input.taskId, input.title ?? null, input.stage ?? null, status, input.priority ?? null, input.dueDate ?? null, input.assigneeProfileIds ?? [], input.notes ?? null]);
}

export async function updateJobMetaForTenant(tenantId: string, input: {
  jobId: string;
  title?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  ownerProfileId?: string | null;
  invoiceStatus?: string | null;
}): Promise<void> {
  await ensureJobWorkspaceSchema();
  const invoiceStatus = input.invoiceStatus?.trim() || "not_invoiced";
  await pool.query(`
    UPDATE app.jobs SET
      title = COALESCE(NULLIF($3,''), title),
      due_date = NULLIF($4::text,'')::date,
      priority = COALESCE(NULLIF($5,''), priority),
      owner_profile_id = NULLIF($6::text,'')::uuid,
      invoice_status = $7,
      current_stage = CASE
        WHEN $7 = 'invoiced' THEN 'invoiced'
        WHEN current_stage = 'invoiced' AND $7 <> 'invoiced' THEN 'invoice_required'
        ELSE current_stage
      END,
      current_stage_label = CASE
        WHEN $7 = 'invoiced' THEN 'Invoiced'
        WHEN current_stage = 'invoiced' AND $7 <> 'invoiced' THEN 'Invoice required'
        ELSE current_stage_label
      END,
      next_action = CASE
        WHEN $7 = 'invoiced' THEN 'Close job'
        WHEN current_stage = 'invoiced' AND $7 <> 'invoiced' THEN 'Create MYOB invoice'
        ELSE next_action
      END,
      updated_at = now()
    WHERE tenant_id = $1::uuid AND id = $2::uuid
  `, [tenantId, input.jobId, input.title ?? null, input.dueDate ?? null, input.priority ?? null, input.ownerProfileId ?? null, invoiceStatus]);
}

export async function buildJobTimeline(tenantId: string, job: JobRecord): Promise<JobTimelineItem[]> {
  const [enquiries, surveys, quotes, artwork, production, tasks] = await Promise.all([
    job.enquiryId ? listEnquiriesForTenant(tenantId) : Promise.resolve([]),
    job.surveyRequestId ? listSurveyRequestsForTenant(tenantId) : Promise.resolve([]),
    job.quoteId ? listQuoteDraftsForTenant(tenantId, { includeWebsiteOrders: true }) : Promise.resolve([]),
    job.artworkApprovalId ? listArtworkApprovalsForTenant(tenantId) : Promise.resolve([]),
    job.productionJobId ? listProductionJobsForTenant(tenantId) : Promise.resolve([]),
    listJobTasksForTenant(tenantId, { jobId: job.id }),
  ]);
  const enquiry = enquiries.find((row) => row.id === job.enquiryId);
  const survey = surveys.find((row) => row.id === job.surveyRequestId);
  const quote = quotes.find((row) => row.id === job.quoteId);
  const approval = artwork.find((row) => row.id === job.artworkApprovalId);
  const productionJob = production.find((row) => row.id === job.productionJobId);
  const items: JobTimelineItem[] = [];
  if (enquiry) items.push({ key: `enquiry-${enquiry.id}`, title: "Enquiry created", detail: enquiry.requestSummary, at: enquiry.createdAt, href: `/enquiries?selected=${enquiry.id}`, tone: "blue" });
  if (survey) {
    items.push({ key: `survey-${survey.id}`, title: isSurveyComplete(survey) ? "Survey completed" : "Survey requested", detail: survey.siteAddress || "Site survey", at: survey.completedAt || survey.installSchedulerCompletedAt || survey.createdAt, href: `/surveys?selected=${survey.id}`, tone: "purple" });
  }
  if (quote) {
    items.push({ key: `quote-${quote.id}`, title: `Quote ${quote.quoteNumber || "created"}`, detail: quote.jobName || quote.clientName, at: quote.createdAt, href: `/quotes?selected=${quote.id}`, tone: "orange" });
    if (quote.sentAt) items.push({ key: `quote-sent-${quote.id}`, title: "Quote sent", detail: quote.emailTo || quote.email || "Client", at: quote.sentAt, href: `/quotes?selected=${quote.id}`, tone: "orange" });
    if (quote.acceptedAt) items.push({ key: `quote-accepted-${quote.id}`, title: "Quote accepted", detail: quote.quoteNumber || "Accepted", at: quote.acceptedAt, href: `/quotes?selected=${quote.id}`, tone: "green" });
  }
  if (approval) {
    items.push({ key: `artwork-${approval.id}`, title: approval.approvedAt ? "Artwork approved" : approval.sentAt ? "Artwork sent" : "Artwork workspace created", detail: approval.projectName || approval.clientName, at: approval.approvedAt || approval.sentAt || approval.createdAt, href: `/artwork-approvals?selected=${approval.id}`, tone: approval.approvedAt ? "green" : "purple" });
  }
  if (productionJob) items.push({ key: `production-${productionJob.id}`, title: productionJob.status === "completed" ? "Production completed" : "Released to production", detail: productionJob.projectName || productionJob.clientName, at: productionJob.updatedAt || productionJob.createdAt, href: `/production?selected=${productionJob.id}`, tone: productionJob.status === "completed" ? "green" : "blue" });
  for (const task of tasks.filter((row) => row.completedAt)) items.push({ key: `task-${task.id}`, title: `Task completed: ${task.title}`, detail: task.stage, at: task.completedAt, href: `/jobs/${job.id}`, tone: "slate" });
  return items.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
}
