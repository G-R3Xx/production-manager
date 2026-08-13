import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getPurchaseOrderPdfById, getPurchaseOrder } from "@/server/purchasing";
import { buildPurchaseOrderDocumentForTenant } from "@/server/purchase-order-email";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const active = await resolveActiveTenantForAuthUserId(user.id);
  if (!active) return NextResponse.json({ error: "Tenant not found." }, { status: 401 });
  const { id } = await context.params;
  const order = await getPurchaseOrder(active.tenantId, id);
  if (!order) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });

  const documentId = new URL(request.url).searchParams.get("documentId")?.trim();
  if (documentId) {
    const archived = await getPurchaseOrderPdfById(active.tenantId, id, documentId);
    if (!archived) return NextResponse.json({ error: "Archived purchase-order PDF not found." }, { status: 404 });
    return new Response(new Uint8Array(archived.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${archived.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  }

  const current = await buildPurchaseOrderDocumentForTenant(active.tenantId, id);
  // Next.js' DOM typings require a BodyInit backed by ArrayBuffer rather than
  // Uint8Array<ArrayBufferLike>. Copy the PDF bytes into a fresh Uint8Array
  // so the response body is typed as Uint8Array<ArrayBuffer>.
  return new Response(new Uint8Array(current.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${current.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
