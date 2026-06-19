import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listMaterialsForTenant } from "@/server/materials";
import { listSuppliersForTenant } from "@/server/suppliers";
import { createMaterialAction } from "./actions";

type MaterialsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatMaterialType(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRollType(type: string): boolean {
  return type.includes("roll") || type.includes("cello") || type.includes("laminate");
}

function isSheetType(type: string): boolean {
  return type.includes("sheet") || type.includes("card") || type.includes("paper");
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

const textareaStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: 12,
  fontSize: 15,
  boxSizing: "border-box"
};

const labelStyle: CSSProperties = { display: "grid", gap: 7, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 700, fontSize: 13, color: "#344054" };
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer", padding: "0 16px" };
const pillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 10px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" };
const mutedTextStyle: CSSProperties = { color: "#667085", fontSize: 13, lineHeight: 1.45 };

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

  const activeMaterials = materials.filter((material) => material.active);
  const rollMaterials = materials.filter((material) => isRollType(material.materialType));
  const sheetMaterials = materials.filter((material) => isSheetType(material.materialType));

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
              Materials are what suppliers sell you: sheets, rolls, laminate, paper, card, cello, binding, fixings and consumables. Products consume these through component rules; stock allocation should come from this layer.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={pillStyle}>{activeMaterials.length} active</span>
            <span style={pillStyle}>{sheetMaterials.length} sheet/card/paper</span>
            <span style={pillStyle}>{rollMaterials.length} roll/cello/laminate</span>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#4f46e5", textTransform: "uppercase" }}>Materials</div>
          <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800 }}>{materials.length}</div>
          <div style={{ marginTop: 6, color: "#475467" }}>Purchased stock records</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#4f46e5", textTransform: "uppercase" }}>Suppliers</div>
          <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800 }}>{suppliers.length}</div>
          <div style={{ marginTop: 6, color: "#475467" }}>Available supplier links</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#4f46e5", textTransform: "uppercase" }}>Allocation model</div>
          <div style={{ marginTop: 12, fontSize: 17, fontWeight: 800 }}>Supplier → Material → Component → Product</div>
          <div style={{ marginTop: 8, color: "#475467" }}>Finished products should not hold stock directly.</div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.9fr) minmax(0, 1.1fr)", gap: 16, alignItems: "start" }}>
        <details open style={{ ...cardStyle, display: "grid", gap: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 22, fontWeight: 800 }}>Create material</summary>
          <form action={createMaterialAction} style={{ display: "grid", gap: 14, marginTop: 16 }}>
            <div style={gridStyle}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Material name</span>
                <input name="name" required placeholder="3mm ACM 2440 × 1220" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Supplier</span>
                <select name="supplierId" defaultValue="" style={inputStyle}>
                  <option value="">No supplier linked</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>)}
                </select>
              </label>
            </div>

            <div style={gridStyle}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Supplier SKU</span>
                <input name="sku" placeholder="ACM-3-2440" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Material type</span>
                <select name="materialType" defaultValue="sheet_media" style={inputStyle}>
                  <option value="sheet_media">Sheet media</option>
                  <option value="roll_media">Roll media</option>
                  <option value="roll_laminate">Roll laminate</option>
                  <option value="paper_stock">Paper stock</option>
                  <option value="card_stock">Card stock</option>
                  <option value="cello_stock">Celloglaze / cello</option>
                  <option value="binding">Binding material</option>
                  <option value="finishing">Finishing consumable</option>
                  <option value="fixing">Hardware / fixing</option>
                  <option value="item">Consumable / item</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>

            <div style={gridStyle}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Stock UOM</span>
                <input name="stockUom" defaultValue="sheet" placeholder="sheet, lm, sqm, each" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Purchase UOM</span>
                <input name="purchaseUom" defaultValue="sheet" placeholder="sheet, roll, box, each" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Stock qty / roll length</span>
                <input name="stockQuantity" defaultValue="0" placeholder="eg 50 if this roll is 50lm" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Purchase cost</span>
                <input name="purchaseCost" defaultValue="0" placeholder="cost per sheet, lm, sqm, each or roll" style={inputStyle} />
              </label>
            </div>

            <div style={gridStyle}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Width mm</span>
                <input name="widthMm" placeholder="Sheet width" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Length mm</span>
                <input name="lengthMm" placeholder="Sheet length" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Roll width mm</span>
                <input name="rollWidthMm" placeholder="Roll width" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>GSM / Thickness</span>
                <input name="gsm" placeholder="eg 250gsm or 3mm" style={inputStyle} />
              </label>
            </div>

            <label style={labelStyle}>
              <span style={labelTextStyle}>Notes</span>
              <textarea name="notes" rows={4} placeholder="Parent sheet size, roll length, supplier notes, nesting/yield assumptions, stock handling. For whole-roll cost, set Stock UOM to lm and Stock qty / roll length to the roll length." style={textareaStyle} />
            </label>
            <button type="submit" style={buttonStyle}>Create material</button>
          </form>
        </details>

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>Current materials</h2>
              <p style={{ margin: "6px 0 0", color: "#475467" }}>Raw inputs that product components can consume.</p>
            </div>
            <div style={{ color: "#667085", fontSize: 14 }}>{materials.length} total</div>
          </div>

          {materials.length === 0 ? (
            <div style={{ borderRadius: 16, border: "1px dashed #d0d5dd", padding: 24, color: "#475467" }}>No materials yet. Create sheet, roll, paper, card, cello and hardware materials here before attaching them to product components.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {materials.map((material) => (
                <article key={material.id} style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fafafa", display: "grid", gap: 9 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{material.name}</div>
                      <div style={{ marginTop: 4, color: "#475467", fontSize: 14 }}>{formatMaterialType(material.materialType)} · Stock {material.stockQuantity ?? "0"} {material.stockUom ?? "units"} · Cost ${material.purchaseCost ?? "0"}/{material.purchaseUom ?? "unit"}</div>
                    </div>
                    <span style={pillStyle}>{material.active ? "active" : "inactive"}</span>
                  </div>
                  <div style={mutedTextStyle}>Supplier: {material.supplierName ?? "Not linked"} · SKU: {material.sku ?? "—"}</div>
                  <div style={mutedTextStyle}>Dimensions: {material.widthMm ?? "—"}w × {material.lengthMm ?? "—"}l mm · Roll width {material.rollWidthMm ?? "—"} mm · GSM/Thickness {material.gsm ?? "—"}</div>
                  {material.sourceProductName ? <div style={{ ...mutedTextStyle, color: "#b54708" }}>Legacy source product link: {material.sourceProductName}</div> : null}
                  {material.notes ? <div style={mutedTextStyle}>{material.notes}</div> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
