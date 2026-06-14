import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";
import {
  addProductComponentAction,
  addProductOptionAction,
  applyQuoteBehaviourPresetAction,
  createProductAction,
  deleteProductComponentAction,
  deleteProductOptionAction,
  moveProductOptionAction,
  updateProductAction,
  updateProductComponentAction,
  updateProductOptionAction
} from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type Choice = {
  label?: string | null;
  value?: string | null;
  priceDelta?: string | null;
  price?: string | null;
};

type StarterType = {
  value: string;
  label: string;
  plainName: string;
  description: string;
  defaultUsage: string;
};

const starterTypes: StarterType[] = [
  { value: "sign_acm", label: "ACM sign", plainName: "Sign - ACM - 3mm", description: "Rigid sign with size, print type, laminate, finishing and quantity.", defaultUsage: "part_sheet" },
  { value: "sign_corflute", label: "Corflute sign", plainName: "Sign - Corflute - 5mm", description: "Rigid corflute sign with simple signage quote choices.", defaultUsage: "part_sheet" },
  { value: "sign_acrylic", label: "Acrylic / PVC sign", plainName: "Sign - Acrylic - 4.5mm", description: "Sheet product where the quoted size uses sheet stock.", defaultUsage: "part_sheet" },
  { value: "banner", label: "Banner", plainName: "Banner", description: "Roll stock banner with size and finishing choices.", defaultUsage: "roll_metres" },
  { value: "roll_print", label: "Roll print / sticker", plainName: "Roll Print", description: "Roll media print with media, laminate and quantity choices.", defaultUsage: "roll_metres" },
  { value: "business_cards", label: "Business cards", plainName: "Business Cards", description: "Small format card product with sides, cello and quantity.", defaultUsage: "paper_yield" },
  { value: "flyers", label: "Brochures / flyers", plainName: "Flyers / Brochures", description: "Small format print with size, sides, folds, cello and quantity.", defaultUsage: "paper_yield" },
  { value: "books", label: "Books / pads", plainName: "Books / Pads", description: "Pads or books with pages, covers, binding and quantity.", defaultUsage: "paper_yield" },
  { value: "carbon_books", label: "Duplicate / triplicate books", plainName: "Carbon Books", description: "Carbonless books with copies, paper colours, tape, numbering and quantity.", defaultUsage: "paper_yield" }
];

const usageModes = [
  { value: "part_sheet", label: "Uses part of a sheet", help: "Best for ACM, Corflute, Acrylic and PVC signs. Uses finished size / parent sheet size × sheet cost." },
  { value: "whole_sheet", label: "Uses full sheets", help: "Use when each quoted item consumes a whole purchased sheet." },
  { value: "roll_metres", label: "Uses roll length", help: "Best for banners, vinyl, laminate and roll media. Uses finished size / roll width × roll material cost." },
  { value: "area", label: "Uses square metres", help: "Best for ink, print coverage or area-based consumables." },
  { value: "paper_yield", label: "Uses paper/card yield", help: "Best for small format sheet yield." },
  { value: "each", label: "Each / fixed item", help: "Best for labour, hardware or finishing steps." }
];

const optionTypes = [
  { value: "select", label: "Dropdown choices" },
  { value: "size_select", label: "Size choices" },
  { value: "yes_no", label: "Yes / No" },
  { value: "quantity", label: "Quantity" },
  { value: "number", label: "Number" },
  { value: "text", label: "Text box" },
  { value: "color", label: "Colour choices" }
];

const productFamilies = [
  { value: "rigid_signage", label: "Rigid signage" },
  { value: "roll_media", label: "Roll media" },
  { value: "banners", label: "Banners" },
  { value: "stickers_labels", label: "Stickers & labels" },
  { value: "small_format_print", label: "Small format print" },
  { value: "display_products", label: "Display products" }
];

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function matchesQuery(value: string | null | undefined, query: string): boolean {
  return String(value ?? "").toLowerCase().includes(query.toLowerCase());
}

function humanize(value: string | null | undefined): string {
  if (!value) return "Not set";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2");
}

function selectedProductUrl(productId: string, query: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  return `/products?selected=${productId}${q}`;
}

function editProductUrl(productId: string, query: string, kind: "component" | "option", id: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  const param = kind === "component" ? "editComponent" : "editOption";
  return `/products?selected=${productId}${q}&${param}=${id}`;
}

function baseUsageFromComponent(component: any): string {
  const ruleType = String(component?.ruleType ?? component?.stockUsage?.usageBasis ?? "yield_based");
  const role = String(component?.role ?? "");
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_sqm") return "area";
  if (ruleType === "per_unit" && String(component?.unit ?? "") === "sheet") return "whole_sheet";
  if (ruleType === "per_unit") return "each";
  if (ruleType === "yield_based" && role !== "base_material") return "paper_yield";
  return "part_sheet";
}

function defaultAnswerFromField(field: any): string {
  const defaultValue = String(field?.defaultValue ?? "");
  if (!defaultValue) return "";
  const matched = Array.isArray(field?.options)
    ? field.options.find((option: Choice) => String(option?.value ?? "") === defaultValue)
    : null;
  return String(matched?.label ?? defaultValue).replace(/_/g, " ");
}

