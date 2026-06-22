import { NextResponse } from "next/server";
import { updateSurveyFromInstallSchedulerCompletion } from "@/server/surveys";

export const runtime = "nodejs";

type UnknownRecord = Record<string, unknown>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function authOk(request: Request): boolean {
  const expected = process.env.INSTALL_SCHEDULER_BRIDGE_KEY?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === expected;
}

function photoCount(signs: unknown): number {
  if (!Array.isArray(signs)) return 0;
  return signs.reduce((sum, sign) => {
    const photos = (sign as UnknownRecord)?.photos;
    return sum + (Array.isArray(photos) ? photos.length : 0);
  }, 0);
}

function buildSurveyDetails(payload: UnknownRecord): string {
  const surveyNotes = cleanText(payload.surveyNotes);
  const siteAccessNotes = cleanText(payload.siteAccessNotes);
  const completedBy = cleanText(payload.completedByName) || cleanText(payload.completedByEmail);
  const completedAt = cleanText(payload.completedAtText);
  const signs = Array.isArray(payload.signs) ? payload.signs as UnknownRecord[] : [];

  const lines: string[] = [];
  lines.push("Install Scheduler site survey completed.");
  if (completedBy) lines.push(`Completed by: ${completedBy}`);
  if (completedAt) lines.push(`Completed at: ${completedAt}`);
  if (surveyNotes) lines.push("", "Survey notes:", surveyNotes);
  if (siteAccessNotes) lines.push("", "Site access notes:", siteAccessNotes);

  if (signs.length) {
    lines.push("", "Surveyed signs / locations:");
    signs.forEach((sign, index) => {
      const photos = Array.isArray(sign.photos) ? sign.photos : [];
      lines.push(``, `${index + 1}. ${cleanText(sign.title) || cleanText(sign.location) || `Sign / location ${index + 1}`}`);
      const measurement = [
        cleanText(sign.width) ? `W ${cleanText(sign.width)}` : "",
        cleanText(sign.height) ? `H ${cleanText(sign.height)}` : "",
        cleanText(sign.depth) ? `D ${cleanText(sign.depth)}` : "",
      ].filter(Boolean).join(" × ");
      if (cleanText(sign.location)) lines.push(`Location: ${cleanText(sign.location)}`);
      if (measurement) lines.push(`Measurements: ${measurement}`);
      if (cleanText(sign.quantity)) lines.push(`Quantity: ${cleanText(sign.quantity)}`);
      if (cleanText(sign.description)) lines.push(`Description: ${cleanText(sign.description)}`);
      if (cleanText(sign.condition)) lines.push(`Condition: ${cleanText(sign.condition)}`);
      if (cleanText(sign.requiredWork)) lines.push(`Required work: ${cleanText(sign.requiredWork)}`);
      if (cleanText(sign.fixingMethod)) lines.push(`Fixing / substrate: ${cleanText(sign.fixingMethod)}`);
      if (cleanText(sign.accessNotes)) lines.push(`Access notes: ${cleanText(sign.accessNotes)}`);
      if (cleanText(sign.powerRequired)) lines.push(`Power: ${cleanText(sign.powerRequired)}`);
      if (cleanText(sign.notes)) lines.push(`Notes: ${cleanText(sign.notes)}`);
      lines.push(`Photos: ${photos.length}`);
    });
  }

  const totalPhotos = photoCount(payload.signs);
  lines.push("", `Total signs / locations: ${signs.length}`);
  lines.push(`Total photos: ${totalPhotos}`);

  return lines.join("\n").trim();
}

export async function POST(request: Request) {
  if (!authOk(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: UnknownRecord;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = cleanText(payload.tenantId);
  const surveyRequestId = cleanText(payload.productionManagerSurveyRequestId);

  if (!tenantId || !surveyRequestId) {
    return NextResponse.json({ ok: false, error: "tenantId and productionManagerSurveyRequestId are required" }, { status: 400 });
  }

  const surveyDetails = buildSurveyDetails(payload);

  await updateSurveyFromInstallSchedulerCompletion(tenantId, surveyRequestId, {
    installSchedulerJobId: cleanText(payload.installSchedulerJobId) || null,
    installSchedulerJobUrl: cleanText(payload.installSchedulerJobUrl) || null,
    installSchedulerSurveyId: cleanText(payload.installSchedulerSurveyId) || null,
    status: "completed",
    surveyDetails,
    payload,
  });

  return NextResponse.json({ ok: true });
}
