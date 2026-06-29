import "server-only";

import type { SurveyRequestRecord } from "./surveys";
import { updateSurveyInstallSchedulerLink } from "./surveys";

type CreateSurveyJobInput = {
  tenantId: string;
  survey: SurveyRequestRecord;
  enquiryRequestSummary?: string | null;
  enquiryNotes?: string | null;
  email?: string | null;
  clientLogoUrl?: string | null;
  clientLogoStoragePath?: string | null;
};

function cleanBaseUrl(value: string | undefined): string {
  return (value || "").trim().replace(/\/$/, "");
}

export function installSchedulerBridgeConfigured(): boolean {
  return Boolean(process.env.INSTALL_SCHEDULER_CREATE_SURVEY_URL && process.env.INSTALL_SCHEDULER_BRIDGE_KEY);
}

export async function createInstallSchedulerSurveyJob(input: CreateSurveyJobInput): Promise<{
  ok: boolean;
  jobId?: string;
  jobUrl?: string;
  error?: string;
}> {
  const endpoint = process.env.INSTALL_SCHEDULER_CREATE_SURVEY_URL?.trim();
  const bridgeKey = process.env.INSTALL_SCHEDULER_BRIDGE_KEY?.trim();

  if (!endpoint || !bridgeKey) {
    await updateSurveyInstallSchedulerLink(input.tenantId, input.survey.id, {
      syncStatus: "not_configured",
      syncError: "Install Scheduler bridge is not configured. Set INSTALL_SCHEDULER_CREATE_SURVEY_URL and INSTALL_SCHEDULER_BRIDGE_KEY.",
    });
    return { ok: false, error: "Install Scheduler bridge is not configured" };
  }

  const survey = input.survey;
  const payload = {
    tenantId: input.tenantId,
    productionManagerSurveyRequestId: survey.id,
    productionManagerEnquiryId: survey.enquiryId,
    linkedCustomerId: survey.linkedCustomerId,
    clientName: survey.clientName,
    contactName: survey.contactName,
    phone: survey.phone,
    email: input.email ?? null,
    clientLogoUrl: input.clientLogoUrl ?? null,
    clientLogoStoragePath: input.clientLogoStoragePath ?? null,
    siteAddress: survey.siteAddress,
    dueDate: survey.dueDate,
    assignedTo: survey.assignedTo,
    notes: survey.notes,
    requestSummary: input.enquiryRequestSummary ?? null,
    enquiryNotes: input.enquiryNotes ?? null,
    productionManagerBaseUrl: cleanBaseUrl(process.env.NEXT_PUBLIC_APP_URL),
  };

  try {
    await updateSurveyInstallSchedulerLink(input.tenantId, survey.id, {
      syncStatus: "creating",
      payload,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bridgeKey}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      const message = body?.error || `Install Scheduler bridge returned ${response.status}`;
      await updateSurveyInstallSchedulerLink(input.tenantId, survey.id, {
        syncStatus: "error",
        syncError: message,
        payload: body,
      });
      return { ok: false, error: message };
    }

    const baseUrl = cleanBaseUrl(process.env.INSTALL_SCHEDULER_BASE_URL || "https://install-scheduler.web.app");
    const jobId = body?.jobId ? String(body.jobId) : undefined;
    const jobUrl = body?.jobUrl ? String(body.jobUrl) : jobId ? `${baseUrl}/jobs/${jobId}` : undefined;

    await updateSurveyInstallSchedulerLink(input.tenantId, survey.id, {
      jobId: jobId ?? null,
      jobUrl: jobUrl ?? null,
      syncStatus: "created",
      syncError: null,
      payload: body,
    });

    return { ok: true, jobId, jobUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSurveyInstallSchedulerLink(input.tenantId, survey.id, {
      syncStatus: "error",
      syncError: message,
    });
    return { ok: false, error: message };
  }
}

type CreateInstallJobInput = {
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
  destination: string;
  productionManagerBaseUrl: string;
  clientLogoUrl: string | null;
  clientLogoStoragePath: string | null;
};

export function installSchedulerInstallBridgeConfigured(): boolean {
  return Boolean(process.env.INSTALL_SCHEDULER_CREATE_INSTALL_JOB_URL && process.env.INSTALL_SCHEDULER_BRIDGE_KEY);
}

export async function createInstallSchedulerInstallJob(input: CreateInstallJobInput): Promise<{
  ok: boolean;
  jobId?: string;
  jobUrl?: string;
  skipped?: boolean;
  error?: string;
  responseBody?: unknown;
}> {
  const endpoint = process.env.INSTALL_SCHEDULER_CREATE_INSTALL_JOB_URL?.trim();
  const bridgeKey = process.env.INSTALL_SCHEDULER_BRIDGE_KEY?.trim();

  if (!endpoint || !bridgeKey) {
    return {
      ok: false,
      skipped: true,
      error: "Install Scheduler install bridge is not configured. Set INSTALL_SCHEDULER_CREATE_INSTALL_JOB_URL and INSTALL_SCHEDULER_BRIDGE_KEY."
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${bridgeKey}`,
      },
      body: JSON.stringify(input),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      return { ok: false, error: body?.error || `Install Scheduler bridge returned ${response.status}`, responseBody: body };
    }

    const baseUrl = cleanBaseUrl(process.env.INSTALL_SCHEDULER_BASE_URL || "https://install-scheduler.web.app");
    const jobId = body?.jobId ? String(body.jobId) : undefined;
    const jobUrl = body?.jobUrl ? String(body.jobUrl) : jobId ? `${baseUrl}/jobs/${jobId}` : undefined;
    return { ok: true, jobId, jobUrl, responseBody: body };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
