import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listMaterialsForTenant } from "@/server/materials";
import { listSuppliersForTenant } from "@/server/suppliers";
import { setMaterialActiveAction } from "./actions";
import { CreateMaterialForm, EditMaterialForm } from "./MaterialForms";

type MaterialsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MaterialGroup = "signage" | "plan-printing" | "poster-printing" | "small-format" | "shared" | "all";

type MaterialSummary = Awaited<ReturnType<typeof listMaterialsForTenant>>[number];

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatMaterialType(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function minimumSheetBillingLabel(material: MaterialSummary): string {
  const explicit = String(material.minimumBillableSheetFraction ?? "").trim();
  if (explicit) {
    const amount = Number(explicit);
    if (Number.isFinite(amount) && amount <= 0) return "Exact calculated usage";
    if (Math.abs(amount - 0.25) < 0.0001) return "¼ sheet increments";
    if (Math.abs(amount - 0.5) < 0.0001) return "½ sheet increments";
    if (Math.abs(amount - 1) < 0.0001) return "Full sheet increments";
  }

  const name = String(material.name ?? "").toLowerCase();
  if (/\b(acm|aluminium|aluminum|acrylic|perspex|composite)\b/.test(name)) return "Recommended: ¼ sheet increments";
  if (/\b(pvc|corflute|coreflute)\b/.test(name)) return "Recommended: ½ sheet increments";
  return "Recommended: exact calculated usage";
}

function rollBillingLabel(material: MaterialSummary): string {
  const explicit = String(material.rollBillingIncrementMetres ?? "").trim();
  if (!explicit) return "Recommended: 0.5m increments";
  const amount = Number(explicit);
  if (Number.isFinite(amount) && amount <= 0) return "Exact calculated roll usage";
  return `${amount}m increments`;
}

function normaliseMaterialType(value: string | null | undefined): string {
  switch (value) {
    case "sheet":
      return "sheet_media";
    case "roll":
      return "roll_media";
    case "paper":
      return "paper_stock";
    case "card stock":
      return "card_stock";
    case "roll laminate":
      return "roll_laminate";
    case "hardware":
      return "fixing";
    case "consumable":
      return "item";
    default:
      return value || "other";
  }
}

function isRollType(type: string): boolean {
  return type.includes("roll") || type.includes("cello") || type.includes("laminate");
}

function isSheetType(type: string): boolean {
  return type.includes("sheet") || type.includes("card") || type.includes("paper");
}

function normaliseMaterialGroup(value: string | null | undefined): Exclude<MaterialGroup, "all"> | null {
  switch (String(value ?? "").trim().toLowerCase().replace(/_/g, "-")) {
    case "signage":
      return "signage";
    case "plan-printing":
      return "plan-printing";
    case "poster-printing":
      return "poster-printing";
    case "small-format":
      return "small-format";
    case "shared":
    case "general":
    case "installation":
      return "shared";
    default:
      return null;
  }
}

function materialGroupFor(material: MaterialSummary): Exclude<MaterialGroup, "all"> {
  const explicitGroup = normaliseMaterialGroup(material.materialGroup);
  if (explicitGroup) return explicitGroup;

  const type = normaliseMaterialType(material.materialType);

  if (type === "paper_stock" || type === "card_stock" || type === "cello_stock" || type === "binding") {
    return "small-format";
  }

  if (type === "sheet_media" || type === "roll_media" || type === "roll_laminate") {
    return "signage";
  }

  return "shared";
}

function isValidGroup(value: string): value is MaterialGroup {
  return value === "signage" || value === "plan-printing" || value === "poster-printing" || value === "small-format" || value === "shared" || value === "all";
}

function searchTextFor(material: MaterialSummary): string {
  return [
    material.name,
    material.customerFacingName,
    material.sku,
    material.supplierName,
    material.materialType,
    material.materialGroup,
    groupLabel(materialGroupFor(material)),
    formatMaterialType(material.materialType),
    material.stockUom,
    material.purchaseUom,
    material.gsm,
    material.notes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function materialMatchesSearch(material: MaterialSummary, search: string): boolean {
  if (!search) return true;
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = searchTextFor(material);
  return terms.every((term) => haystack.includes(term));
}

function groupLabel(group: MaterialGroup): string {
  switch (group) {
    case "signage":
      return "Signage";
    case "plan-printing":
      return "Plan printing";
    case "poster-printing":
      return "Poster printing";
    case "small-format":
      return "Small format";
    case "shared":
      return "Shared / consumables";
    case "all":
      return "All materials";
  }
}

function groupDescription(group: MaterialGroup): string {
  switch (group) {
    case "signage":
      return "ACM, corflute, acrylic, PVC, roll media and roll laminate.";
    case "plan-printing":
      return "Plan paper, bond rolls, CAD paper and architectural drawing stock.";
    case "poster-printing":
      return "Poster paper, photo paper, presentation stock and synthetic print media.";
    case "small-format":
      return "Paper, card, cello, binding, tape and bookmaking stock.";
    case "shared":
      return "Eyelets, fixings, hardware, blades, app tape and general consumables.";
    case "all":
      return "Every material record, including deleted/inactive housekeeping items.";
  }
}

function groupHref(group: MaterialGroup): string {
  return `/materials?group=${group}`;
}

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 22
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "0 12px",
  fontSize: 15,
  boxSizing: "border-box"
};

const buttonStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "none", background: "#2563eb", color: "#fff", fontWeight: 800, cursor: "pointer", padding: "0 16px" };
const secondaryButtonStyle: CSSProperties = { minHeight: 40, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, cursor: "pointer", padding: "0 14px" };
const dangerButtonStyle: CSSProperties = { minHeight: 40, borderRadius: 12, border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", fontWeight: 800, cursor: "pointer", padding: "0 14px" };
const pillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" };
const mutedTextStyle: CSSProperties = { color: "#667085", fontSize: 13, lineHeight: 1.45 };
const groupCardStyle: CSSProperties = { display: "grid", gap: 8, border: "1px solid #dbeafe", borderRadius: 16, padding: 14, textDecoration: "none", color: "inherit", background: "#f8fbff" };

function MaterialCard({ material, suppliers }: { material: MaterialSummary; suppliers: Awaited<ReturnType<typeof listSuppliersForTenant>> }) {
  return (
    <article style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: material.active ? "#fafafa" : "#f9fafb", display: "grid", gap: 12, opacity: material.active ? 1 : 0.78 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>{material.name}</div>
          {material.customerFacingName ? <div style={{ marginTop: 3, color: "#0f766e", fontSize: 13, fontWeight: 750 }}>Client sees: {material.customerFacingName}</div> : null}
          <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>{formatMaterialType(material.materialType)} · Stock {material.stockQuantity ?? "0"} {material.stockUom ?? "units"} · Cost ${material.purchaseCost ?? "0"}/{material.purchaseUom ?? "unit"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={pillStyle}>{groupLabel(materialGroupFor(material))}</span>
          <span style={{ ...pillStyle, background: material.active ? "#ecfdf3" : "#f2f4f7", color: material.active ? "#067647" : "#475467" }}>{material.active ? "active" : "inactive"}</span>
          <form action={setMaterialActiveAction}>
            <input type="hidden" name="materialId" value={material.id} />
            <input type="hidden" name="active" value={material.active ? "false" : "true"} />
            <button type="submit" style={material.active ? dangerButtonStyle : secondaryButtonStyle}>{material.active ? "Delete" : "Restore"}</button>
          </form>
        </div>
      </div>
      <div style={mutedTextStyle}>Supplier: {material.supplierName ?? "Not linked"} · SKU: {material.sku ?? "—"}</div>
      <div style={mutedTextStyle}>Dimensions: {material.widthMm ?? "—"}w × {material.lengthMm ?? "—"}l mm · Roll width {material.rollWidthMm ?? "—"} mm · GSM/Thickness {material.gsm ?? "—"}</div>
      {isSheetType(normaliseMaterialType(material.materialType)) ? <div style={mutedTextStyle}>Sheet billing: {minimumSheetBillingLabel(material)}</div> : null}
      {isRollType(normaliseMaterialType(material.materialType)) ? <div style={mutedTextStyle}>Roll billing: {rollBillingLabel(material)}</div> : null}
      {material.sourceProductName ? <div style={{ ...mutedTextStyle, color: "#b54708" }}>Legacy source product link: {material.sourceProductName}</div> : null}
      {material.notes ? <div style={mutedTextStyle}>{material.notes}</div> : null}

      <details style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Edit material</summary>
        <EditMaterialForm suppliers={suppliers} material={material} />
      </details>
    </article>
  );
}

export default async function MaterialsPage({ searchParams }: MaterialsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const [materials, suppliers] = await Promise.all([
    listMaterialsForTenant(activeTenant.tenantId),
    listSuppliersForTenant(activeTenant.tenantId)
  ]);

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const search = readParam(params, "q").trim();
  const groupParam = readParam(params, "group");
  const selectedGroup: MaterialGroup | "" = isValidGroup(groupParam) ? groupParam : "";

  const activeMaterials = materials.filter((material) => material.active);
  const rollMaterials = materials.filter((material) => isRollType(material.materialType));
  const sheetMaterials = materials.filter((material) => isSheetType(material.materialType));
  const groupCounts: Record<MaterialGroup, number> = {
    signage: materials.filter((material) => material.active && materialGroupFor(material) === "signage").length,
    "plan-printing": materials.filter((material) => material.active && materialGroupFor(material) === "plan-printing").length,
    "poster-printing": materials.filter((material) => material.active && materialGroupFor(material) === "poster-printing").length,
    "small-format": materials.filter((material) => material.active && materialGroupFor(material) === "small-format").length,
    shared: materials.filter((material) => material.active && materialGroupFor(material) === "shared").length,
    all: materials.length
  };

  const hasBrowseFilter = Boolean(search || selectedGroup);
  const filteredMaterials = hasBrowseFilter
    ? materials.filter((material) => {
        const matchesGroup = !selectedGroup || selectedGroup === "all" || materialGroupFor(material) === selectedGroup;
        const matchesActive = selectedGroup === "all" || material.active;
        return matchesGroup && matchesActive && materialMatchesSearch(material, search);
      })
    : [];

  return (
    <div style={{ maxWidth: 1360, margin: "0 auto", display: "grid", gap: 16, minWidth: 0 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16, fontWeight: 700 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16, fontWeight: 700 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Purchased stock</p>
            <h1 style={{ margin: "10px 0 8px", fontSize: 34 }}>Materials</h1>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 860 }}>
              Create materials on the left, then find existing stock by searching or opening a group. The full library stays hidden until you need it so this page does not turn into a giant list.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={pillStyle}>{activeMaterials.length} active</span>
            <span style={pillStyle}>{sheetMaterials.length} sheet/card/paper</span>
            <span style={pillStyle}>{rollMaterials.length} roll/cello/laminate</span>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.25fr)", gap: 16, alignItems: "start" }}>
        <details open style={{ ...cardStyle, display: "grid", gap: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 22, fontWeight: 800 }}>Create material</summary>
          <CreateMaterialForm suppliers={suppliers} />
        </details>

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>Find materials</h2>
              <p style={{ margin: "6px 0 0", color: "#475467" }}>Search first, or open a group. Materials are not listed by default.</p>
            </div>
            <div style={{ color: "#667085", fontSize: 14 }}>{materials.length} total</div>
          </div>

          <form action="/materials" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(150px, 0.4fr) auto", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Search materials</span>
              <input type="search" name="q" defaultValue={search} placeholder="Search name, SKU, supplier, thickness…" style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Group</span>
              <select name="group" defaultValue={selectedGroup} style={inputStyle}>
                <option value="">All groups</option>
                <option value="signage">Signage</option>
                <option value="plan-printing">Plan printing</option>
                <option value="poster-printing">Poster printing</option>
                <option value="small-format">Small format</option>
                <option value="shared">Shared / consumables</option>
                <option value="all">Everything</option>
              </select>
            </label>
            <button type="submit" style={buttonStyle}>Search</button>
          </form>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {(["signage", "plan-printing", "poster-printing", "small-format", "shared"] as const).map((group) => (
              <a key={group} href={groupHref(group)} style={{ ...groupCardStyle, borderColor: selectedGroup === group ? "#2563eb" : "#dbeafe", background: selectedGroup === group ? "#eff6ff" : "#f8fbff" }}>
                <span style={{ fontWeight: 900 }}>{groupLabel(group)}</span>
                <span style={mutedTextStyle}>{groupDescription(group)}</span>
                <span style={{ ...pillStyle, width: "fit-content" }}>{groupCounts[group]} materials</span>
              </a>
            ))}
          </div>

          {!hasBrowseFilter ? (
            <div style={{ borderRadius: 16, border: "1px dashed #d0d5dd", padding: 24, color: "#475467", background: "#fcfcfd" }}>
              Nothing is listed yet. Search for a material, or open a department such as <strong>Signage</strong>, <strong>Plan printing</strong>, <strong>Poster printing</strong> or <strong>Small format</strong>.
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div style={{ borderRadius: 16, border: "1px dashed #d0d5dd", padding: 24, color: "#475467", background: "#fcfcfd" }}>
              No materials matched {search ? <strong>“{search}”</strong> : "that filter"}. Try another search or switch groups.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{filteredMaterials.length} result{filteredMaterials.length === 1 ? "" : "s"}</strong>
                <a href="/materials" style={{ color: "#2563eb", fontWeight: 800 }}>Clear search</a>
              </div>
              {filteredMaterials.map((material) => (
                <MaterialCard key={material.id} material={material} suppliers={suppliers} />
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
