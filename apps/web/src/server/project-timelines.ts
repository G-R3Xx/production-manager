import "server-only";
import { pool } from "@production-manager/db";
import { parseProjectSchedule, type ProjectTaskStatus, type ProjectSchedule } from "@/lib/project-timeline";

export type ProjectPlanRecord = {
  id: string;
  tenantId: string;
  productionJobId: string;
  quoteId: string;
  quoteNumber: string | null;
  title: string;
  clientName: string;
  jobStatus: string;
  updatedAt: string;
  taskCount: number;
};

export type ProjectTimelineTaskRecord = {
  id: string;
  projectId: string;
  subJobId: string | null;
  productionStepId: string | null;
  title: string;
  plannedStart: string;
  plannedEnd: string;
  allocatedMinutes: number;
  assigneeProfileId: string | null;
  assigneeName: string | null;
  status: ProjectTaskStatus;
  productionStepStatus: string | null;
  notes: string | null;
  sortOrder: number;
};

export type ProjectSubJobRecord = { id: string; title: string; sortOrder: number };
export type UnscheduledProductionStep = {
  id: string;
  label: string;
  subJobId: string | null;
  status: string;
  itemTitle: string | null;
};

export async function listProjectPlansForTenant(tenantId: string): Promise<ProjectPlanRecord[]> {
  const result = await pool.query<ProjectPlanRecord>(`
    SELECT p.id::text, p.tenant_id::text AS "tenantId", p.production_job_id::text AS "productionJobId",
           j.quote_id::text AS "quoteId", j.quote_number AS "quoteNumber",
           COALESCE(NULLIF(j.project_name,''), j.quote_number, j.client_name) AS title,
           j.client_name AS "clientName", j.status AS "jobStatus", p.updated_at::text AS "updatedAt",
           (SELECT count(*)::int FROM production.project_timeline_tasks task WHERE task.project_id = p.id) AS "taskCount"
      FROM production.project_plans p
      JOIN production.production_jobs j ON j.id = p.production_job_id AND j.tenant_id = p.tenant_id
     WHERE p.tenant_id = $1::uuid AND j.status <> 'deleted'
     ORDER BY p.updated_at DESC, p.id
  `, [tenantId]);
  return result.rows;
}

export async function listUnplannedProductionJobsForTenant(tenantId: string): Promise<{
  id: string; title: string; clientName: string; quoteNumber: string | null;
}[]> {
  const result = await pool.query<{ id: string; title: string; clientName: string; quoteNumber: string | null }>(`
    SELECT j.id::text, COALESCE(NULLIF(j.project_name, ''), j.quote_number, j.client_name) AS title,
           j.client_name AS "clientName", j.quote_number AS "quoteNumber"
      FROM production.production_jobs j
      LEFT JOIN production.project_plans p ON p.production_job_id = j.id
     WHERE j.tenant_id = $1::uuid AND j.status <> 'deleted' AND p.id IS NULL
     ORDER BY j.updated_at DESC LIMIT 150
  `, [tenantId]);
  return result.rows;
}

export async function createProjectPlanForProductionJob(tenantId: string, jobId: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(`
    WITH added AS (
      INSERT INTO production.project_plans (tenant_id, production_job_id)
      SELECT $1::uuid, j.id FROM production.production_jobs j
       WHERE j.id = $2::uuid AND j.tenant_id = $1::uuid AND j.status <> 'deleted'
      ON CONFLICT (production_job_id) DO NOTHING
      RETURNING id
    )
    SELECT id::text FROM added
    UNION ALL
    SELECT p.id::text FROM production.project_plans p
    JOIN production.production_jobs j ON j.id=p.production_job_id AND j.tenant_id=p.tenant_id
    WHERE p.tenant_id=$1::uuid AND p.production_job_id=$2::uuid AND j.status <> 'deleted'
    LIMIT 1
  `, [tenantId, jobId]);
  return result.rows[0]?.id ?? null;
}

export async function getProjectPlanForTenant(tenantId: string, projectId: string): Promise<ProjectPlanRecord | null> {
  const result = await pool.query<ProjectPlanRecord>(`
    SELECT p.id::text, p.tenant_id::text AS "tenantId", p.production_job_id::text AS "productionJobId",
           j.quote_id::text AS "quoteId", j.quote_number AS "quoteNumber",
           COALESCE(NULLIF(j.project_name,''), j.quote_number, j.client_name) AS title,
           j.client_name AS "clientName", j.status AS "jobStatus", p.updated_at::text AS "updatedAt",
           (SELECT count(*)::int FROM production.project_timeline_tasks task WHERE task.project_id = p.id) AS "taskCount"
      FROM production.project_plans p
      JOIN production.production_jobs j ON j.id = p.production_job_id AND j.tenant_id = p.tenant_id
     WHERE p.tenant_id = $1::uuid AND p.id = $2::uuid AND j.status <> 'deleted'
     LIMIT 1
  `, [tenantId, projectId]);
  return result.rows[0] ?? null;
}