function optionPrice(option: Choice | null | undefined): string {
  const raw = String(option?.priceDelta ?? option?.price ?? "0").replace(/,/g, "").replace(/\$/g, "").trim();
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function formatPrice(value: string | number | null | undefined): string {
  const amount = Number(String(value ?? "0").replace(/,/g, "").replace(/\$/g, ""));
  if (!Number.isFinite(amount) || amount === 0) return "$0";
  return `$${amount.toFixed(2)}`;
}

function choiceTextForSetup(option: Choice): string {
  const label = String(option?.label ?? option?.value ?? "").trim();
  const value = String(option?.value ?? label).trim();
  return !label || label === value ? value : `${label}=${value}`;
}

function defaultPriceFromField(field: any): string {
  const defaultValue = String(field?.defaultValue ?? "");
  if (!Array.isArray(field?.options) || !defaultValue) return "0.00";
  const matched = field.options.find((option: Choice) => String(option?.value ?? option?.label ?? "") === defaultValue);
  return optionPrice(matched);
}

function otherChoicesCsvFromField(field: any): string {
  if (!Array.isArray(field?.options) || field.options.length === 0) return "";
  const defaultValue = String(field?.defaultValue ?? "");
  return field.options
    .filter((option: Choice) => String(option?.value ?? "") !== defaultValue)
    .map(choiceTextForSetup)
    .join("\n");
}

function showWhenOptionKeyFromField(field: any): string {
  return String(field?.showWhen?.optionKey ?? "");
}

function showWhenValuesCsvFromField(field: any): string {
  return Array.isArray(field?.showWhen?.optionValues) ? field.showWhen.optionValues.join(", ") : "";
}

function optionChoicesSummary(field: any): string {
  if (!["select", "size_select", "color"].includes(String(field?.type ?? ""))) return defaultAnswerFromField(field) || "Typed by staff";
  if (!Array.isArray(field?.options) || field.options.length === 0) return "No choices yet";
  return field.options
    .map((option: Choice) => String(option.label ?? option.value ?? ""))
    .filter(Boolean)
    .join(", ");
}

function materialCostingSummary(field: any): string {
  if (["quantity", "number", "text"].includes(String(field?.type ?? ""))) return "This answer helps quantity/notes only";
  return "Cost can be set directly on each answer line";
}

function conditionSummary(component: any, fields: any[]): string {
  const optionKey = String(component?.trigger?.optionKey ?? component?.stockUsage?.optionKey ?? "");
  const values = Array.isArray(component?.trigger?.optionValues)
    ? component.trigger.optionValues
    : Array.isArray(component?.stockUsage?.optionValues)
      ? component.stockUsage.optionValues
      : [];

  if (!optionKey || ["finished_size", "quantity"].includes(optionKey)) return "Always used";

  const field = fields.find((item) => String(item?.key ?? "") === optionKey);
  const fieldLabel = field?.label ?? optionKey;
  return values.length > 0 ? `Only when ${fieldLabel} is ${values.join(", ")}` : `Only when ${fieldLabel} is selected`;
}

function materialDetails(material: any): string {
  const pieces = [humanize(material.materialType), material.sku ? `SKU ${material.sku}` : null];
  if (material.purchaseCost) pieces.push(`Cost $${material.purchaseCost}/${material.purchaseUom ?? "unit"}`);
  if (material.widthMm || material.lengthMm) pieces.push(`${material.widthMm ?? "?"} × ${material.lengthMm ?? "?"} mm`);
  if (material.rollWidthMm) pieces.push(`${material.rollWidthMm} mm roll`);
  return pieces.filter(Boolean).join(" · ");
}

function cleanUsageNumber(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || text === "0" || text === "0.00") return "";
  return text;
}

function usageAmountSummary(component: any): string {
  const stockUsage = component?.stockUsage ?? {};
  const ruleType = String(component?.ruleType ?? stockUsage?.usageBasis ?? "yield_based");
  const allowance = cleanUsageNumber(component?.quantity) || "1";
  const waste = cleanUsageNumber(component?.wastePercent) || "0";
  const sheetsPerUnit = cleanUsageNumber(stockUsage?.sheetsPerUnit);
  const partsPerSheet = cleanUsageNumber(stockUsage?.partsPerSheet);
  const metresPerUnit = cleanUsageNumber(stockUsage?.metresPerUnit);
  const widthMm = cleanUsageNumber(stockUsage?.widthMm);
  const heightMm = cleanUsageNumber(stockUsage?.heightMm);
  const rollWidthMm = cleanUsageNumber(stockUsage?.rollWidthMm);

  let amount = "Auto from quote size";
  if (sheetsPerUnit) amount = `${sheetsPerUnit} sheet${sheetsPerUnit === "1" ? "" : "s"} per quoted item`;
  else if (partsPerSheet) amount = `1 parent sheet makes ${partsPerSheet} item${partsPerSheet === "1" ? "" : "s"}`;
  else if (metresPerUnit) amount = `${metresPerUnit} lm per quoted item`;
  else if (widthMm && heightMm) amount = `override size ${widthMm} × ${heightMm} mm`;
  else if (ruleType === "per_linear_metre") amount = "Auto from quote size ÷ roll width";
  else if (ruleType === "per_sqm") amount = "Auto from quote square metres";
  else if (ruleType === "per_unit") amount = `${allowance} ${component?.unit ?? "each"} per quoted item`;

  const rollText = rollWidthMm ? ` · roll width override ${rollWidthMm} mm` : "";
  return `Calculation: ${amount}${rollText} · multiplier ${allowance} · waste ${waste}%`;
}

function UsageAmountFields({ component }: { component?: any }) {
  const stockUsage = component?.stockUsage ?? {};
  return (
    <div style={{ ...softCardStyle, background: "#fff" }}>
      <div>
        <strong>Usage amount per quoted item</strong>
        <p style={{ ...mutedStyle, marginTop: 4 }}>Leave these blank to auto-calculate from the quote size and the linked material sheet/roll dimensions. Fill them in when an option has a fixed usage.</p>
      </div>
      <div style={grid3}>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Sheets per item</span>
          <input name="sheetsPerUnit" defaultValue={String(stockUsage?.sheetsPerUnit ?? "")} placeholder="eg 1, 0.5, 0.25" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Or items per sheet</span>
          <input name="partsPerSheet" defaultValue={String(stockUsage?.partsPerSheet ?? "")} placeholder="eg 8" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Roll metres per item</span>
          <input name="metresPerUnit" defaultValue={String(stockUsage?.metresPerUnit ?? "")} placeholder="eg 1.2" style={inputStyle} />
        </label>
      </div>
      <div style={grid3}>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Override width mm</span>
          <input name="componentWidthMm" defaultValue={String(stockUsage?.widthMm ?? "")} placeholder="optional" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Override height mm</span>
          <input name="componentHeightMm" defaultValue={String(stockUsage?.heightMm ?? "")} placeholder="optional" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Override roll width mm</span>
          <input name="componentRollWidthMm" defaultValue={String(stockUsage?.rollWidthMm ?? "")} placeholder="optional" style={inputStyle} />
        </label>
      </div>
      <p style={mutedStyle}>Examples: ACM sign auto-calculates from size and parent sheet. A fixed full sheet uses <b>Sheets per item = 1</b>. A roll option can use <b>Roll metres per item = 1.2</b>. If one sheet yields 8 pieces, enter <b>Items per sheet = 8</b>.</p>
    </div>
  );
}

