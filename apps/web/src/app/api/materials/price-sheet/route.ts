import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { buildMaterialPriceWorkbook } from "@/server/material-price-sheet";
import { listMaterialsForTenant } from "@/server/materials";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return new Response("No active workspace", { status: 401 });
  if (!["owner", "manager"].includes(String(tenant.tenantRole).toLowerCase())) return new Response("Not authorised", { status: 403 });

  const materials = await listMaterialsForTenant(tenant.tenantId);
  const date = new Date().toISOString().slice(0, 10);
  const workbook = buildMaterialPriceWorkbook(materials);
  return new Response(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="production-manager-materials-${date}.xlsx"`,
      "Cache-Control": "no-store"
    }
  });
}