export async function listProjectSubJobs(tenantId: string, projectId: string): Promise<ProjectSubJobRecord[]> {
  const result = await pool.query<ProjectSubJobRecord>(`
    SELECT sj.id::text, sj.title, sj.sort_order AS "sortOrder"
      FROM production.project_plans p
      JOIN production.production_jobs j ON j.id=p.production_job_id AND j.tenant_id=p.tenant_id
      JOIN sales.quote_sub_jobs sj ON sj.quote_id = j.quote_id
     WHERE p.tenant_id=$1::uuid AND p.id=$2::uuid
     ORDER BY sj.sort_order, sj.created_at
  `, [tenantId, projectId]);
  return result.rows;
}

export async function listProjectTasks(tenantId: string, projectId: string): Promise<ProjectTimelineTaskRecord[]> {
  const result = await pool.query<ProjectTimelineTaskRecord>(`
    SELECT task.id::text, task.project_id::text AS "projectId", task.sub_job_id::text AS "subJobId",
           task.production_step_id::text AS "productionStepId", task.title,
           to_char(task.planned_start, 'YYYY-MM-DD"T"HH24:MI') AS "plannedStart",
           to_char(task.planned_end, 'YYYY-MM-DD"T"HH24:MI') AS "plannedEnd",
           task.allocated_minutes AS "allocatedMinutes",
           task.assignee_profile_id::text AS "assigneeProfileId",
           COALESCE(NULLIF(profile.short_name,''), profile.full_name) AS "assigneeName",
           task.status, step.status AS "productionStepStatus", task.notes, task.sort_order AS "sortOrder"
      FROM production.project_timeline_tasks task
      JOIN production.project_plans p ON p.id=task.project_id
      JOIN production.production_jobs job ON job.id=p.production_job_id AND job.tenant_id=p.tenant_id
      LEFT JOIN app.user_profiles profile ON profile.id=task.assignee_profile_id
      LEFT JOIN production.production_steps step ON step.id=task.production_step_id AND step.job_id=job.id
     WHERE p.id=$2::uuid AND p.tenant_id=$1::uuid
     ORDER BY task.planned_start, task.sort_order, task.id
  `, [tenantId, projectId]);
  return result.rows;
}

export async function listUnscheduledProductionSteps(tenantId: string, projectId: string): Promise<UnscheduledProductionStep[]> {
  const result = await pool.query<UnscheduledProductionStep>(`
    SELECT step.id::text, step.label, step.status, item.title AS "itemTitle",
           CASE WHEN sj.id IS NOT NULL THEN sj.id::text ELSE NULL END AS "subJobId"
      FROM production.project_plans p
      JOIN production.production_jobs job ON job.id=p.production_job_id AND job.tenant_id=p.tenant_id
      JOIN production.production_steps step ON step.job_id=job.id
      LEFT JOIN production.production_items item ON item.id=step.item_id AND item.job_id=job.id
      LEFT JOIN sales.quote_lines line ON line.id=item.source_quote_line_id AND line.quote_id=job.quote_id
      LEFT JOIN sales.quote_sub_jobs sj ON sj.quote_id=job.quote_id AND sj.id::text=line.configuration_snapshot ->> 'subJobId'
      LEFT JOIN production.project_timeline_tasks scheduled ON scheduled.project_id=p.id AND scheduled.production_step_id=step.id
     WHERE p.tenant_id=$1::uuid AND p.id=$2::uuid AND scheduled.id IS NULL
     ORDER BY sj.sort_order NULLS LAST, item.sort_order NULLS LAST, step.sort_order, step.created_at
     LIMIT 250
  `, [tenantId, projectId]);
  return result.rows;
}

type TimelineTaskInput = {
  title: string;
  subJobId: string | null;
  plannedStart: string;
  plannedEnd: string;
  allocatedHours: string;
  assigneeProfileId: string | null;
  status: ProjectTaskStatus;
  notes: string | null;
};

function cleanTask(input: TimelineTaskInput): TimelineTaskInput & { schedule: ProjectSchedule } {
  const title = input.title.trim();
  if (!title || title.length > 200) throw new Error("Task title must be between 1 and 200 characters.");
  if (!["planned", "in_progress", "blocked", "completed"].includes(input.status)) throw new Error("Invalid task status.");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 4000) throw new Error("Notes cannot exceed 4,000 characters.");
  return { ...input, title, notes, schedule: parseProjectSchedule(input) };
}

