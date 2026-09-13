import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { buildMaterialPriceSheetCsv, buildMaterialPriceWorkbook } from "@/server/material-price-sheet";
import { listMaterialsForTenant } from "@/server/materials";

export const dynamic = "force-dynamic";

function safeGroup(value: string | null): string {
  const group = String(value ?? "small-format").trim().toLowerCase();
  return ["small-format", "signage", "plan-printing", "poster-printing", "shared", "all"].includes(group) ? group : "small-format";
}

export async function GET(request: Request) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) return new Response("No active workspace", { status: 401 });
  if (!["owner", "manager"].includes(String(tenant.tenantRole).toLowerCase())) return new Response("Not authorised", { status: 403 });

  const url = new URL(request.url);
  const format = String(url.searchParams.get("format") ?? "xlsx").toLowerCase();
  const materials = await listMaterialsForTenant(tenant.tenantId);
  const date = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const group = safeGroup(url.searchParams.get("group"));
    const csv = buildMaterialPriceSheetCsv(materials, group);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="production-manager-${group}-prices-${date}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  }

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
