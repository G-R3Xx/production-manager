import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { updateMachine } from "@/server/productionResources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "syd1";

const s = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const n = (formData: FormData, key: string, fallback = "0") => {
  const raw = s(formData, key);
  if (!raw && fallback === "") return "";
  const value = Number(raw);
  return Number.isFinite(value) ? String(value) : fallback;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  let authElapsedMs = 0;
  let dbElapsedMs = 0;

  try {
    const formData = await request.formData();
    const { id } = await params;
    const tenantId = s(formData, "tenantId");
    const name = s(formData, "name");

    if (!tenantId || !id || !name) {
      return NextResponse.json(
        { ok: false, error: "Machine name is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const authStartedAt = Date.now();
    const user = await getSessionUser();
    authElapsedMs = Date.now() - authStartedAt;
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Your session has expired. Sign in again." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const machine = {
      tenantId,
      name,
      machineType: s(formData, "machineType") || "other",
      maxWidthMm: n(formData, "maxWidthMm", ""),
      speedValue: n(formData, "speedValue"),
      speedUom: s(formData, "speedUom") || "sqm_per_hour",
      hourlyCost: n(formData, "hourlyCost"),
      setupMinutes: n(formData, "setupMinutes"),
      inkCostPerSqm: n(formData, "inkCostPerSqm"),
      colourImpressionCost: n(formData, "colourImpressionCost"),
      monoImpressionCost: n(formData, "monoImpressionCost"),
      maxStackSheets: n(formData, "maxStackSheets"),
    };

    const dbStartedAt = Date.now();
    const saved = await updateMachine({ ...machine, id, authUserId: user.id });
    dbElapsedMs = Date.now() - dbStartedAt;

    if (!saved) {
      return NextResponse.json(
        {
          ok: false,
          error: "Machine could not be saved or is no longer available.",
          serverElapsedMs: Date.now() - startedAt,
          authElapsedMs,
          dbElapsedMs,
          runtimeRegion: process.env.VERCEL_REGION ?? null,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payload = {
      ok: true,
      machine: { id, ...machine },
      message: `${name} saved`,
      serverElapsedMs: Date.now() - startedAt,
      authElapsedMs,
      dbElapsedMs,
      runtimeRegion: process.env.VERCEL_REGION ?? null,
    };

    console.info("[machine-save-api]", {
      machineId: id,
      name,
      elapsedMs: payload.serverElapsedMs,
      authElapsedMs,
      dbElapsedMs,
      runtimeRegion: payload.runtimeRegion,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `auth;dur=${authElapsedMs}, db;dur=${dbElapsedMs}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Machine could not be saved.";
    console.error("[machine-save-api] failed", {
      error: message,
      elapsedMs: Date.now() - startedAt,
      authElapsedMs,
      dbElapsedMs,
      runtimeRegion: process.env.VERCEL_REGION ?? null,
    });
    return NextResponse.json(
      {
        ok: false,
        error: message,
        serverElapsedMs: Date.now() - startedAt,
        authElapsedMs,
        dbElapsedMs,
        runtimeRegion: process.env.VERCEL_REGION ?? null,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
