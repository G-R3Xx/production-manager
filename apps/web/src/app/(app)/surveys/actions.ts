
"use server";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { createInstallSchedulerSurveyJob } from "@/server/installSchedulerBridge";
import { getEnquiryById } from "@/server/enquiries";
import { customerLogoUrl, getCustomerById } from "@/server/customers";
import { addQuoteLine, createQuoteDraftForTenant, getQuoteDraftForSurveyRequest, listQuoteLines } from "@/server/quotes";
import { createSurveyRequestForTenant, getSurveyRequestById, setSurveyRequestStatusForTenant, surveyDimensionMm, surveySignsFromPayload, updateSurveyRequestForTenant } from "@/server/surveys";
import { attachQuoteToJobForTenant } from "@/server/jobs";


async function requireTenant() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap?error=Create%20or%20select%20a%20tenant%20first");
  }
  return activeTenant;
}

function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}


export async function createSurveyRequestAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const clientName = String(formData.get("clientName") ?? "").trim();

  if (!clientName) {
    redirect("/surveys?error=Client%20name%20is%20required");
  }

  const enquiryId = nullable(formData.get("enquiryId"));
  const linkedCustomerId = nullable(formData.get("linkedCustomerId"));

  const created = await createSurveyRequestForTenant(activeTenant.tenantId, {
    enquiryId,
    linkedCustomerId,
    clientName,
    contactName: nullable(formData.get("contactName")),
    phone: nullable(formData.get("phone")),
    siteAddress: nullable(formData.get("siteAddress")),
    dueDate: nullable(formData.get("dueDate")),
    assignedTo: nullable(formData.get("assignedTo")),
    notes: nullable(formData.get("notes"))
  });

  const survey = await getSurveyRequestById(activeTenant.tenantId, created.id);
  const sourceEnquiry = enquiryId ? await getEnquiryById(activeTenant.tenantId, enquiryId) : null;
  const linkedCustomer = linkedCustomerId ? await getCustomerById(activeTenant.tenantId, linkedCustomerId) : null;
  const bridgeResult = survey
    ? await createInstallSchedulerSurveyJob({
        tenantId: activeTenant.tenantId,
        survey,
        clientLogoUrl: sourceEnquiry?.clientLogoUrl || customerLogoUrl(linkedCustomer),
        clientLogoStoragePath: sourceEnquiry?.clientLogoStoragePath || (typeof linkedCustomer?.payloadJson.logoStoragePath === "string" ? linkedCustomer.payloadJson.logoStoragePath : null)
      })
    : { ok: false, error: "Survey was created but could not be reloaded" };

  const message = bridgeResult.ok
    ? "Survey request created and sent to Install Scheduler"
    : `Survey request created, but Install Scheduler was not created: ${bridgeResult.error || "bridge not configured"}`;

  redirect(`/surveys?selected=${created.id}&message=${encodeURIComponent(message)}`);
}


export async function updateSurveyRequestAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const surveyId = String(formData.get("surveyId") ?? "").trim();

  if (!surveyId) {
    redirect("/surveys?error=Choose%20a%20survey%20request%20first");
  }

  await updateSurveyRequestForTenant(activeTenant.tenantId, surveyId, {
    status: nullable(formData.get("status")),
    assignedTo: nullable(formData.get("assignedTo")),
    dueDate: nullable(formData.get("dueDate")),
    notes: nullable(formData.get("notes")),
    surveyDetails: nullable(formData.get("surveyDetails"))
  });

  redirect(`/surveys?selected=${surveyId}&message=Survey%20request%20updated`);
}


export async function deleteSurveyRequestAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const surveyId = String(formData.get("surveyId") ?? "").trim();
  if (!surveyId) redirect("/surveys?error=Choose%20a%20survey%20request%20to%20delete");

  await setSurveyRequestStatusForTenant(activeTenant.tenantId, surveyId, "deleted");
  redirect("/surveys?message=Survey%20request%20deleted%20from%20the%20active%20list");
}

export async function restoreSurveyRequestAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const surveyId = String(formData.get("surveyId") ?? "").trim();
  if (!surveyId) redirect("/surveys?filter=deleted&error=Choose%20a%20survey%20request%20to%20restore");

  await setSurveyRequestStatusForTenant(activeTenant.tenantId, surveyId, "requested");
  redirect("/surveys?message=Survey%20request%20restored");
}


function firstLine(value: string | null | undefined): string {
  return String(value ?? "").split(/\r?\n/g).map((line) => line.trim()).find(Boolean) ?? "";
}

function surveyLineNotes(sign: ReturnType<typeof surveySignsFromPayload>[number]): string | null {
  const rows = [
    sign.location ? `Location: ${sign.location}` : null,
    sign.description ? `Survey description: ${sign.description}` : null,
    sign.condition ? `Condition: ${sign.condition}` : null,
    sign.requiredWork ? `Required work: ${sign.requiredWork}` : null,
    sign.fixingMethod ? `Fixing / substrate: ${sign.fixingMethod}` : null,
    sign.accessNotes ? `Access notes: ${sign.accessNotes}` : null,
    sign.powerRequired ? `Power: ${sign.powerRequired}` : null,
    sign.notes ? `Survey notes: ${sign.notes}` : null,
  ].filter(Boolean);
  return rows.length ? rows.join("\n") : null;
}

