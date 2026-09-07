import "server-only";

import {
  jobProcessKeyForStage,
  listJobProcessAssignmentsForTenant,
  listJobsForTenant,
  listJobTasksForTenant,
  type JobRecord,
} from "@/server/jobs";
import { listNotificationsWithUnreadForTenant, type AppNotificationRecord } from "@/server/notifications";

export type OperationsAttentionTone = "danger" | "warning" | "success" | "blue" | "neutral";

export type OperationsAttentionSnapshot = {
  attention: {
    eyebrow: string;
    title: string;
    detail: string;
    href: string;
    tone: OperationsAttentionTone;
  };
  today: {
    taskCount: number;
    installCount: number;
    href: string;
  };
  latest: {
    title: string;
    createdAt: string;
    href: string;
  } | null;
  activeJobs: number;
};

function australiaTodayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Sydney",
  });
}

function normaliseNotificationHref(notification: AppNotificationRecord): string {
  const payload = notification.payloadJson ?? {};
  const quoteId = typeof payload.quoteId === "string" ? payload.quoteId.trim() : "";
  const lineId = typeof payload.lineId === "string" ? payload.lineId.trim() : "";
  if (notification.eventType === "quote_line_response" && quoteId) {
    const focus = lineId ? `&focusLine=${encodeURIComponent(lineId)}#quote-line-${encodeURIComponent(lineId)}` : "";
    return `/quotes?selected=${encodeURIComponent(quoteId)}${focus}`;
  }
  const href = notification.href || "/dashboard";
  if (href.startsWith("/quotes?quote=")) return href.replace("/quotes?quote=", "/quotes?selected=");
  return href;
}

type AttentionCandidate = {
  job: JobRecord;
  dueDate: string | null;
  rank: number;
  eyebrow: string;
  tone: OperationsAttentionTone;
};

function stageCandidate(job: JobRecord, dueDate: string | null, todayKey: string): AttentionCandidate | null {
  if (dueDate && dueDate < todayKey) {
    return { job, dueDate, rank: 0, eyebrow: "Overdue", tone: "danger" };
  }
  if (job.currentStage.includes("changes_requested")) {
    return { job, dueDate, rank: 1, eyebrow: "Changes requested", tone: "danger" };
  }
  if (dueDate === todayKey) {
    return { job, dueDate, rank: 2, eyebrow: "Due today", tone: "warning" };
  }
  if (job.currentStage === "artwork_approved") {
    return { job, dueDate, rank: 3, eyebrow: "Approval received", tone: "success" };
  }
  if (job.currentStage === "new_enquiry") {
    return { job, dueDate, rank: 4, eyebrow: "New enquiry", tone: "blue" };
  }
  if (job.currentStage === "quote_required") {
    return { job, dueDate, rank: 5, eyebrow: "Quote required", tone: "warning" };
  }
  if (job.currentStage === "invoice_required") {
    return { job, dueDate, rank: 6, eyebrow: "Invoice required", tone: "danger" };
  }
  return null;
}

function candidateSort(a: AttentionCandidate, b: AttentionCandidate): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return a.job.receivedAt.localeCompare(b.job.receivedAt);
}

export async function getOperationsAttentionSnapshotForTenant(tenantId: string): Promise<OperationsAttentionSnapshot> {
  const [jobs, assignments, tasks, notificationSnapshot] = await Promise.all([
    listJobsForTenant(tenantId, { skipSync: true }),
    listJobProcessAssignmentsForTenant(tenantId),
    listJobTasksForTenant(tenantId),
    listNotificationsWithUnreadForTenant(tenantId, 30),
  ]);

  const todayKey = australiaTodayKey();
  const assignmentByJobAndProcess = new Map(assignments.map((assignment) => [`${assignment.jobId}:${assignment.processKey}`, assignment]));
  const effectiveDueDate = (job: JobRecord): string | null => {
    const processKey = jobProcessKeyForStage(job.currentStage);
    if (!processKey) return job.dueDate;
    return assignmentByJobAndProcess.get(`${job.id}:${processKey}`)?.dueDate || job.dueDate;
  };

  const candidates = jobs
    .map((job) => stageCandidate(job, effectiveDueDate(job), todayKey))
    .filter((candidate): candidate is AttentionCandidate => Boolean(candidate))
    .sort(candidateSort);

  const chosen = candidates[0] ?? null;
  const nextDueJob = jobs
    .map((job) => ({ job, dueDate: effectiveDueDate(job) }))
    .filter((entry): entry is { job: JobRecord; dueDate: string } => Boolean(entry.dueDate && entry.dueDate > todayKey))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;

  const openManualTasksToday = tasks.filter((task) =>
    !task.isSystem
    && task.dueDate === todayKey
    && task.status !== "completed"
    && task.status !== "cancelled"
  ).length;
  const currentProcessesDueToday = jobs.filter((job) => effectiveDueDate(job) === todayKey).length;

  const installCount = jobs.filter((job) => {
    if ((job.dispatchType || "").toLowerCase() !== "install") return false;
    const dispatchDue = assignmentByJobAndProcess.get(`${job.id}:dispatch`)?.dueDate;
    if (dispatchDue) return dispatchDue === todayKey;
    return job.currentStage === "ready_for_install" && effectiveDueDate(job) === todayKey;
  }).length;

  const latestNotification = [...notificationSnapshot.notifications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  const attention = chosen ? {
    eyebrow: chosen.eyebrow,
    title: `${chosen.job.title} — ${chosen.job.currentStageLabel}`,
    detail: [chosen.job.clientName, chosen.dueDate ? `Due ${formatDate(chosen.dueDate)}` : "", chosen.job.nextAction].filter(Boolean).join(" · "),
    href: chosen.job.currentHref || "/dashboard",
    tone: chosen.tone,
  } : {
    eyebrow: "All clear",
    title: "Nothing urgent",
    detail: nextDueJob
      ? `${jobs.length} active jobs · Next due: ${nextDueJob.job.title}, ${formatDate(nextDueJob.dueDate)}`
      : `${jobs.length} active jobs · No upcoming due dates`,
    href: nextDueJob?.job.currentHref || "/dashboard",
    tone: "success" as const,
  };

  return {
    attention,
    today: {
      taskCount: openManualTasksToday + currentProcessesDueToday,
      installCount,
      href: `/calendar?date=${encodeURIComponent(todayKey)}&view=agenda`,
    },
    latest: latestNotification ? {
      title: latestNotification.title,
      createdAt: new Date(latestNotification.createdAt).toISOString(),
      href: normaliseNotificationHref(latestNotification),
    } : null,
    activeJobs: jobs.length,
  };
}
