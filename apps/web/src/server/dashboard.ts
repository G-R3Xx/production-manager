import "server-only";

import { pool } from "@production-manager/db";
import { ensureJobWorkspaceSchema, scheduleDashboardWorkflowReconciliation, type DashboardJobType, type JobStage } from "@/server/jobs";

export type DashboardSnapshotRow = {
  id: string;
  jobNumber: string;
  title: string;
  clientName: string;
  currentStage: JobStage;
  currentStageLabel: string;
  nextAction: string;
  receivedAt: string;
  dueDate: string | null;
  ownerProfileId: string | null;
  assigneeProfileIds: string[];
  assignmentDueDate: string | null;
  dispatchType: string | null;
  myobOrderNumber: string | null;
  logoUrl: string | null;
  lineTypes: string[];
  enquirySummary: string | null;
  enquiryNotes: string | null;
  surveyDetails: string | null;
  surveyNotes: string | null;
};

export type DashboardStaffOption = { id: string; name: string };

export type DashboardSnapshot = {
  rows: Array<DashboardSnapshotRow & { jobType: DashboardJobType }>;
  staff: DashboardStaffOption[];
  timing: { jobsMs: number; staffMs: number; totalMs: number };
};

function dashboardJobTypeFromText(values: string[]): DashboardJobType {
  const categories = new Set<Exclude<DashboardJobType, "mixed" | "other">>();
  for (const raw of values) {
    const value = raw.toLowerCase().replaceAll("-", "_");
    if (value === "small_format" || /\b(business cards?|flyers?|brochures?|booklets?|ncr|duplicate|triplicate|letterheads?|small format)\b/.test(value)) categories.add("small_format");
    else if (value === "plan_printing" || value === "poster_printing" || /\b(plans?|posters?|architectural drawings?|wide format plans?)\b/.test(value)) categories.add("plans_posters");
    else if (value === "service" || /\b(install(?:ation)?|site labour|client supplied signage)\b/.test(value)) categories.add("installation");
    else if (value === "signage" || /\b(signs?|signage|banner|vinyl|acrylic|corflute|acm|aluminium composite|wall graphic|window graphic|vehicle wrap|lightbox)\b/.test(value)) categories.add("signage");
  }
  if (categories.size > 1) return "mixed";
  return categories.values().next().value ?? "other";
}

/**
 * Fast dashboard read model.
 *
 * The old dashboard assembled the page from five separate tenant-wide reads and
 * also synchronised inherited task defaults on every page load. On Vercel the
 * Postgres pool is intentionally small, so those "parallel" calls queued behind
 * one another. This query only reads rows needed by active jobs and joins the
 * current process assignment, client logo and quote metadata in one DB round trip.
 */