function surveyLineSnapshot(surveyId: string, sign: ReturnType<typeof surveySignsFromPayload>[number]) {
  const widthMm = surveyDimensionMm(sign.width);
  const heightMm = surveyDimensionMm(sign.height);
  return {
    version: 1,
    source: "quick_quote_builder",
    builderMode: "advanced",
    activeStep: "base",
    flowType: "signage",
    widthMm: widthMm == null ? "" : String(widthMm),
    heightMm: heightMm == null ? "" : String(heightMm),
    quantity: sign.quantity || "1",
    surveyImported: true,
    surveyNeedsConfiguration: true,
    surveyContext: {
      surveyRequestId: surveyId,
      signKey: sign.key,
      signIndex: sign.index,
      title: sign.title,
      location: sign.location,
      width: sign.width,
      height: sign.height,
      depth: sign.depth,
      quantity: sign.quantity,
      description: sign.description,
      condition: sign.condition,
      requiredWork: sign.requiredWork,
      fixingMethod: sign.fixingMethod,
      accessNotes: sign.accessNotes,
      powerRequired: sign.powerRequired,
      notes: sign.notes,
      photos: sign.photos,
    },
    materialSnapshots: { main: null, media: null, backing: null, laminate: null, smallStock: null, smallCoating: null, eyelet: null, componentParts: [] },
  };
}

export async function createQuoteFromCompletedSurveyAction(formData: FormData): Promise<void> {
  const activeTenant = await requireTenant();
  const surveyId = String(formData.get("surveyId") ?? "").trim();
  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!surveyId) redirect("/surveys?error=Choose%20a%20completed%20survey%20first");

  const survey = await getSurveyRequestById(activeTenant.tenantId, surveyId);
  if (!survey) {
    redirect("/surveys?error=Survey%20request%20could%20not%20be%20found");
    return;
  }
  if (survey.status !== "completed" && survey.installSchedulerSyncStatus !== "completed") {
    redirect(`/surveys?selected=${surveyId}&error=${encodeURIComponent("Complete the survey in Install Scheduler before creating its quote lines.")}`);
  }

  const signs = surveySignsFromPayload(survey.installSchedulerPayload);
  const [sourceEnquiry, existingQuote] = await Promise.all([
    survey.enquiryId ? getEnquiryById(activeTenant.tenantId, survey.enquiryId) : Promise.resolve(null),
    getQuoteDraftForSurveyRequest(activeTenant.tenantId, survey.id),
  ]);
  const resolvedLinkedCustomerId = survey.linkedCustomerId || sourceEnquiry?.linkedCustomerId || null;
  const linkedCustomer = resolvedLinkedCustomerId ? await getCustomerById(activeTenant.tenantId, resolvedLinkedCustomerId) : null;

  const quote = existingQuote ?? await createQuoteDraftForTenant(activeTenant.tenantId, {
    enquiryId: survey.enquiryId,
    surveyRequestId: survey.id,
    linkedCustomerId: resolvedLinkedCustomerId,
    clientPurchaseOrderNumber: sourceEnquiry?.clientPurchaseOrderNumber ?? null,
    jobName: firstLine(survey.notes) || firstLine(sourceEnquiry?.requestSummary) || `${survey.clientName} survey`,
    clientName: survey.clientName,
    contactName: survey.contactName || sourceEnquiry?.contactName || [linkedCustomer?.firstName, linkedCustomer?.lastName].filter(Boolean).join(" ") || null,
    email: sourceEnquiry?.email || linkedCustomer?.email || null,
    phone: survey.phone || sourceEnquiry?.phone || linkedCustomer?.phone || null,
    discountPercent: "0",
    notes: [
      sourceEnquiry?.requestSummary ? `Enquiry summary:\n${sourceEnquiry.requestSummary}` : null,
      survey.notes ? `Survey brief:\n${survey.notes}` : null,
      survey.siteAddress ? `Survey site: ${survey.siteAddress}` : null,
    ].filter(Boolean).join("\n\n") || null,
  });

  const existingLines = await listQuoteLines(quote.id);
  const existingSignKeys = new Set(existingLines.flatMap((line) => {
    const snapshot = line.configurationSnapshot && typeof line.configurationSnapshot === "object" && !Array.isArray(line.configurationSnapshot)
      ? line.configurationSnapshot as Record<string, unknown>
      : {};
    const context = snapshot.surveyContext && typeof snapshot.surveyContext === "object" && !Array.isArray(snapshot.surveyContext)
      ? snapshot.surveyContext as Record<string, unknown>
      : {};
    const signKey = String(context.signKey ?? "").trim();
    return signKey ? [signKey] : [];
  }));

  let added = 0;
  for (const sign of signs) {
    if (existingSignKeys.has(sign.key)) continue;
    const widthMm = surveyDimensionMm(sign.width);
    const heightMm = surveyDimensionMm(sign.height);
    const sizeText = widthMm != null && heightMm != null ? `${widthMm} × ${heightMm}mm` : [sign.width, sign.height].filter(Boolean).join(" × ");
    await addQuoteLine(quote.id, {
      productName: sign.title,
      optionSummary: ["Survey item — configure material / print", sizeText ? `Finished size: ${sizeText}` : null].filter(Boolean).join(" · "),
      quantity: sign.quantity || "1",
      unitPrice: "0",
      notes: surveyLineNotes(sign),
      configurationSnapshot: surveyLineSnapshot(survey.id, sign),
    });
    added += 1;
  }

  if (jobId) await attachQuoteToJobForTenant(activeTenant.tenantId, jobId, quote.id);

  const message = `${existingQuote ? "Opened existing survey quote" : "Quote created"}. ${added ? `${added} surveyed sign line${added === 1 ? "" : "s"} added.` : "All surveyed sign lines are already present."} Open a line below to configure it in the single-page editor.`;
  redirect(`/quotes?selected=${quote.id}&fromSurvey=${survey.id}&message=${encodeURIComponent(message)}#saved-lines`);
}
