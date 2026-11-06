import "server-only";
import { pool } from "@production-manager/db";
import { parseProjectSchedule, type ProjectTaskStatus, type ProjectSchedule } from "@/lib/project-timeline";

export type ProjectPlanRecord = {
  id: string;
  tenantId: string;
  productionJobId: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  title: string;
  clientName: string;
  jobStatus: string;
  dueDate: string | null;
  updatedAt: string;
  taskCount: number;
  isManual: boolean;
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
           COALESCE(p.manual_title, NULLIF(j.project_name,''), j.quote_number, j.client_name) AS title,
           COALESCE(p.manual_client_name, j.client_name, '') AS "clientName",
           CASE WHEN p.production_job_id IS NULL THEN 'planning' ELSE j.status END AS "jobStatus",
           COALESCE(p.manual_due_date, j.due_date)::text AS "dueDate", p.updated_at::text AS "updatedAt",
           (p.production_job_id IS NULL) AS "isManual",
           (SELECT count(*)::int FROM production.project_timeline_tasks task WHERE task.project_id = p.id) AS "taskCount"
      FROM production.project_plans p
      LEFT JOIN production.production_jobs j ON j.id = p.production_job_id AND j.tenant_id = p.tenant_id
     WHERE p.tenant_id = $1::uuid AND (p.production_job_id IS NULL OR j.status <> 'deleted')
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
           COALESCE(p.manual_title, NULLIF(j.project_name,''), j.quote_number, j.client_name) AS title,
           COALESCE(p.manual_client_name, j.client_name, '') AS "clientName",
           CASE WHEN p.production_job_id IS NULL THEN 'planning' ELSE j.status END AS "jobStatus",
           COALESCE(p.manual_due_date, j.due_date)::text AS "dueDate", p.updated_at::text AS "updatedAt",
           (p.production_job_id IS NULL) AS "isManual",
           (SELECT count(*)::int FROM production.project_timeline_tasks task WHERE task.project_id = p.id) AS "taskCount"
      FROM production.project_plans p
      LEFT JOIN production.production_jobs j ON j.id = p.production_job_id AND j.tenant_id = p.tenant_id
     WHERE p.tenant_id = $1::uuid AND p.id = $2::uuid
       AND (p.production_job_id IS NULL OR j.status <> 'deleted')
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
    UNION ALL
    SELECT ms.id::text, ms.title, ms.sort_order AS "sortOrder"
      FROM production.project_manual_sections ms
      JOIN production.project_plans p ON p.id=ms.project_id
     WHERE p.tenant_id=$1::uuid AND p.id=$2::uuid AND p.production_job_id IS NULL
    ORDER BY "sortOrder", title
  `, [tenantId, projectId]);
  return result.rows;
}

export async function listProjectTasks(tenantId: string, projectId: string): Promise<ProjectTimelineTaskRecord[]> {
  const result = await pool.query<ProjectTimelineTaskRecord>(`
    SELECT task.id::text, task.project_id::text AS "projectId",
           COALESCE(task.manual_section_id, task.sub_job_id)::text AS "subJobId",
           task.production_step_id::text AS "productionStepId", task.title,
           to_char(task.planned_start, 'YYYY-MM-DD"T"HH24:MI') AS "plannedStart",
           to_char(task.planned_end, 'YYYY-MM-DD"T"HH24:MI') AS "plannedEnd",
           task.allocated_minutes AS "allocatedMinutes",
           task.assignee_profile_id::text AS "assigneeProfileId",
           COALESCE(NULLIF(profile.short_name,''), profile.full_name) AS "assigneeName",
           task.status, step.status AS "productionStepStatus", task.notes, task.sort_order AS "sortOrder"
      FROM production.project_timeline_tasks task
      JOIN production.project_plans p ON p.id=task.project_id
      LEFT JOIN production.production_jobs job ON job.id=p.production_job_id AND job.tenant_id=p.tenant_id
      LEFT JOIN app.user_profiles profile ON profile.id=task.assignee_profile_id
      LEFT JOIN production.production_steps step ON step.id=task.production_step_id AND step.job_id=job.id
     WHERE p.id=$2::uuid AND p.tenant_id=$1::uuid
       AND (p.production_job_id IS NULL OR job.status <> 'deleted')
     ORDER BY task.sort_order, task.planned_start, task.id
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

/** Inserts/updates require tenant-scoped projects, their own section type, and active assignees. */
export async function addProjectTask(tenantId: string, projectId: string, input: TimelineTaskInput): Promise<boolean> {
  const data = cleanTask(input);
  const result = await pool.query(`
    WITH scope AS (
      SELECT p.id, p.production_job_id FROM production.project_plans p
      LEFT JOIN production.production_jobs j ON j.id=p.production_job_id AND j.tenant_id=p.tenant_id
      WHERE p.id=$2::uuid AND p.tenant_id=$1::uuid
        AND (p.production_job_id IS NULL OR j.status <> 'deleted')
        AND ($4::uuid IS NULL
          OR (p.production_job_id IS NOT NULL AND EXISTS
            (SELECT 1 FROM sales.quote_sub_jobs sj WHERE sj.id=$4::uuid AND sj.quote_id=j.quote_id))
          OR (p.production_job_id IS NULL AND EXISTS
            (SELECT 1 FROM production.project_manual_sections ms WHERE ms.id=$4::uuid AND ms.project_id=p.id)))
        AND ($8::uuid IS NULL OR EXISTS (
          SELECT 1 FROM app.memberships m WHERE m.tenant_id=p.tenant_id AND m.user_profile_id=$8::uuid AND m.status='active'
        ))
    ), added AS (
      INSERT INTO production.project_timeline_tasks
        (project_id, title, sub_job_id, manual_section_id, planned_start, planned_end,
         allocated_minutes, assignee_profile_id, status, notes, sort_order)
      SELECT scope.id, $3,
             CASE WHEN scope.production_job_id IS NOT NULL THEN $4::uuid ELSE NULL END,
             CASE WHEN scope.production_job_id IS NULL THEN $4::uuid ELSE NULL END,
             $5::timestamp, $6::timestamp, $7::integer, $8::uuid, $9, $10,
             COALESCE((SELECT MAX(previous.sort_order) + 1 FROM production.project_timeline_tasks previous
               WHERE previous.project_id=scope.id
                 AND COALESCE(previous.manual_section_id, previous.sub_job_id) IS NOT DISTINCT FROM $4::uuid), 0)
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
      SELECT p.id, p.production_job_id FROM production.project_plans p
      LEFT JOIN production.production_jobs j ON j.id=p.production_job_id AND j.tenant_id=p.tenant_id
      WHERE p.id=$2::uuid AND p.tenant_id=$1::uuid
        AND (p.production_job_id IS NULL OR j.status <> 'deleted')
        AND ($5::uuid IS NULL
          OR (p.production_job_id IS NOT NULL AND EXISTS
            (SELECT 1 FROM sales.quote_sub_jobs sj WHERE sj.id=$5::uuid AND sj.quote_id=j.quote_id))
          OR (p.production_job_id IS NULL AND EXISTS
            (SELECT 1 FROM production.project_manual_sections ms WHERE ms.id=$5::uuid AND ms.project_id=p.id)))
        AND ($9::uuid IS NULL OR EXISTS (
          SELECT 1 FROM app.memberships m WHERE m.tenant_id=p.tenant_id AND m.user_profile_id=$9::uuid AND m.status='active'
        ))
    ), changed AS (
      UPDATE production.project_timeline_tasks task
         SET title=$4,
             sub_job_id=CASE WHEN scope.production_job_id IS NOT NULL THEN $5::uuid ELSE NULL END,
             manual_section_id=CASE WHEN scope.production_job_id IS NULL THEN $5::uuid ELSE NULL END,
             planned_start=$6::timestamp, planned_end=$7::timestamp,
             allocated_minutes=$8::integer, assignee_profile_id=$9::uuid, status=$10, notes=$11, updated_at=now()
        FROM scope
       WHERE task.id=$3::uuid AND task.project_id=scope.id
       RETURNING project_id
    )
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM changed)
  `, [tenantId, projectId, taskId, data.title, data.subJobId, data.schedule.plannedStart, data.schedule.plannedEnd,
    data.schedule.allocatedMinutes, data.assigneeProfileId, data.status, data.notes]);
  return (result.rowCount ?? 0) > 0;
}

/** Schedule-only write for direct Gantt manipulation. Does not overwrite task ownership,
 * allocated labour, title, status or production checklist state. The expected timestamps
 * prevent a stale browser tab from silently overwriting another planner's update. */
export async function rescheduleProjectTask(
  tenantId: string, projectId: string, taskId: string,
  input: { plannedStart: string; plannedEnd: string; expectedStart: string; expectedEnd: string }
): Promise<boolean> {
  const next = parseProjectSchedule({
    plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, allocatedHours: "0"
  });
  // Validate original timestamps before passing them as SQL parameters too.
  parseProjectSchedule({
    plannedStart: input.expectedStart, plannedEnd: input.expectedEnd, allocatedHours: "0"
  });
  const result = await pool.query(`
    WITH changed AS (
      UPDATE production.project_timeline_tasks task
         SET planned_start=$4::timestamp, planned_end=$5::timestamp, updated_at=now()
        FROM production.project_plans p
       WHERE task.id=$3::uuid AND task.project_id=p.id AND p.id=$2::uuid
         AND p.tenant_id=$1::uuid AND (p.production_job_id IS NULL OR EXISTS (SELECT 1 FROM production.production_jobs j WHERE j.id=p.production_job_id AND j.tenant_id=p.tenant_id AND j.status <> 'deleted'))
         AND task.planned_start=$6::timestamp AND task.planned_end=$7::timestamp
       RETURNING task.project_id
    )
    UPDATE production.project_plans SET updated_at=now()
     WHERE id IN (SELECT project_id FROM changed)
  `, [tenantId, projectId, taskId,
    next.plannedStart, next.plannedEnd, input.expectedStart, input.expectedEnd]);
  return (result.rowCount ?? 0) > 0;
}

export async function deleteProjectTask(tenantId: string, projectId: string, taskId: string): Promise<boolean> {
  const result = await pool.query(`
    WITH removed AS (
      DELETE FROM production.project_timeline_tasks task
       USING production.project_plans p
       WHERE task.id=$3::uuid AND task.project_id=p.id AND p.id=$2::uuid
         AND p.tenant_id=$1::uuid AND (p.production_job_id IS NULL OR EXISTS (SELECT 1 FROM production.production_jobs j WHERE j.id=p.production_job_id AND j.tenant_id=p.tenant_id AND j.status <> 'deleted'))
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
        (project_id, production_step_id, title, sub_job_id, planned_start, planned_end, allocated_minutes, sort_order)
      SELECT project_id, step_id, label, sub_job_id, $4::timestamp, $5::timestamp, $6::integer,
             COALESCE((SELECT MAX(previous.sort_order) + 1 FROM production.project_timeline_tasks previous
               WHERE previous.project_id=source.project_id AND previous.sub_job_id IS NOT DISTINCT FROM source.sub_job_id), 0)
      FROM source
      ON CONFLICT (project_id, production_step_id) WHERE production_step_id IS NOT NULL DO NOTHING
      RETURNING project_id
    )
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM inserted)
  `, [tenantId, projectId, stepId, schedule.plannedStart, schedule.plannedEnd, schedule.allocatedMinutes]);
  return (result.rowCount ?? 0) > 0;
}

/** Assign one active workspace staff member without overwriting schedule, labour or task status.
 * Compare-and-swap prevents overwriting changes made in a different open tab. */
export async function assignProjectTaskForTenant(tenantId: string, projectId: string, taskId: string,
  newAssignee: string | null, expectedAssignee: string | null): Promise<boolean> {
  const result = await pool.query(`
    WITH changed AS (
      UPDATE production.project_timeline_tasks task SET assignee_profile_id=$4::uuid, updated_at=now()
        FROM production.project_plans p
       WHERE task.id=$3::uuid AND task.project_id=p.id AND p.id=$2::uuid
         AND p.tenant_id=$1::uuid AND (p.production_job_id IS NULL OR EXISTS (SELECT 1 FROM production.production_jobs job WHERE job.id=p.production_job_id AND job.tenant_id=p.tenant_id AND job.status <> 'deleted')) AND task.assignee_profile_id IS NOT DISTINCT FROM $5::uuid
         AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM app.memberships m
               WHERE m.tenant_id=$1::uuid AND m.user_profile_id=$4::uuid AND m.status='active'))
       RETURNING task.project_id
    )
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM changed)
  `, [tenantId, projectId, taskId, newAssignee, expectedAssignee]);
  return (result.rowCount ?? 0) > 0;
}

/** Cheap revision probe: only one indexed row, no task payload. */
export async function getProjectRevision(tenantId: string, projectId: string): Promise<string | null> {
  const result = await pool.query<{ revision: string }>(`
    SELECT p.updated_at::text AS revision FROM production.project_plans p
    LEFT JOIN production.production_jobs job ON job.id=p.production_job_id AND job.tenant_id=p.tenant_id
    WHERE p.tenant_id=$1::uuid AND p.id=$2::uuid
      AND (p.production_job_id IS NULL OR job.status <> 'deleted')
  `, [tenantId, projectId]);
  return result.rows[0]?.revision ?? null;
}


/** Reorder the tasks in a single Sub Job (or General) without touching their schedule,
 * staff, labour allocations or linked production steps. The project row lock serialises
 * competing reorders and the expected ID order rejects stale browser snapshots. */
export async function reorderProjectTasksForTenant(
  tenantId: string, projectId: string, subJobId: string | null,
  orderedTaskIds: string[], expectedTaskIds: string[]
): Promise<boolean> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(tenantId) || !uuid.test(projectId) || (subJobId !== null && !uuid.test(subJobId)) ||
      orderedTaskIds.length === 0 || orderedTaskIds.length > 500 ||
      orderedTaskIds.length !== expectedTaskIds.length ||
      orderedTaskIds.some(id => !uuid.test(id)) || expectedTaskIds.some(id => !uuid.test(id)) ||
      new Set(orderedTaskIds).size !== orderedTaskIds.length ||
      new Set(expectedTaskIds).size !== expectedTaskIds.length ||
      orderedTaskIds.some(id => !expectedTaskIds.includes(id))) return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const project = await client.query(`
      SELECT p.id FROM production.project_plans p
      LEFT JOIN production.production_jobs j ON j.id=p.production_job_id AND j.tenant_id=p.tenant_id
      WHERE p.id=$2::uuid AND p.tenant_id=$1::uuid
        AND (p.production_job_id IS NULL OR j.status <> 'deleted')
        AND ($3::uuid IS NULL
          OR (p.production_job_id IS NOT NULL AND EXISTS (SELECT 1 FROM sales.quote_sub_jobs sj
              WHERE sj.id=$3::uuid AND sj.quote_id=j.quote_id))
          OR (p.production_job_id IS NULL AND EXISTS (SELECT 1 FROM production.project_manual_sections ms
              WHERE ms.id=$3::uuid AND ms.project_id=p.id)))
      FOR UPDATE OF p
    `, [tenantId, projectId, subJobId]);
    if (!project.rowCount) { await client.query("ROLLBACK"); return false; }

    const current = await client.query<{ id: string }>(`
      SELECT task.id::text FROM production.project_timeline_tasks task
      WHERE task.project_id=$1::uuid AND COALESCE(task.manual_section_id, task.sub_job_id) IS NOT DISTINCT FROM $2::uuid
      ORDER BY task.sort_order, task.planned_start, task.id
      FOR UPDATE
    `, [projectId, subJobId]);
    const currentIds = current.rows.map(row => row.id);
    if (currentIds.length !== expectedTaskIds.length ||
        currentIds.some((id, i) => id !== expectedTaskIds[i])) {
      await client.query("ROLLBACK");
      return false;
    }
    const updated = await client.query(`
      UPDATE production.project_timeline_tasks task
         SET sort_order=ordered.ordinality::integer - 1, updated_at=now()
        FROM unnest($3::uuid[]) WITH ORDINALITY AS ordered(id, ordinality)
       WHERE task.project_id=$1::uuid AND COALESCE(task.manual_section_id, task.sub_job_id) IS NOT DISTINCT FROM $2::uuid
         AND task.id=ordered.id
    `, [projectId, subJobId, orderedTaskIds]);
    if (updated.rowCount !== currentIds.length) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query('UPDATE production.project_plans SET updated_at=now() WHERE id=$1::uuid', [projectId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Standalone projects are planning-only. They never create quote, job or MYOB rows. */
export async function createManualProjectPlan(tenantId: string, title: string, clientName: string): Promise<string> {
  const cleanTitle = title.trim();
  const cleanClient = clientName.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new Error("Project name must be between 1 and 200 characters.");
  if (cleanClient.length > 200) throw new Error("Client/reference cannot exceed 200 characters.");
  const result = await pool.query<{ id: string }>(`
    INSERT INTO production.project_plans(tenant_id, manual_title, manual_client_name)
    VALUES ($1::uuid, $2, $3) RETURNING id::text
  `, [tenantId, cleanTitle, cleanClient || null]);
  return result.rows[0].id;
}

export async function updateManualProjectPlan(
  tenantId: string, projectId: string, title: string, clientName: string, dueDate: string | null
): Promise<boolean> {
  const cleanTitle = title.trim();
  const cleanClient = clientName.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new Error("Project name must be between 1 and 200 characters.");
  if (cleanClient.length > 200) throw new Error("Client/reference cannot exceed 200 characters.");
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) {
    throw new Error("Invalid target completion date.");
  }
  const result = await pool.query(`
    UPDATE production.project_plans
      SET manual_title=$3, manual_client_name=NULLIF($4, ''), manual_due_date=$5::date, updated_at=now()
    WHERE id=$2::uuid AND tenant_id=$1::uuid AND production_job_id IS NULL
  `, [tenantId, projectId, cleanTitle, cleanClient, dueDate]);
  return (result.rowCount ?? 0) > 0;
}

export async function addManualProjectSection(tenantId: string, projectId: string, title: string): Promise<boolean> {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new Error("Sub Job name must be between 1 and 200 characters.");
  const result = await pool.query(`
    WITH scope AS (SELECT id FROM production.project_plans
      WHERE tenant_id=$1::uuid AND id=$2::uuid AND production_job_id IS NULL),
    inserted AS (INSERT INTO production.project_manual_sections(project_id, title, sort_order)
      SELECT id, $3, COALESCE((SELECT max(s.sort_order)+1 FROM production.project_manual_sections s WHERE s.project_id=scope.id),0)
      FROM scope RETURNING project_id)
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM inserted)
  `, [tenantId, projectId, cleanTitle]);
  return (result.rowCount ?? 0) > 0;
}

export async function renameManualProjectSection(tenantId: string, projectId: string, sectionId: string, title: string): Promise<boolean> {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new Error("Sub Job name must be between 1 and 200 characters.");
  const result = await pool.query(`
    WITH changed AS (UPDATE production.project_manual_sections s
      SET title=$4, updated_at=now()
      FROM production.project_plans p
      WHERE s.id=$3::uuid AND s.project_id=p.id AND p.id=$2::uuid
        AND p.tenant_id=$1::uuid AND p.production_job_id IS NULL
      RETURNING s.project_id)
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM changed)
  `, [tenantId, projectId, sectionId, cleanTitle]);
  return (result.rowCount ?? 0) > 0;
}

/** Removing a manual section keeps its tasks, which become General / Unassigned. */
export async function removeManualProjectSection(tenantId: string, projectId: string, sectionId: string): Promise<boolean> {
  const result = await pool.query(`
    WITH removed AS (DELETE FROM production.project_manual_sections s
      USING production.project_plans p
      WHERE s.id=$3::uuid AND s.project_id=p.id AND p.id=$2::uuid
        AND p.tenant_id=$1::uuid AND p.production_job_id IS NULL
      RETURNING s.project_id)
    UPDATE production.project_plans SET updated_at=now() WHERE id IN (SELECT project_id FROM removed)
  `, [tenantId, projectId, sectionId]);
  return (result.rowCount ?? 0) > 0;
}
