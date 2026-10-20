import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { saveQuoteLineBundleForAuthUser } from "@/server/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Tender Edge and the Production Manager workspace operate in Canberra/Sydney.
// Keep this latency-sensitive mutation close to the users and AU Supabase region.
export const preferredRegion = "syd1";

type LinkedQuoteLineInput = {
  productName: string;
  optionSummary: string | null;
  quantity: string;
  unitPrice: string;
  notes: string | null;
  configurationSnapshot: Record<string, unknown>;
};

function nullable(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function jsonObject(value: FormDataEntryValue | null): Record<string, unknown> {
  const raw = String(value ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function validUuidOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function resultPayload(base: {
  ok: boolean;
  quoteId: string;
  lineId: string | null;
  message?: string;
  error?: string | null;
}, timings: {
  startedAt: number;
  authElapsedMs: number;
  dbElapsedMs: number;
  dbSchemaElapsedMs?: number;
  dbConnectionElapsedMs?: number;
  dbQueryElapsedMs?: number;
}) {
  return {
    ok: base.ok,
    quoteId: base.quoteId,
    lineId: base.lineId,
    message: base.message ?? "",
    error: base.error ?? null,
    serverElapsedMs: Date.now() - timings.startedAt,
    authElapsedMs: timings.authElapsedMs,
    dbElapsedMs: timings.dbElapsedMs,
    dbSchemaElapsedMs: timings.dbSchemaElapsedMs ?? 0,
    dbConnectionElapsedMs: timings.dbConnectionElapsedMs ?? 0,
    dbQueryElapsedMs: timings.dbQueryElapsedMs ?? 0,
    runtimeRegion: process.env.VERCEL_REGION ?? null
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let authElapsedMs = 0;
  let dbElapsedMs = 0;
  let quoteId = "";
  let dbSchemaElapsedMs = 0;
  let dbConnectionElapsedMs = 0;
  let dbQueryElapsedMs = 0;

  try {
    const formData = await request.formData();
    quoteId = String(formData.get("quoteId") ?? "").trim();

    const authStartedAt = Date.now();
    const user = await getSessionUser();
    authElapsedMs = Date.now() - authStartedAt;
    if (!user) {
      return NextResponse.json(resultPayload(
        { ok: false, quoteId, lineId: null, error: "Your session has expired. Sign in again." },
        { startedAt, authElapsedMs, dbElapsedMs }
      ), { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const editingLineId = validUuidOrNull(formData.get("editingLineId"));
    const productId = validUuidOrNull(formData.get("productId"));
    const formProductName = String(formData.get("productName") ?? "").trim();
    const quantity = String(formData.get("quantity") ?? "1").trim();
    const unitPrice = String(formData.get("unitPrice") ?? "0").trim();
    const configurationSnapshot = jsonObject(formData.get("configurationSnapshot"));

    if (!validUuidOrNull(quoteId)) {
      return NextResponse.json(resultPayload(
        { ok: false, quoteId, lineId: editingLineId, error: "Select a quote first." },
        { startedAt, authElapsedMs, dbElapsedMs }
      ), { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    if (!(Number(quantity) > 0)) {
      return NextResponse.json(resultPayload(
        { ok: false, quoteId, lineId: editingLineId, error: "Enter a quantity greater than zero." },
        { startedAt, authElapsedMs, dbElapsedMs }
      ), { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const productName = formProductName || (productId ? "Saved product" : "Custom material quote line");

    const serviceLineProductName = String(formData.get("serviceLineProductName") ?? "").trim();
    const serviceLineUnitPrice = String(formData.get("serviceLineUnitPrice") ?? "").trim();
    const serviceLineQuantity = String(formData.get("serviceLineQuantity") ?? "1").trim() || "1";
    const serviceLineSnapshot = jsonObject(formData.get("serviceLineConfigurationSnapshot"));
    const serviceLineInput: LinkedQuoteLineInput | null = serviceLineProductName && serviceLineUnitPrice
      ? {
          productName: serviceLineProductName,
          optionSummary: nullable(formData.get("serviceLineOptionSummary")),
          quantity: serviceLineQuantity,
          unitPrice: serviceLineUnitPrice,
          notes: nullable(formData.get("serviceLineNotes")),
          configurationSnapshot: serviceLineSnapshot
        }
      : null;

    const accessEquipmentLineProductName = String(formData.get("accessEquipmentLineProductName") ?? "").trim();
    const accessEquipmentLineUnitPrice = String(formData.get("accessEquipmentLineUnitPrice") ?? "").trim();
    const accessEquipmentLineQuantity = String(formData.get("accessEquipmentLineQuantity") ?? "1").trim() || "1";
    const accessEquipmentLineSnapshot = jsonObject(formData.get("accessEquipmentLineConfigurationSnapshot"));
    const accessEquipmentLineInput: LinkedQuoteLineInput | null = accessEquipmentLineProductName && accessEquipmentLineUnitPrice
      ? {
          productName: accessEquipmentLineProductName,
          optionSummary: nullable(formData.get("accessEquipmentLineOptionSummary")),
          quantity: accessEquipmentLineQuantity,
          unitPrice: accessEquipmentLineUnitPrice,
          notes: nullable(formData.get("accessEquipmentLineNotes")),
          configurationSnapshot: accessEquipmentLineSnapshot
        }
      : null;

    const existingDispatchLineId = validUuidOrNull(configurationSnapshot.linkedDispatchLineId);
    const existingAccessEquipmentLineId = validUuidOrNull(configurationSnapshot.linkedAccessEquipmentLineId)
      || validUuidOrNull(serviceLineSnapshot.linkedAccessEquipmentLineId);

    const dbStartedAt = Date.now();
    const saved = await saveQuoteLineBundleForAuthUser(user.id, quoteId, {
      lineId: editingLineId,
      productId,
      productName,
      optionSummary: nullable(formData.get("optionSummary")),
      quantity,
      unitPrice,
      notes: nullable(formData.get("notes")),
      configurationSnapshot,
      existingDispatchLineId,
      existingAccessEquipmentLineId,
      dispatchLine: serviceLineInput,
      accessEquipmentLine: accessEquipmentLineInput
    });
    dbElapsedMs = Date.now() - dbStartedAt;
    dbSchemaElapsedMs = saved.schemaElapsedMs;
    dbConnectionElapsedMs = saved.connectionElapsedMs;
    dbQueryElapsedMs = saved.queryElapsedMs;

    const payload = resultPayload(
      {
        ok: true,
        quoteId,
        lineId: saved.mainLineId,
        message: editingLineId ? "Quote line updated" : "Quote line added"
      },
      {
        startedAt,
        authElapsedMs,
        dbElapsedMs,
        dbSchemaElapsedMs,
        dbConnectionElapsedMs,
        dbQueryElapsedMs
      }
    );

    console.info("[quote-line-save-api]", {
      quoteId,
      lineId: saved.mainLineId,
      editing: Boolean(editingLineId),
      elapsedMs: payload.serverElapsedMs,
      authElapsedMs,
      dbElapsedMs,
      dbSchemaElapsedMs,
      dbConnectionElapsedMs,
      dbQueryElapsedMs,
      runtimeRegion: payload.runtimeRegion
    });

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": [
          `auth;dur=${authElapsedMs}`,
          `db;dur=${dbElapsedMs}`,
          `db-schema;dur=${dbSchemaElapsedMs}`,
          `db-connect;dur=${dbConnectionElapsedMs}`,
          `db-query;dur=${dbQueryElapsedMs}`
        ].join(", ")
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The quote line could not be saved.";
    const payload = resultPayload(
      { ok: false, quoteId, lineId: null, error: message },
      {
        startedAt,
        authElapsedMs,
        dbElapsedMs,
        dbSchemaElapsedMs,
        dbConnectionElapsedMs,
        dbQueryElapsedMs
      }
    );
    console.error("[quote-line-save-api] failed", {
      quoteId,
      error: message,
      elapsedMs: payload.serverElapsedMs,
      authElapsedMs,
      dbElapsedMs,
      dbSchemaElapsedMs,
      dbConnectionElapsedMs,
      dbQueryElapsedMs,
      runtimeRegion: payload.runtimeRegion
    });
    return NextResponse.json(payload, {
      status: 500,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