/** Inserts/updates must pass a tenant-scoped project, its own quote sub-job, and an active staff assignment. */
export async function addProjectTask(tenantId: string, projectId: string, input: TimelineTaskInput): Promise<boolean> {
  const data = cleanTask(input);
  const result = await pool.query(`
    WITH scope AS (
      SELECT p.id, j.quote_id FROM production.project_plans p
      JOIN production.production_jobs j ON j.id=p.production_job_id AND j.tenant_id=p.tenant_id
      WHERE p.id=$2::uuid AND p.tenant_id=$1::uuid AND j.status <> 'deleted'
        AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM sales.quote_sub_jobs sj WHERE sj.id=$4::uuid AND sj.quote_id=j.quote_id))
        AND ($8::uuid IS NULL OR EXISTS (
          SELECT 1 FROM app.memberships m WHERE m.tenant_id=p.tenant_id AND m.user_profile_id=$8::uuid AND m.status='active'
        ))
    ), added AS (
      INSERT INTO production.project_timeline_tasks
        (project_id, title, sub_job_id, planned_start, planned_end, allocated_minutes, assignee_profile_id, status, notes)
      SELECT scope.id, $3, $4::uuid, $5::timestamp, $6::timestamp, $7::integer, $8::uuid, $9, $10
      FROM scope RETURNING project_id
    )
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM added)
  `, [tenantId, projectId, data.title, data.subJobId, data.schedule.plannedStart, data.schedule.plannedEnd,
    data.schedule.allocatedMinutes, data.assigneeProfileId, data.status, data.notes]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateProjectTask(tenantId: string, projectId: string, taskId: string, input: TimelineTaskInput): Promise<boolean> {
  const data = cleanTask(input);
  const result = await pool.query(`
    WITH scope AS (
      SELECT p.id FROM production.project_plans p
      JOIN production.production_jobs j ON j.id=p.production_job_id AND j.tenant_id=p.tenant_id
      WHERE p.id=$2::uuid AND p.tenant_id=$1::uuid
        AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM sales.quote_sub_jobs sj WHERE sj.id=$5::uuid AND sj.quote_id=j.quote_id))
        AND ($9::uuid IS NULL OR EXISTS (
          SELECT 1 FROM app.memberships m WHERE m.tenant_id=p.tenant_id AND m.user_profile_id=$9::uuid AND m.status='active'
        ))
    ), changed AS (
      UPDATE production.project_timeline_tasks task
         SET title=$4, sub_job_id=$5::uuid, planned_start=$6::timestamp, planned_end=$7::timestamp,
             allocated_minutes=$8::integer, assignee_profile_id=$9::uuid, status=$10, notes=$11, updated_at=now()
       WHERE task.id=$3::uuid AND task.project_id IN (SELECT id FROM scope)
       RETURNING project_id
    )
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM changed)
  `, [tenantId, projectId, taskId, data.title, data.subJobId, data.schedule.plannedStart, data.schedule.plannedEnd,
    data.schedule.allocatedMinutes, data.assigneeProfileId, data.status, data.notes]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteProjectTask(tenantId: string, projectId: string, taskId: string): Promise<boolean> {
  const result = await pool.query(`
    WITH removed AS (
      DELETE FROM production.project_timeline_tasks task
       USING production.project_plans p, production.production_jobs j
       WHERE task.id=$3::uuid AND task.project_id=p.id AND p.id=$2::uuid
         AND p.tenant_id=$1::uuid AND j.id=p.production_job_id AND j.tenant_id=p.tenant_id
       RETURNING task.project_id
    )
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM removed)
  `, [tenantId, projectId, taskId]);
  return (result.rowCount ?? 0) > 0;
}

export async function scheduleExistingProductionStep(
  tenantId: string, projectId: string, stepId: string,
  input: { plannedStart: string; plannedEnd: string; allocatedHours: string }
): Promise<boolean> {
  const schedule = parseProjectSchedule(input);
  const result = await pool.query(`
    WITH source AS (
      SELECT p.id AS project_id, step.id AS step_id, step.label,
             sj.id AS sub_job_id
      FROM production.project_plans p
      JOIN production.production_jobs job ON job.id=p.production_job_id AND job.tenant_id=p.tenant_id
      JOIN production.production_steps step ON step.job_id=job.id AND step.id=$3::uuid
      LEFT JOIN production.production_items item ON item.id=step.item_id AND item.job_id=job.id
      LEFT JOIN sales.quote_lines line ON line.id=item.source_quote_line_id AND line.quote_id=job.quote_id
      LEFT JOIN sales.quote_sub_jobs sj ON sj.quote_id=job.quote_id AND sj.id::text=line.configuration_snapshot ->> 'subJobId'
      WHERE p.tenant_id=$1::uuid AND p.id=$2::uuid AND job.status <> 'deleted'
    ), inserted AS (
      INSERT INTO production.project_timeline_tasks
        (project_id, production_step_id, title, sub_job_id, planned_start, planned_end, allocated_minutes)
      SELECT project_id, step_id, label, sub_job_id, $4::timestamp, $5::timestamp, $6::integer FROM source
      ON CONFLICT (project_id, production_step_id) WHERE production_step_id IS NOT NULL DO NOTHING
      RETURNING project_id
    )
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM inserted)
  `, [tenantId, projectId, stepId, schedule.plannedStart, schedule.plannedEnd, schedule.allocatedMinutes]);
  return (result.rowCount ?? 0) > 0;
}