export async function loadDashboardSnapshotForTenant(tenantId: string): Promise<DashboardSnapshot> {
  await ensureJobWorkspaceSchema();
  scheduleDashboardWorkflowReconciliation(tenantId);

  const startedAt = performance.now();
  const jobsStartedAt = performance.now();
  const jobsPromise = pool.query<DashboardSnapshotRow>(`
    WITH active_jobs AS (
      SELECT
        j.id,
        j.tenant_id,
        j.job_number,
        j.title,
        j.client_name,
        j.linked_customer_id,
        j.enquiry_id,
        j.survey_request_id,
        j.quote_id,
        j.current_stage,
        j.current_stage_label,
        j.next_action,
        j.received_at,
        j.due_date,
        j.dispatch_type,
        j.myob_order_number,
        j.owner_profile_id,
        j.updated_at
      FROM app.jobs j
      WHERE j.tenant_id = $1::uuid
        AND j.current_stage <> 'closed'
    ),
    line_types AS (
      SELECT
        ql.quote_id,
        array_agg(
          DISTINCT COALESCE(NULLIF(ql.configuration_snapshot ->> 'flowType', ''), ql.product_name)
        ) FILTER (
          WHERE COALESCE(NULLIF(ql.configuration_snapshot ->> 'flowType', ''), ql.product_name) IS NOT NULL
        ) AS line_types
      FROM sales.quote_lines ql
      INNER JOIN active_jobs j ON j.quote_id = ql.quote_id
      WHERE COALESCE(ql.configuration_snapshot ->> 'parentLineId', '') = ''
        AND COALESCE(ql.client_response_status, 'pending') <> 'cancelled'
      GROUP BY ql.quote_id
    ),
    customer_logo_base AS (
      SELECT
        customer.id,
        NULLIF(customer.payload_json ->> 'logoUrl', '') as logo_url,
        btrim(regexp_replace(
          regexp_replace(lower(COALESCE(customer.display_name, '')), '\\m(pty|proprietary|limited|ltd|incorporated|inc)\\M', ' ', 'g'),
          '[^a-z0-9]+', ' ', 'g'
        )) as display_key,
        btrim(regexp_replace(
          regexp_replace(lower(COALESCE(customer.company_name, '')), '\\m(pty|proprietary|limited|ltd|incorporated|inc)\\M', ' ', 'g'),
          '[^a-z0-9]+', ' ', 'g'
        )) as company_key,
        customer.updated_at
      FROM app.customers customer
      WHERE customer.tenant_id = $1::uuid
        AND COALESCE(customer.payload_json ->> 'deletedAt', '') = ''
    ),
    customer_logo_keys AS (
      SELECT base.id, key.client_key, base.logo_url, base.updated_at
      FROM customer_logo_base base
      CROSS JOIN LATERAL (VALUES (base.display_key), (base.company_key)) key(client_key)
      WHERE key.client_key <> '' AND base.logo_url IS NOT NULL
    ),
    fallback_customer_logos AS (
      SELECT DISTINCT ON (client_key) client_key, logo_url
      FROM customer_logo_keys
      ORDER BY client_key, updated_at DESC
    )
    SELECT
      j.id,
      j.job_number as "jobNumber",
      j.title,
      j.client_name as "clientName",
      j.current_stage as "currentStage",
      j.current_stage_label as "currentStageLabel",
      j.next_action as "nextAction",
      j.received_at::text as "receivedAt",
      j.due_date::text as "dueDate",
      j.owner_profile_id as "ownerProfileId",
      COALESCE(assignment.assignee_profile_ids, '{}'::uuid[]) as "assigneeProfileIds",
      assignment.due_date::text as "assignmentDueDate",
      j.dispatch_type as "dispatchType",
      j.myob_order_number as "myobOrderNumber",
      COALESCE(
        linked_customer.logo_url,
        NULLIF(enquiry.client_logo_url, ''),
        fallback_customer.logo_url
      ) as "logoUrl",
      COALESCE(lines.line_types, ARRAY[]::text[]) as "lineTypes",
      enquiry.request_summary as "enquirySummary",
      enquiry.notes as "enquiryNotes",
      survey.survey_details as "surveyDetails",
      survey.notes as "surveyNotes"
    FROM active_jobs j
    LEFT JOIN app.job_process_assignments assignment
      ON assignment.tenant_id = j.tenant_id
     AND assignment.job_id = j.id
     AND assignment.process_key = CASE
       WHEN j.current_stage = 'new_enquiry' THEN 'enquiry'
       WHEN j.current_stage LIKE 'survey_%' THEN 'survey'
       WHEN j.current_stage LIKE 'quote_%' THEN 'quote'
       WHEN j.current_stage LIKE 'artwork_%' THEN 'artwork'
       WHEN j.current_stage = 'production' THEN 'production'
       WHEN j.current_stage LIKE 'ready_for_%' THEN 'dispatch'
       WHEN j.current_stage IN ('invoice_required', 'invoiced', 'closed') THEN 'invoicing'
       ELSE NULL
     END
    LEFT JOIN app.enquiries enquiry
      ON enquiry.tenant_id = j.tenant_id
     AND enquiry.id = j.enquiry_id
    LEFT JOIN app.survey_requests survey
      ON survey.tenant_id = j.tenant_id
     AND survey.id = j.survey_request_id
    LEFT JOIN line_types lines ON lines.quote_id = j.quote_id
    LEFT JOIN customer_logo_base linked_customer
      ON linked_customer.id = j.linked_customer_id
    LEFT JOIN fallback_customer_logos fallback_customer
      ON fallback_customer.client_key = btrim(regexp_replace(
        regexp_replace(lower(COALESCE(j.client_name, '')), '\\m(pty|proprietary|limited|ltd|incorporated|inc)\\M', ' ', 'g'),
        '[^a-z0-9]+', ' ', 'g'
      ))
    ORDER BY
      CASE j.current_stage
        WHEN 'invoice_required' THEN 1
        WHEN 'quote_changes_requested' THEN 2
        WHEN 'artwork_changes_requested' THEN 3
        WHEN 'new_enquiry' THEN 4
        WHEN 'survey_required' THEN 5
        WHEN 'quote_required' THEN 6
        ELSE 7
      END,
      j.due_date NULLS LAST,
      j.updated_at DESC
  `, [tenantId]).then((result) => ({ rows: result.rows, ms: performance.now() - jobsStartedAt }));

  const staffStartedAt = performance.now();
  const staffPromise = pool.query<DashboardStaffOption>(`
    SELECT
      profile.id,
      COALESCE(NULLIF(profile.short_name, ''), NULLIF(profile.full_name, ''), profile.email, 'Staff') as name
    FROM app.memberships membership
    INNER JOIN app.user_profiles profile ON profile.id = membership.user_profile_id
    WHERE membership.tenant_id = $1::uuid
      AND membership.status = 'active'
    ORDER BY COALESCE(NULLIF(profile.full_name, ''), profile.email, profile.id::text)
  `, [tenantId]).then((result) => ({ rows: result.rows, ms: performance.now() - staffStartedAt }));

  const [jobsResult, staffResult] = await Promise.all([jobsPromise, staffPromise]);
  const rows = jobsResult.rows.map((row) => ({
    ...row,
    jobType: dashboardJobTypeFromText([
      ...(row.lineTypes ?? []),
      row.title,
      row.enquirySummary ?? "",
      row.enquiryNotes ?? "",
      row.surveyDetails ?? "",
      row.surveyNotes ?? "",
    ].filter(Boolean)),
  }));

  const timing = {
    jobsMs: Math.round(jobsResult.ms),
    staffMs: Math.round(staffResult.ms),
    totalMs: Math.round(performance.now() - startedAt),
  };
  console.info("[dashboard-snapshot]", {
    tenantId,
    rowCount: rows.length,
    staffCount: staffResult.rows.length,
    ...timing,
    vercelRegion: process.env.VERCEL_REGION ?? null,
  });

  return { rows, staff: staffResult.rows, timing };
}