const optionUsageModes = [
  { value: "none", label: "No extra cost", amountHelp: "leave blank", summary: "This answer is just a choice on the quote. It does not add stock or a charge." },
  { value: "auto_sheet", label: "Material: auto from size", amountHelp: "leave blank", summary: "Safest normal choice. Sheet materials use the quoted size. Roll materials use roll length from the quoted size." },
  { value: "parts_per_sheet", label: "Material: parts per sheet", amountHelp: "eg 8", summary: "Use this when one parent sheet makes a known number of this answer." },
  { value: "sheets_per_item", label: "Material: sheets per item", amountHelp: "eg 0.25 or 1", summary: "Use this when this answer always uses a fixed sheet amount." },
  { value: "roll_metres", label: "Material: metres per item", amountHelp: "eg 1.2", summary: "Use this when this answer always uses a fixed roll length." },
  { value: "sqm_charge", label: "Charge: dollars per m²", amountHelp: "eg 10", summary: "Use this for ink, white ink or print charges. The number is the sell charge per square metre." },
  { value: "fixed_charge", label: "Charge: dollars each", amountHelp: "eg 15", summary: "Use this for a fixed add-on charge per quoted item." }
];

function optionKeyValue(option: any): string {
  return String(option?.value ?? option?.label ?? "").trim();
}

function linkedOptionComponent(field: any, option: any, components: any[]): any | null {
  const fieldKey = String(field?.key ?? "");
  const optionValue = optionKeyValue(option);
  if (!fieldKey || !optionValue) return null;

  return components.find((component: any) => {
    if (String(component?.kind ?? "material") === "labour") return false;
    const triggerKey = String(component?.trigger?.optionKey ?? component?.stockUsage?.optionKey ?? "");
    const values = Array.isArray(component?.trigger?.optionValues)
      ? component.trigger.optionValues
      : Array.isArray(component?.stockUsage?.optionValues)
        ? component.stockUsage.optionValues
        : [];
    return triggerKey === fieldKey && values.includes(optionValue);
  }) ?? null;
}

function optionUsageModeFromComponent(component: any): string {
  const stockUsage = component?.stockUsage ?? {};
  const ruleType = String(component?.ruleType ?? stockUsage?.usageBasis ?? "yield_based");
  if (ruleType === "sell_sqm") return "sqm_charge";
  if (ruleType === "sell_each") return "fixed_charge";
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_sqm") return "sqm_charge";
  if (ruleType === "per_unit" && String(component?.unit ?? "") === "sheet") return "sheets_per_item";
  if (ruleType === "per_unit") return component?.materialId ? "fixed_charge" : "fixed_charge";
  if (cleanUsageNumber(stockUsage?.partsPerSheet)) return "parts_per_sheet";
  if (cleanUsageNumber(stockUsage?.sheetsPerUnit)) return "sheets_per_item";
  if (!component?.materialId && !cleanUsageNumber(stockUsage?.sellRate)) return "none";
  return "auto_sheet";
}

function optionUsageAmountFromComponent(component: any): string {
  const stockUsage = component?.stockUsage ?? {};
  const mode = optionUsageModeFromComponent(component);
  if (mode === "parts_per_sheet") return cleanUsageNumber(stockUsage?.partsPerSheet);
  if (mode === "sheets_per_item") return cleanUsageNumber(stockUsage?.sheetsPerUnit) || "1";
  if (mode === "roll_metres") return cleanUsageNumber(stockUsage?.metresPerUnit);
  return "";
}

function optionCostingSummaryForField(field: any, components: any[]): string {
  if (!["select", "size_select", "color"].includes(String(field?.type ?? ""))) return "No answer rows needed";
  const choices = Array.isArray(field?.options) ? field.options : [];
  const costed = choices.filter((choice: any) => {
    const linked = linkedOptionComponent(field, choice, components);
    const ruleType = String(linked?.ruleType ?? linked?.stockUsage?.usageBasis ?? "");
    return Boolean(linked?.materialId) || ["sell_sqm", "sell_each"].includes(ruleType);
  }).length;
  return `${costed}/${choices.length} answer${choices.length === 1 ? "" : "s"} linked to pricing`;
}

function optionChargeNameFromComponent(component: any): string {
  return String(component?.stockUsage?.chargeName ?? component?.label ?? "");
}

function optionRateFromComponent(component: any): string {
  const mode = optionUsageModeFromComponent(component);
  if (mode === "sqm_charge" || mode === "fixed_charge") return cleanUsageNumber(component?.stockUsage?.sellRate ?? component?.quantity) || "";
  return "";
}

function CostedOptionRows({ materials, field, components = [] }: { materials: any[]; field?: any; components?: any[] }) {
  const options = Array.isArray(field?.options) ? field.options : [];
  const existingRows = options.map((choice: any) => ({ choice, component: linkedOptionComponent(field, choice, components) }));
  const blankCount = field ? Math.max(2, 6 - existingRows.length) : 6;
  const rows = [
    ...existingRows,
    ...Array.from({ length: blankCount }, (_, index) => ({ choice: null, component: null, blankId: `blank-${index}` }))
  ];

  return (
    <div style={{ ...softCardStyle, background: "#fff" }}>
      <div>
        <strong>Answer lines</strong>
        <p style={{ ...mutedStyle, marginTop: 4 }}>
          Add the answers staff will pick on the quote. Each line can also add stock usage or a simple charge. Leave cost fields blank for choice-only answers.
        </p>
      </div>
      <div style={{ ...softCardStyle, background: "#eef2ff", borderColor: "#c7d2fe" }}>
        <strong>Simple examples</strong>
        <p style={mutedStyle}>
          Size 600 × 900: choose ACM + Material: parts per sheet + number 8. Ink: choose Charge: dollars per m² + number 10. White ink: choose Charge: dollars per m² + number 10.
        </p>
      </div>
      {materials.length === 0 ? (
        <div style={{ ...softCardStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
          <strong>No active materials available</strong>
          <p style={mutedStyle}>You can still create the answers now. Link materials later after adding them on the Materials page.</p>
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row: any, index: number) => {
          const component = row.component;
          const choice = row.choice;
          const usageMode = component ? optionUsageModeFromComponent(component) : "none";
          const usageHelp = optionUsageModes.find((mode) => mode.value === usageMode)?.amountHelp ?? "optional";
          const isCharge = usageMode === "sqm_charge" || usageMode === "fixed_charge";
          return (
            <div key={choice?.id ?? row.blankId ?? index} style={{ ...softCardStyle, background: "#fcfcfd" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong>Answer {index + 1}</strong>
                <span style={component?.materialId || isCharge ? greenChipStyle : plainChipStyle}>{component?.materialId ? "Material cost" : isCharge ? "Charge" : "Choice only"}</span>
              </div>
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Answer shown on quote</span>
                  <input name="optionAnswerLabel" defaultValue={String(choice?.label ?? "")} placeholder="eg 600 x 900 mm, SAV 7YR, Matte, Yes" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>What does this answer add?</span>
                  <select name="optionUsageMode" defaultValue={usageMode} style={inputStyle}>
                    {optionUsageModes.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Material used, if any</span>
                  <select name="optionMaterialId" defaultValue={String(component?.materialId ?? "")} style={inputStyle}>
                    <option value="">No stock material</option>
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Charge name, if any</span>
                  <input name="optionChargeName" defaultValue={isCharge ? optionChargeNameFromComponent(component) : ""} placeholder="eg CMYK ink, White ink" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Number</span>
                  <input name="optionUsageAmount" defaultValue={isCharge ? optionRateFromComponent(component) : optionUsageAmountFromComponent(component)} placeholder={usageHelp} style={inputStyle} />
                </label>
              </div>
              <div style={grid2}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Waste % for materials</span>
                  <input name="optionWastePercent" defaultValue={String(component?.wastePercent ?? "10")} placeholder="eg 10" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Note</span>
                  <input name="optionNotes" defaultValue={String(component?.notes ?? "")} placeholder="optional" style={inputStyle} />
                </label>
              </div>
              <p style={mutedStyle}>{optionUsageModes.find((mode) => mode.value === usageMode)?.summary ?? "Choose what this answer adds to the quote price."}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function starterDescription(value: string): string {
  return starterTypes.find((starter) => starter.value === value)?.description ?? "Starter rows can be edited or removed after creation.";
}

const pageStyle: CSSProperties = { maxWidth: 1240, margin: "0 auto", display: "grid", gap: 16, paddingBottom: 32 };
const cardStyle: CSSProperties = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 20, boxShadow: "0 1px 2px rgba(16,24,40,0.05)" };
const softCardStyle: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 18, padding: 16, background: "#fcfcfd", display: "grid", gap: 10 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 12px", fontSize: 14, boxSizing: "border-box", background: "#fff" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 86, padding: 12 };
const labelStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 800, fontSize: 13, color: "#344054" };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 };
const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, padding: "0 16px", cursor: "pointer" };
const ghostStyle: CSSProperties = { minHeight: 40, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 800, padding: "0 14px", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const dangerGhostStyle: CSSProperties = { ...ghostStyle, color: "#b42318", borderColor: "#fda29b" };
const chipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "6px 10px", fontSize: 12, fontWeight: 900, width: "fit-content" };
const plainChipStyle: CSSProperties = { ...chipStyle, background: "#f2f4f7", color: "#344054" };
const greenChipStyle: CSSProperties = { ...chipStyle, background: "#ecfdf3", color: "#067647" };
const yellowChipStyle: CSSProperties = { ...chipStyle, background: "#fffaeb", color: "#b54708" };
const sectionHeadingStyle: CSSProperties = { margin: 0, fontSize: 24 };
const mutedStyle: CSSProperties = { margin: 0, color: "#667085", lineHeight: 1.5 };
const tinyLabelStyle: CSSProperties = { margin: 0, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "#4f46e5" };

function MessageBanner({ tone, children }: { tone: "success" | "error"; children: string }) {
  const success = tone === "success";
  return (
    <section
      style={{
        border: `1px solid ${success ? "#abefc6" : "#fda29b"}`,
        background: success ? "#ecfdf3" : "#fff5f4",
        color: success ? "#067647" : "#b42318",
        borderRadius: 16,
        padding: 14,
        fontWeight: 800
      }}
    >
      {children}
    </section>
  );
}

function SetupMap({ selectedProduct, componentsCount, fieldsCount }: { selectedProduct: any; componentsCount: number; fieldsCount: number }) {
  const items = [
    { title: "1. Name it", body: selectedProduct ? selectedProduct.name : "Create or open a product", ready: Boolean(selectedProduct) },
    { title: "2. Add quote choices", body: fieldsCount ? `${fieldsCount} quote question${fieldsCount === 1 ? "" : "s"}` : "Add size, print, laminate, ink, finishing, qty", ready: fieldsCount > 0 },
    { title: "3. Advanced rows", body: componentsCount ? `${componentsCount} pricing/stock row${componentsCount === 1 ? "" : "s"}` : "Usually created automatically from answer lines", ready: componentsCount > 0 }
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
      {items.map((item) => (
        <div key={item.title} style={{ ...softCardStyle, background: item.ready ? "#f6fef9" : "#fffcf5", borderColor: item.ready ? "#abefc6" : "#fedf89" }}>
          <span style={item.ready ? greenChipStyle : yellowChipStyle}>{item.ready ? "Done" : "Next"}</span>
          <strong>{item.title}</strong>
          <p style={mutedStyle}>{item.body}</p>
        </div>
      ))}
    </div>
  );
}

function SimpleExplanation() {
  return (
    <section style={{ ...cardStyle, display: "grid", gap: 12, background: "#f8fafc" }}>
      <div>
        <p style={tinyLabelStyle}>Plain English</p>
        <h2 style={sectionHeadingStyle}>Think of it like this</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <div style={softCardStyle}>
          <strong>Product</strong>
          <p style={mutedStyle}>The thing you sell. Example: <b>Sign - ACM - 3mm</b>.</p>
        </div>
        <div style={softCardStyle}>
          <strong>Quote choices</strong>
          <p style={mutedStyle}>The answers staff pick later. Example: size, print type, ink, laminate and finishing. Each answer line can add its own stock usage or charge.</p>
        </div>
        <div style={softCardStyle}>
          <strong>Advanced rows</strong>
          <p style={mutedStyle}>Extra always-used stock or labour. Most products do not need this because answer lines create the pricing rows automatically.</p>
        </div>
      </div>
    </section>
  );
}

function PresetForm(props: { productId: string; activeMaterials: any[] }) {
  return (
    <details style={{ ...softCardStyle, background: "#f8fafc" }}>
      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Need a shortcut? Add editable starter rows</summary>
      <form action={applyQuoteBehaviourPresetAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="hidden" name="productId" value={props.productId} />
        <p style={mutedStyle}>This adds a starting set of quote questions/components. Nothing is locked; remove anything you do not want.</p>
        <div style={grid3}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Starter type</span>
            <select name="starterType" defaultValue="sign_acm" style={inputStyle}>
              {starterTypes.map((starter) => (
                <option key={starter.value} value={starter.value}>{starter.label}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Main stock/material</span>
            <select name="baseMaterialId" defaultValue="" style={inputStyle}>
              <option value="">Skip stock for now</option>
              {props.activeMaterials.map((material) => (
                <option key={material.id} value={material.id}>{material.name}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>How stock is used</span>
            <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
              {usageModes.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" style={ghostStyle}>Add starter rows</button>
      </form>
    </details>
  );
}

function AdvancedSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details style={{ ...softCardStyle, background: "#fff" }}>
      <summary style={{ cursor: "pointer", fontWeight: 900 }}>{title}</summary>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>{children}</div>
    </details>
  );
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedId = readParam(params, "selected");
  const query = readParam(params, "q");
  const editComponentId = readParam(params, "editComponent");
  const editOptionId = readParam(params, "editOption");

  const [products, materials, selectedProduct] = await Promise.all([
    listProductsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    selectedId ? getProductById(activeTenant.tenantId, selectedId) : Promise.resolve(null)
  ]);

  const filteredProducts = query
    ? products.filter((product) => matchesQuery(product.name, query) || matchesQuery(product.sku, query) || matchesQuery(product.productFamily, query))
    : products;

  const editorTemplate = selectedProduct?.defaultTemplateId
    ? await getConfiguratorTemplateById(activeTenant.tenantId, selectedProduct.defaultTemplateId)
    : null;

  const definition = (editorTemplate?.definitionJson ?? {}) as Record<string, any>;
  const fields = Array.isArray(definition.fields) ? definition.fields : [];
  const components = Array.isArray(definition.components) ? definition.components : [];
  const activeMaterials = materials.filter((material) => material.active);
  const selectedStarterType = String(definition.setupPreset ?? "sign_acm");

  return (
    <div style={pageStyle}>
      {message ? <MessageBanner tone="success">{message}</MessageBanner> : null}
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p style={tinyLabelStyle}>Guided product setup</p>
            <h1 style={{ margin: "8px 0 6px", fontSize: 34 }}>Products</h1>
            <p style={{ ...mutedStyle, maxWidth: 820 }}>
              One page. Three jobs only: name the product, tell the system what it uses, then choose what staff will answer when quoting.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={plainChipStyle}>{products.length} products</span>
            <span style={plainChipStyle}>{activeMaterials.length} active materials</span>
            <span style={greenChipStyle}>GST hidden by default</span>
          </div>
        </div>

        <SetupMap selectedProduct={selectedProduct} componentsCount={components.length} fieldsCount={fields.length} />
      </section>

      <SimpleExplanation />

      <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.85fr) minmax(320px, 1.15fr)", gap: 16, alignItems: "start" }}>
        <form action={createProductAction} style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div>
            <h2 style={sectionHeadingStyle}>Create a product</h2>
            <p style={{ ...mutedStyle, marginTop: 6 }}>Start with the sellable item. You can clean up the rows after it opens.</p>
          </div>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Product name</span>
            <input name="name" required placeholder="eg Sign - ACM - 3mm" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>Start from</span>
            <select name="starterType" defaultValue="sign_acm" style={inputStyle}>
              {starterTypes.map((starter) => (
                <option key={starter.value} value={starter.value}>{starter.label}</option>
              ))}
            </select>
          </label>
          <p style={{ ...mutedStyle, marginTop: -6 }}>{starterDescription("sign_acm")}</p>

          <AdvancedSection title="Optional stock and code">
            <div style={grid2}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>SKU / code</span>
                <input name="sku" placeholder="eg SIGN-ACM-3MM" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Main stock/material</span>
                <select name="baseMaterialId" defaultValue="" style={inputStyle}>
                  <option value="">Choose later</option>
                  {activeMaterials.map((material) => (
                    <option key={material.id} value={material.id}>{material.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label style={labelStyle}>
              <span style={labelTextStyle}>How the main stock is used</span>
              <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
                {usageModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </label>
          </AdvancedSection>

          <button type="submit" style={buttonStyle}>Create and open</button>
        </form>

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div>
            <h2 style={sectionHeadingStyle}>Open a product</h2>
            <p style={{ ...mutedStyle, marginTop: 6 }}>Pick a product, then use the setup sections below.</p>
          </div>

          <form method="get" style={{ display: "grid", gap: 10 }}>
            <input name="q" defaultValue={query} placeholder="Search product name, SKU or type" style={inputStyle} />
            <button type="submit" style={ghostStyle}>Search</button>
          </form>

          {selectedProduct ? (
            <div style={{ ...softCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <strong>{selectedProduct.name}</strong>
                  <div style={mutedStyle}>{selectedProduct.sku || "No SKU"} · {humanize(selectedProduct.productFamily)}</div>
                </div>
                <span style={greenChipStyle}>Open</span>
              </div>
              <p style={mutedStyle}>Starter: {humanize(selectedStarterType)} · {components.length} uses · {fields.length} quote questions</p>
            </div>
          ) : (
            <div style={{ ...softCardStyle, background: "#fcfcfd" }}>No product open yet.</div>
          )}

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>Product list ({filteredProducts.length})</summary>
            <div style={{ display: "grid", gap: 10, marginTop: 14, maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
              {filteredProducts.length === 0 ? (
                <div style={{ ...softCardStyle, background: "#fcfcfd" }}>No matching products.</div>
              ) : (
                filteredProducts.map((product) => (
                  <Link key={product.id} href={selectedProductUrl(product.id, query)} style={{ ...softCardStyle, textDecoration: "none", color: "inherit", background: selectedProduct?.id === product.id ? "#eef2ff" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{product.name}</strong>
                      <span style={plainChipStyle}>{humanize(product.status)}</span>
                    </div>
                    <div style={mutedStyle}>{product.sku || "No SKU"} · {humanize(product.productFamily)}</div>
                  </Link>
                ))
              )}
            </div>
          </details>
        </section>
      </section>

      {selectedProduct ? (
        <>
          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <p style={tinyLabelStyle}>Step 1</p>
                <h2 style={sectionHeadingStyle}>Product name and status</h2>
                <p style={{ ...mutedStyle, marginTop: 6 }}>This is only the base product. Quote questions come later.</p>
              </div>
              <span style={greenChipStyle}>Tax: GST</span>
            </div>

            <form action={updateProductAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <input type="hidden" name="defaultTemplateId" value={selectedProduct.defaultTemplateId ?? ""} />
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Product name</span>
                  <input name="name" defaultValue={selectedProduct.name} required style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>SKU / code</span>
                  <input name="sku" defaultValue={selectedProduct.sku ?? ""} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Status</span>
                  <select name="status" defaultValue={selectedProduct.status ?? "draft"} style={inputStyle}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>

              <AdvancedSection title="Advanced product grouping">
                <div style={grid2}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Department</span>
                    <select name="department" defaultValue={selectedProduct.department ?? "signage"} style={inputStyle}>
                      <option value="signage">Signage</option>
                      <option value="small_format">Small format</option>
                      <option value="install">Install</option>
                      <option value="outsourced">Outsourced</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Product family</span>
                    <select name="productFamily" defaultValue={selectedProduct.productFamily ?? "rigid_signage"} style={inputStyle}>
                      {productFamilies.map((family) => (
                        <option key={family.value} value={family.value}>{family.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </AdvancedSection>

              <button type="submit" style={buttonStyle}>Save product</button>
            </form>

            <PresetForm productId={selectedProduct.id} activeMaterials={activeMaterials} />
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <p style={tinyLabelStyle}>Advanced - usually skip</p>
                <h2 style={sectionHeadingStyle}>Extra stock or process rows</h2>
                <p style={{ ...mutedStyle, marginTop: 6 }}>Most pricing should be added in the quote answer lines below. Only use this section for something that is always used by the product and is not tied to a specific answer.</p>
              </div>
              <Link href="/materials" style={ghostStyle}>Manage materials</Link>
            </div>

            <div style={{ ...softCardStyle, background: "#f6fef9", borderColor: "#abefc6" }}>
              <strong>Normal users should use the answer lines below</strong>
              <p style={mutedStyle}>This advanced area is kept for unusual products. For normal setup, add a quote question such as Size, Print Type or White Ink, then fill in answer lines with parts per sheet, roll metres or dollars per m².</p>
            </div>

            {activeMaterials.length === 0 ? (
              <div style={{ ...softCardStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
                <strong>No active materials yet</strong>
                <p style={mutedStyle}>Add materials with purchase cost and sheet/roll dimensions before expecting automatic quote prices.</p>
              </div>
            ) : null}

            {components.length === 0 ? (
              <div style={{ ...softCardStyle, background: "#fcfcfd" }}>
                <strong>Nothing added yet</strong>
                <p style={mutedStyle}>Add the main stock first, then optional things like roll print, laminate or cutting.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {components.map((component: any, index: number) => {
                  const linkedMaterial = component.materialId ? materials.find((m) => m.id === component.materialId) : null;
                  const isEditing = String(component.id ?? "") === String(editComponentId);
                  const currentTriggerKey = String(component.trigger?.optionKey ?? "");
                  const missingTriggerOption = currentTriggerKey && !fields.some((field: any) => String(field.key ?? "") === currentTriggerKey);

                  return (
                    <div key={component.id ?? component.label} style={{ ...softCardStyle, background: isEditing ? "#f8fafc" : "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={plainChipStyle}>Use #{index + 1}</span>
                            <strong>{component.label ?? "Product row"}</strong>
                            <span style={component.kind === "labour" ? yellowChipStyle : greenChipStyle}>{component.kind === "labour" ? "Process" : "Stock"}</span>
                          </div>
                          <div style={mutedStyle}>{linkedMaterial?.name ?? component.labourRateName ?? "Not linked"}</div>
                          {linkedMaterial ? <div style={mutedStyle}>{materialDetails(linkedMaterial)}</div> : null}
                          <div style={mutedStyle}>{conditionSummary(component, fields)}</div>
                          <div style={mutedStyle}>{usageAmountSummary(component)}</div>
                          {component.notes ? <div style={mutedStyle}>{component.notes}</div> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link href={editProductUrl(selectedProduct.id, query, "component", String(component.id ?? ""))} style={ghostStyle}>Edit</Link>
                          <form action={deleteProductComponentAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="componentId" value={String(component.id ?? "")} />
                            <button type="submit" style={dangerGhostStyle}>Remove</button>
                          </form>
                        </div>
                      </div>

                      {isEditing ? (
                        <form action={updateProductComponentAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
                          <input type="hidden" name="productId" value={selectedProduct.id} />
                          <input type="hidden" name="componentId" value={String(component.id ?? "")} />
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Row type</span>
                              <select name="kind" defaultValue={component.kind === "labour" ? "labour" : "material"} style={inputStyle}>
                                <option value="material">Stock / material</option>
                                <option value="labour">Process / labour</option>
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Name shown on setup</span>
                              <input name="label" defaultValue={component.label ?? ""} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Linked stock/material</span>
                              <select name="materialId" defaultValue={component.materialId ?? ""} style={inputStyle}>
                                <option value="">Not linked</option>
                                {activeMaterials.map((material) => (
                                  <option key={material.id} value={material.id}>{material.name}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Process label</span>
                              <input name="labourRateName" defaultValue={component.labourRateName ?? ""} placeholder="eg Cutting" style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>How it is calculated</span>
                              <select name="baseUsage" defaultValue={baseUsageFromComponent(component)} style={inputStyle}>
                                {usageModes.map((mode) => (
                                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                                ))}
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Multiplier / allowance</span>
                              <input name="quantity" defaultValue={String(component.quantity ?? "1")} placeholder="usually 1" style={inputStyle} />
                            </label>
                          </div>
                          <UsageAmountFields component={component} />
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Waste %</span>
                              <input name="wastePercent" defaultValue={String(component.wastePercent ?? "10")} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>When is this used?</span>
                              <select name="triggerOptionKey" defaultValue={currentTriggerKey} style={inputStyle}>
                                <option value="">Always used</option>
                                {missingTriggerOption ? <option value={currentTriggerKey}>{currentTriggerKey}</option> : null}
                                {fields.map((field: any) => (
                                  <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>
                                ))}
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Only for these answers</span>
                              <input name="triggerOptionValuesCsv" defaultValue={Array.isArray(component.trigger?.optionValues) ? component.trigger.optionValues.join(", ") : ""} placeholder="eg gloss_laminate, matt_laminate" style={inputStyle} />
                            </label>
                          </div>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Notes</span>
                            <textarea name="notes" rows={3} defaultValue={String(component.notes ?? "")} style={textareaStyle} />
                          </label>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" style={buttonStyle}>Save row</button>
                            <Link href={selectedProductUrl(selectedProduct.id, query)} style={ghostStyle}>Cancel</Link>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
              <form action={addProductComponentAction} style={{ ...softCardStyle, background: "#f8fafc" }}>
                <input type="hidden" name="productId" value={selectedProduct.id} />
                <input type="hidden" name="kind" value="material" />
                <input type="hidden" name="labourRateName" value="" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Add stock / material</h3>
                  <p style={{ ...mutedStyle, marginTop: 4 }}>Use for ACM, roll vinyl, laminate, paper, hardware or other stock. These rows drive automatic material costing on quotes.</p>
                </div>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Name</span>
                  <input name="label" placeholder="eg ACM sheet, roll vinyl, gloss laminate" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Linked material</span>
                  <select name="materialId" defaultValue="" style={inputStyle}>
                    <option value="">Not linked yet</option>
                    {activeMaterials.map((material) => (
                      <option key={material.id} value={material.id}>{material.name}</option>
                    ))}
                  </select>
                </label>
                <div style={grid3}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>How it is used</span>
                    <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
                      {usageModes.map((mode) => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Multiplier / allowance</span>
                    <input name="quantity" defaultValue="1" placeholder="usually 1" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Waste %</span>
                    <input name="wastePercent" defaultValue="10" placeholder="eg 10" style={inputStyle} />
                  </label>
                </div>
                <UsageAmountFields />
                <AdvancedSection title="Only use this stock for certain quote answers">
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Quote question</span>
                    <select name="triggerOptionKey" defaultValue="" style={inputStyle}>
                      <option value="">Always used</option>
                      {fields.map((field: any) => (
                        <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Only for these answers</span>
                    <input name="triggerOptionValuesCsv" placeholder="eg roll_stock or gloss_laminate" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Notes</span>
                    <textarea name="notes" rows={2} placeholder="Explain how this stock is used" style={textareaStyle} />
                  </label>
                </AdvancedSection>
                <button type="submit" style={buttonStyle}>Add stock/material</button>
              </form>

              <form action={addProductComponentAction} style={{ ...softCardStyle, background: "#f8fafc" }}>
                <input type="hidden" name="productId" value={selectedProduct.id} />
                <input type="hidden" name="kind" value="labour" />
                <input type="hidden" name="materialId" value="" />
                <input type="hidden" name="baseUsage" value="each" />
                <input type="hidden" name="quantity" value="1" />
                <input type="hidden" name="wastePercent" value="0" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Add process / labour</h3>
                  <p style={{ ...mutedStyle, marginTop: 4 }}>Use for printing, cutting, drilling, trimming, binding or setup time.</p>
                </div>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Process name</span>
                  <input name="label" placeholder="eg Jingwei cutting, print setup, binding" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Internal process label</span>
                  <input name="labourRateName" placeholder="eg Cutting" style={inputStyle} />
                </label>
                <AdvancedSection title="Only use this process for certain quote answers">
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Quote question</span>
                    <select name="triggerOptionKey" defaultValue="" style={inputStyle}>
                      <option value="">Always used</option>
                      {fields.map((field: any) => (
                        <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Only for these answers</span>
                    <input name="triggerOptionValuesCsv" placeholder="eg jingwei_cutting" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Notes</span>
                    <textarea name="notes" rows={2} placeholder="Explain when this process applies" style={textareaStyle} />
                  </label>
                </AdvancedSection>
                <button type="submit" style={buttonStyle}>Add process/labour</button>
              </form>
            </div>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <p style={tinyLabelStyle}>Step 2</p>
              <h2 style={sectionHeadingStyle}>Quote choices and costing</h2>
              <p style={{ ...mutedStyle, marginTop: 6 }}>Add one question, then fill in the answer lines. Each answer can be choice-only, material usage, or a simple charge such as ink at $10/m².</p>
            </div>

            {fields.length === 0 ? (
              <div style={{ ...softCardStyle, background: "#fcfcfd" }}>
                <strong>No quote questions yet</strong>
                <p style={mutedStyle}>Start with Size, then add Print type, Laminate, Finishing and Quantity.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {fields.map((field: any, index: number) => {
                  const isEditing = String(field.id ?? "") === String(editOptionId);
                  const currentShowWhenKey = showWhenOptionKeyFromField(field);
                  const missingShowWhenOption = currentShowWhenKey && !fields.some((item: any) => String(item.key ?? "") === currentShowWhenKey);

                  return (
                    <div key={field.id ?? field.key} style={{ ...softCardStyle, background: isEditing ? "#f8fafc" : "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={plainChipStyle}>Question #{index + 1}</span>
                            <strong>{field.label}</strong>
                            <span style={greenChipStyle}>{humanize(field.type)}</span>
                          </div>
                          <div style={mutedStyle}>Default: {defaultAnswerFromField(field) || "None"} · {field.required === false ? "Optional" : "Required"}</div>
                          <div style={mutedStyle}>Choices: {optionChoicesSummary(field)}</div>
                          <div style={mutedStyle}>Costing: {optionCostingSummaryForField(field, components) || materialCostingSummary(field)}</div>
                          {field.showWhen?.optionKey ? <div style={mutedStyle}>Only appears when {field.showWhen.optionKey}: {showWhenValuesCsvFromField(field) || "any value"}</div> : null}
                          {field.helpText ? <div style={mutedStyle}>{field.helpText}</div> : null}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <form action={moveProductOptionAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                            <input type="hidden" name="direction" value="up" />
                            <button type="submit" style={ghostStyle}>Up</button>
                          </form>
                          <form action={moveProductOptionAction}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                            <input type="hidden" name="direction" value="down" />
                            <button type="submit" style={ghostStyle}>Down</button>
                          </form>
                          <Link href={editProductUrl(selectedProduct.id, query, "option", String(field.id ?? ""))} style={ghostStyle}>Edit</Link>
                          <form action={deleteProductOptionAction} style={{ display: "grid", gap: 6 }}>
                            <input type="hidden" name="productId" value={selectedProduct.id} />
                            <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                            <input type="hidden" name="deleteLinkedMaterials" value="yes" />
                            <button type="submit" style={dangerGhostStyle}>Remove question</button>
                          </form>
                        </div>
                      </div>

                      {isEditing ? (
                        <form action={updateProductOptionAction} style={{ display: "grid", gap: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
                          <input type="hidden" name="productId" value={selectedProduct.id} />
                          <input type="hidden" name="fieldId" value={String(field.id ?? "")} />
                          <div style={grid3}>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Question label</span>
                              <input name="label" defaultValue={String(field.label ?? "")} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Answer type</span>
                              <select name="fieldType" defaultValue={String(field.type ?? "select")} style={inputStyle}>
                                {optionTypes.map((type) => (
                                  <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                              </select>
                            </label>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Required?</span>
                              <select name="required" defaultValue={field.required === false ? "no" : "yes"} style={inputStyle}>
                                <option value="yes">Required</option>
                                <option value="no">Optional</option>
                              </select>
                            </label>
                          </div>
                          <CostedOptionRows materials={activeMaterials} field={field} components={components} />
                          <AdvancedSection title="Advanced visibility and key">
                            <div style={grid3}>
                              <label style={labelStyle}>
                                <span style={labelTextStyle}>Internal key</span>
                                <input name="key" defaultValue={String(field.key ?? "")} style={inputStyle} />
                              </label>
                              <label style={labelStyle}>
                                <span style={labelTextStyle}>Only show after question</span>
                                <select name="showWhenOptionKey" defaultValue={currentShowWhenKey} style={inputStyle}>
                                  <option value="">Always show</option>
                                  {missingShowWhenOption ? <option value={currentShowWhenKey}>{currentShowWhenKey}</option> : null}
                                  {fields.filter((item: any) => String(item.id ?? "") !== String(field.id ?? "")).map((item: any) => (
                                    <option key={item.id ?? item.key} value={String(item.key ?? "")}>{item.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label style={labelStyle}>
                                <span style={labelTextStyle}>Show only for answers</span>
                                <input name="showWhenOptionValuesCsv" defaultValue={showWhenValuesCsvFromField(field)} placeholder="eg roll_stock" style={inputStyle} />
                              </label>
                            </div>
                            <label style={labelStyle}>
                              <span style={labelTextStyle}>Help text</span>
                              <input name="helpText" defaultValue={String(field.helpText ?? "")} style={inputStyle} />
                            </label>
                          </AdvancedSection>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" style={buttonStyle}>Save question</button>
                            <Link href={selectedProductUrl(selectedProduct.id, query)} style={ghostStyle}>Cancel</Link>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <form action={addProductOptionAction} style={{ ...softCardStyle, background: "#f8fafc" }}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Add a quote question</h3>
                <p style={{ ...mutedStyle, marginTop: 4 }}>Example: Question = White Ink. Answers = No extra cost, Yes with Charge: dollars per m² and number 10.</p>
              </div>
              <div style={grid3}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Question label</span>
                  <input name="label" placeholder="eg Size, Laminate, Finishing" style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Answer type</span>
                  <select name="fieldType" defaultValue="select" style={inputStyle}>
                    {optionTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Required?</span>
                  <select name="required" defaultValue="yes" style={inputStyle}>
                    <option value="yes">Required</option>
                    <option value="no">Optional</option>
                  </select>
                </label>
              </div>
              <CostedOptionRows materials={activeMaterials} components={components} />
              <AdvancedSection title="Advanced: only show this question sometimes">
                <div style={grid3}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Internal key</span>
                    <input name="key" placeholder="Optional - generated from label if blank" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Only show after question</span>
                    <select name="showWhenOptionKey" defaultValue="" style={inputStyle}>
                      <option value="">Always show</option>
                      {fields.map((field: any) => (
                        <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Show only for answers</span>
                    <input name="showWhenOptionValuesCsv" placeholder="eg roll_stock" style={inputStyle} />
                  </label>
                </div>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Help text</span>
                  <input name="helpText" placeholder="Explain how staff should use this question" style={inputStyle} />
                </label>
              </AdvancedSection>
              <button type="submit" style={buttonStyle}>Add option</button>
            </form>
          </section>
        </>
      ) : (
        <section style={{ ...cardStyle, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>Open or create a product to start</h2>
          <p style={mutedStyle}>After a product is open, setup is handled in three simple sections: name, uses, and quote questions.</p>
        </section>
      )}
    </div>
  );
}
