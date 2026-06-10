import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";
import { addProductComponentAction, addProductOptionAction, applyQuoteBehaviourPresetAction, createProductAction, deleteProductComponentAction, deleteProductOptionAction, moveProductOptionAction, updateProductAction, updateProductComponentAction, updateProductOptionAction } from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ProductTypeCard = {
  value: string;
  title: string;
  example: string;
  baseMaterialHint: string;
  quoteOptions: string;
  department: string;
  family: string;
  baseUsage: string;
};

const productTypes: ProductTypeCard[] = [
  {
    value: "sign_acm",
    title: "ACM sheet sign",
    example: "Sign - ACM - 3mm",
    baseMaterialHint: "3mm ACM sheet",
    quoteOptions: "Size, print type, roll stock type, laminate, finishing, quantity",
    department: "signage",
    family: "rigid_signage",
    baseUsage: "part_sheet"
  },
  {
    value: "sign_corflute",
    title: "Corflute sign",
    example: "Sign - Corflute - 5mm",
    baseMaterialHint: "3mm / 5mm corflute sheet",
    quoteOptions: "Size, print type, laminate if needed, finishing, quantity",
    department: "signage",
    family: "rigid_signage",
    baseUsage: "part_sheet"
  },
  {
    value: "sign_acrylic",
    title: "Acrylic sign",
    example: "Sign - Acrylic - 4.5mm Opal",
    baseMaterialHint: "clear / opal / coloured acrylic sheet",
    quoteOptions: "Size, print type, laminate, router/CNC, holes, quantity",
    department: "signage",
    family: "rigid_signage",
    baseUsage: "part_sheet"
  },
  {
    value: "sign_pvc",
    title: "PVC / foamboard sign",
    example: "Sign - PVC - 3mm",
    baseMaterialHint: "PVC or foamboard sheet",
    quoteOptions: "Size, print type, laminate, cutting, quantity",
    department: "signage",
    family: "rigid_signage",
    baseUsage: "part_sheet"
  },
  {
    value: "banner",
    title: "Banner",
    example: "Banner - 510gsm",
    baseMaterialHint: "banner roll stock",
    quoteOptions: "Size, hem/eyelets/pockets, laminate if needed, quantity",
    department: "signage",
    family: "banners",
    baseUsage: "roll_metres"
  },
  {
    value: "roll_print",
    title: "Roll print / vinyl",
    example: "Roll Print - White Vinyl",
    baseMaterialHint: "white / clear / etch roll media",
    quoteOptions: "Size, roll stock type, laminate, quantity",
    department: "signage",
    family: "roll_media",
    baseUsage: "roll_metres"
  },
  {
    value: "business_cards",
    title: "Business cards",
    example: "Business Cards - 350gsm",
    baseMaterialHint: "card stock / parent sheet",
    quoteOptions: "Size, front/back, gloss/matt/no cello, quantity",
    department: "small_format",
    family: "small_format_print",
    baseUsage: "paper_yield"
  },
  {
    value: "flyers",
    title: "Flyers",
    example: "Flyers - 150gsm",
    baseMaterialHint: "paper stock / parent sheet",
    quoteOptions: "Size, front/back, gloss/matt/no cello, quantity",
    department: "small_format",
    family: "small_format_print",
    baseUsage: "paper_yield"
  },
  {
    value: "books",
    title: "Books / pads",
    example: "Book - A5 Pad",
    baseMaterialHint: "paper stock, cover stock, binding consumables",
    quoteOptions: "Size, pages, cover colour, binding, quantity",
    department: "small_format",
    family: "display_products",
    baseUsage: "paper_yield"
  },
  {
    value: "carbon_books",
    title: "Duplicate / triplicate books",
    example: "Carbon Book - Duplicate - A5",
    baseMaterialHint: "NCR paper, cover card, tape, numbering",
    quoteOptions: "Pages, copies, copy colours, cover colour, tape colour, numbering, quantity",
    department: "small_format",
    family: "display_products",
    baseUsage: "paper_yield"
  }
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
    .replace(/(\d+)x(\d+)/i, "$1 × $2 mm");
}

function selectedProductUrl(productId: string, query: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  return `/products?selected=${productId}${q}`;
}

function statusTone(value: string): CSSProperties {
  if (value === "active") return { background: "#ecfdf3", color: "#067647", borderColor: "#abefc6" };
  if (value === "archived") return { background: "#f2f4f7", color: "#475467", borderColor: "#d0d5dd" };
  return { background: "#fffaeb", color: "#b54708", borderColor: "#fedf89" };
}

function setupName(value: string | null | undefined): string {
  return productTypes.find((type) => type.value === value)?.title ?? "Custom product";
}

function choiceLabel(option: any): string {
  return String(option?.label ?? option?.value ?? "Choice");
}

function choiceValue(option: any): string {
  return String(option?.value ?? option?.label ?? "");
}

function defaultChoiceLabel(field: Record<string, any>): string {
  const defaultValue = String(field.defaultValue ?? "");
  const options = Array.isArray(field.options) ? field.options : [];
  const match = options.find((option: any) => choiceValue(option) === defaultValue || choiceLabel(option) === defaultValue);
  if (match) return choiceLabel(match);
  if (defaultValue) return humanize(defaultValue);
  if (field.type === "quantity" || field.type === "number") return "Entered on quote";
  return "No default";
}

function otherChoiceLabels(field: Record<string, any>): string {
  const defaultValue = String(field.defaultValue ?? "");
  const options = Array.isArray(field.options) ? field.options : [];
  const others = options.filter((option: any) => choiceValue(option) !== defaultValue && choiceLabel(option) !== defaultValue);
  if (others.length === 0) {
    if (field.type === "quantity" || field.type === "number") return "Staff enters this number while quoting.";
    return "No alternatives yet.";
  }
  return others.map(choiceLabel).join(", ");
}

function usageSummary(component: Record<string, any>): string {
  const ruleType = String(component.ruleType ?? component.stockUsage?.usageBasis ?? "fixed");
  const unit = component.unit ?? "each";
  const qty = component.quantity ?? "1";
  const parts = component.stockUsage?.partsPerSheet;

  if (ruleType === "yield_based") return parts ? `Part sheet / parent yield (${parts} up)` : "Part sheet / parent sheet yield";
  if (ruleType === "per_linear_metre") return `Metres from roll (${qty} ${unit})`;
  if (ruleType === "per_sqm") return `Area based (${qty} ${unit})`;
  if (ruleType === "per_unit") return `Per quoted unit (${qty} ${unit})`;
  if (ruleType === "selected_by_option") return "Only when selected while quoting";
  if (ruleType === "per_sheet") return "Sheet allocation";
  return humanize(ruleType);
}

function triggerSummary(component: Record<string, any>): string {
  const trigger = component.trigger ?? {};
  const optionKey = trigger.optionKey ?? component.stockUsage?.optionKey;
  const values = Array.isArray(trigger.optionValues) && trigger.optionValues.length > 0 ? trigger.optionValues : component.stockUsage?.optionValues;
  if (!optionKey || (Array.isArray(values) && values.length === 0 && component.role === "base_material")) return "Always part of the base product";
  if (!optionKey) return "Always used";
  const friendlyValues = Array.isArray(values) && values.length > 0 ? values.map(humanize).join(", ") : "selected";
  return `Only when ${humanize(optionKey)} is ${friendlyValues}`;
}

function productTypeFromPreset(preset: string | null | undefined): ProductTypeCard {
  return productTypes.find((type) => type.value === preset) ?? productTypes[0];
}

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 24,
  padding: 22,
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)"
};

const softCardStyle: CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 16
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 42,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "0 12px",
  fontSize: 15,
  boxSizing: "border-box",
  background: "#fff"
};

const textareaStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: 12,
  fontSize: 15,
  boxSizing: "border-box",
  background: "#fff"
};

const labelStyle: CSSProperties = { display: "grid", gap: 7, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 850, fontSize: 13, color: "#344054" };
const gridTwoStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 };
const gridThreeStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 900, cursor: "pointer", padding: "0 16px" };
const secondaryButtonStyle: CSSProperties = { minHeight: 42, borderRadius: 12, border: "1px solid #d0d5dd", background: "#fff", color: "#111827", fontWeight: 900, cursor: "pointer", padding: "0 14px" };
const pillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "5px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const greenPillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#ecfdf3", color: "#067647", padding: "5px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const mutedTextStyle: CSSProperties = { color: "#667085", fontSize: 13, lineHeight: 1.5 };

function StepHeading({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ width: 34, height: 34, borderRadius: 999, background: "#111827", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, flex: "0 0 auto" }}>{number}</span>
      <div>
        <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
        <p style={{ margin: "7px 0 0", color: "#475467", lineHeight: 1.55 }}>{children}</p>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div style={{ border: "1px dashed #d0d5dd", borderRadius: 16, padding: 16, color: "#667085", background: "#fcfcfd" }}>{children}</div>;
}

function optionCsvForInput(field: Record<string, any>, includeDefault: boolean): string {
  const defaultValue = String(field.defaultValue ?? "");
  const options = Array.isArray(field.options) ? field.options : [];
  return options
    .filter((option: Record<string, any>) => includeDefault || (String(option.value ?? option.label ?? "") !== defaultValue && String(option.label ?? option.value ?? "") !== defaultValue))
    .map((option: Record<string, any>) => {
      const label = String(option.label ?? option.value ?? "").trim();
      const value = String(option.value ?? label).trim();
      if (!label) return value;
      return label === value ? label : `${label}=${value}`;
    })
    .filter(Boolean)
    .join(",");
}

function rawDefaultAnswer(field: Record<string, any>): string {
  const defaultValue = String(field.defaultValue ?? "");
  const options = Array.isArray(field.options) ? field.options : [];
  const match = options.find((option: Record<string, any>) => choiceValue(option) === defaultValue || choiceLabel(option) === defaultValue);
  if (match) {
    const label = choiceLabel(match);
    const value = choiceValue(match);
    return label === value ? label : `${label}=${value}`;
  }
  return defaultValue;
}

function usagePresetForComponent(component: Record<string, any>): string {
  const ruleType = String(component.ruleType ?? component.stockUsage?.usageBasis ?? "yield_based");
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_sqm") return "area";
  if (ruleType === "per_unit" && String(component.unit ?? "") === "sheet") return "whole_sheet";
  if (ruleType === "per_unit") return "each";
  if (ruleType === "yield_based" && String(component.role ?? "") !== "base_material") return "paper_yield";
  return "part_sheet";
}

function triggerValuesCsv(component: Record<string, any>): string {
  const values = Array.isArray(component.trigger?.optionValues) && component.trigger.optionValues.length > 0
    ? component.trigger.optionValues
    : Array.isArray(component.stockUsage?.optionValues)
      ? component.stockUsage.optionValues
      : [];
  return values.join(",");
}

function FieldPreview({ field, index, total, productId }: { field: Record<string, any>; index: number; total: number; productId: string }) {
  return (
    <article style={{ ...softCardStyle, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: 16 }}>{field.label}</strong>
          <div style={{ marginTop: 4, ...mutedTextStyle }}>{field.helpText ?? "Shown after this product is selected on a quote."}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={pillStyle}>{humanize(field.type)}</span>
          <form action={moveProductOptionAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="fieldId" value={field.id ?? ""} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" disabled={index === 0} style={{ ...secondaryButtonStyle, minHeight: 34, padding: "0 10px", opacity: index === 0 ? 0.4 : 1 }}>↑</button>
          </form>
          <form action={moveProductOptionAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="fieldId" value={field.id ?? ""} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" disabled={index >= total - 1} style={{ ...secondaryButtonStyle, minHeight: 34, padding: "0 10px", opacity: index >= total - 1 ? 0.4 : 1 }}>↓</button>
          </form>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.75fr) minmax(220px, 1.25fr)", gap: 10 }}>
        <div style={{ ...softCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
          <div style={{ ...labelTextStyle, color: "#067647" }}>Default when quoting</div>
          <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: "#064e3b" }}>{defaultChoiceLabel(field)}</div>
        </div>
        <div style={{ ...softCardStyle, background: "#fff" }}>
          <div style={labelTextStyle}>Other choices</div>
          <div style={{ marginTop: 5, ...mutedTextStyle }}>{otherChoiceLabels(field)}</div>
        </div>
      </div>
      {field.showWhen?.optionKey ? <div style={mutedTextStyle}>Only appears when {humanize(field.showWhen.optionKey)} is {(field.showWhen.optionValues ?? []).map(humanize).join(", ")}</div> : null}

      <details style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fff" }}>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Edit this quote choice</summary>
        <form action={updateProductOptionAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="fieldId" value={field.id ?? ""} />
          <div style={gridTwoStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Choice shown on quote</span>
              <input name="label" defaultValue={field.label ?? ""} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Internal key</span>
              <input name="key" defaultValue={field.key ?? ""} style={inputStyle} />
            </label>
          </div>
          <div style={gridTwoStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Answer style</span>
              <select name="fieldType" defaultValue={field.type ?? "select"} style={inputStyle}>
                <option value="select">Pick one from list</option>
                <option value="size_select">Size list</option>
                <option value="quantity">Number / quantity</option>
                <option value="number">Number</option>
                <option value="color">Colour list</option>
                <option value="text">Typed answer</option>
              </select>
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Required?</span>
              <select name="required" defaultValue={field.required === false ? "no" : "yes"} style={inputStyle}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <div style={gridTwoStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Default answer</span>
              <input name="defaultAnswer" defaultValue={rawDefaultAnswer(field)} placeholder="eg None / 600x900 / Duplicate" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Other answers</span>
              <input name="otherOptionsCsv" defaultValue={optionCsvForInput(field, false)} placeholder="eg Gloss laminate,Matt laminate" style={inputStyle} />
            </label>
          </div>
          <div style={gridTwoStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Only show after choice</span>
              <input name="showWhenOptionKey" defaultValue={field.showWhen?.optionKey ?? ""} placeholder="eg print_method" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Only show when answer is</span>
              <input name="showWhenOptionValuesCsv" defaultValue={(field.showWhen?.optionValues ?? []).join(",")} placeholder="eg roll_stock" style={inputStyle} />
            </label>
          </div>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Help text for staff</span>
            <input name="helpText" defaultValue={field.helpText ?? ""} style={inputStyle} />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle}>Save quote choice</button>
          </div>
        </form>
        <form action={deleteProductOptionAction} style={{ display: "grid", gap: 8, marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="fieldId" value={field.id ?? ""} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#475467" }}>
            <input type="checkbox" name="deleteLinkedMaterials" value="yes" />
            Also remove material/labour rows triggered by this choice
          </label>
          <button type="submit" style={{ ...secondaryButtonStyle, color: "#b42318", borderColor: "#fda29b", justifySelf: "start" }}>Remove quote choice</button>
        </form>
      </details>
    </article>
  );
}

function MaterialRow({ component, materialMap, productId, activeMaterials, fields }: { component: Record<string, any>; materialMap: Map<string, any>; productId: string; activeMaterials: Array<any>; fields: Array<Record<string, any>> }) {
  const material = component.materialId ? materialMap.get(component.materialId) : null;
  const triggerKey = component.trigger?.optionKey ?? (component.role === "base_material" ? "" : component.stockUsage?.optionKey ?? "");
  return (
    <article style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 16, background: "#fff", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: 17 }}>{component.label || material?.name || "Material"}</strong>
          <div style={{ marginTop: 4, ...mutedTextStyle }}>{material?.name ? `Linked material: ${material.name}` : component.kind === "labour" ? "Labour / machine time row" : "No purchased material linked yet"}</div>
        </div>
        <span style={component.role === "base_material" ? greenPillStyle : pillStyle}>{component.role === "base_material" ? "Base material" : component.kind === "labour" ? "Quote labour" : "Quote material"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <div style={softCardStyle}>
          <div style={labelTextStyle}>Stock usage</div>
          <div style={{ marginTop: 5, ...mutedTextStyle }}>{usageSummary(component)}</div>
        </div>
        <div style={softCardStyle}>
          <div style={labelTextStyle}>When used</div>
          <div style={{ marginTop: 5, ...mutedTextStyle }}>{triggerSummary(component)}</div>
        </div>
        <div style={softCardStyle}>
          <div style={labelTextStyle}>Waste</div>
          <div style={{ marginTop: 5, ...mutedTextStyle }}>{component.wastePercent ?? "0"}%</div>
        </div>
      </div>
      {component.notes ? <div style={mutedTextStyle}>{component.notes}</div> : null}

      <details style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 12, background: "#fafafa" }}>
        <summary style={{ cursor: "pointer", fontWeight: 900 }}>Edit this material row</summary>
        <form action={updateProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="componentId" value={component.id ?? ""} />
          <input type="hidden" name="role" value={component.role ?? "base_material"} />
          <div style={gridTwoStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Purchased material</span>
              <select name="materialId" defaultValue={component.materialId ?? ""} style={inputStyle}>
                <option value="">No material linked</option>
                {activeMaterials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Row type</span>
              <select name="kind" defaultValue={component.kind ?? "material"} style={inputStyle}>
                <option value="material">Purchased material</option>
                <option value="labour">Labour / machine time</option>
              </select>
            </label>
          </div>
          <div style={gridTwoStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Friendly name</span>
              <input name="label" defaultValue={component.label ?? ""} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>How this is consumed</span>
              <select name="baseUsage" defaultValue={usagePresetForComponent(component)} style={inputStyle}>
                <option value="part_sheet">Part sheet / nested from parent sheet</option>
                <option value="whole_sheet">Whole sheet per item</option>
                <option value="roll_metres">Metres from roll</option>
                <option value="paper_yield">Paper/card parent sheet yield</option>
                <option value="area">Square metres</option>
                <option value="each">Each / box / item / labour unit</option>
              </select>
            </label>
          </div>
          <div style={gridThreeStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Default amount</span>
              <input name="quantity" defaultValue={component.quantity ?? "1"} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Waste %</span>
              <input name="wastePercent" defaultValue={component.wastePercent ?? "10"} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Labour rate name</span>
              <input name="labourRateName" defaultValue={component.labourRateName ?? ""} placeholder="eg Cutting / Bindery" style={inputStyle} />
            </label>
          </div>
          <div style={gridTwoStyle}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Only used when quote choice is</span>
              <select name="triggerOptionKey" defaultValue={triggerKey} style={inputStyle}>
                <option value="">Always used / base material</option>
                {fields.map((field) => <option key={field.id ?? field.key} value={field.key}>{field.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              <span style={labelTextStyle}>Only used for these answers</span>
              <input name="triggerOptionValuesCsv" defaultValue={triggerValuesCsv(component)} placeholder="eg gloss_laminate,matt_laminate" style={inputStyle} />
            </label>
          </div>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Notes</span>
            <textarea name="notes" rows={3} defaultValue={component.notes ?? ""} style={textareaStyle} />
          </label>
          <button type="submit" style={buttonStyle}>Save material row</button>
        </form>
        <form action={deleteProductComponentAction} style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="componentId" value={component.id ?? ""} />
          <button type="submit" style={{ ...secondaryButtonStyle, color: "#b42318", borderColor: "#fda29b" }}>Remove material row</button>
        </form>
      </details>
    </article>
  );
}

function PresetButton({ productId, type, activeMaterials }: { productId: string; type: ProductTypeCard; activeMaterials: Array<any> }) {
  return (
    <form action={applyQuoteBehaviourPresetAction} style={{ minWidth: 0 }}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="starterType" value={type.value} />
      <input type="hidden" name="baseUsage" value={type.baseUsage} />
      <button type="submit" style={{ width: "100%", textAlign: "left", border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff", padding: 16, cursor: "pointer", minHeight: 190 }}>
        <span style={greenPillStyle}>Starter</span>
        <strong style={{ display: "block", marginTop: 12, fontSize: 17 }}>{type.title}</strong>
        <span style={{ display: "block", marginTop: 7, ...mutedTextStyle }}>Example: {type.example}</span>
        <span style={{ display: "block", marginTop: 9, color: "#344054", fontSize: 13, lineHeight: 1.45 }}><strong>Base material:</strong> {type.baseMaterialHint}</span>
        <span style={{ display: "block", marginTop: 5, color: "#344054", fontSize: 13, lineHeight: 1.45 }}><strong>On quote:</strong> {type.quoteOptions}</span>
        {activeMaterials.length > 0 ? <span style={{ display: "block", marginTop: 8, color: "#667085", fontSize: 12 }}>Base material can be linked separately below.</span> : null}
      </button>
    </form>
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

  const definition = editorTemplate?.definitionJson ?? {};
  const fields = Array.isArray(definition.fields) ? definition.fields : [];
  const components = Array.isArray(definition.components) ? definition.components : [];
  const setupPreset = String(definition.setupPreset ?? "") || null;
  const currentType = productTypeFromPreset(setupPreset);
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const activeMaterials = materials.filter((material) => material.active);
  const baseComponents = components.filter((item) => item.role === "base_material" || (!item.trigger?.optionKey && item.kind !== "labour"));
  const quoteComponents = components.filter((item) => !baseComponents.includes(item));

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 16, minWidth: 0 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16, fontWeight: 850 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16, fontWeight: 850 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
            <h1 style={{ margin: "10px 0 8px", fontSize: 34 }}>Products</h1>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 980 }}>
              Products are the base sellable items staff choose on a quote. A product has a base material, like “Sign - ACM - 3mm” using ACM. Size, print method, laminate and finishing happen later on the quote.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={pillStyle}>{products.length} products</span>
            <span style={pillStyle}>{activeMaterials.length} active materials</span>
            <span style={pillStyle}>GST automatic</span>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 16 }}>
          <details open style={{ ...cardStyle }}>
            <summary style={{ cursor: "pointer", fontSize: 20, fontWeight: 900 }}>Create base product</summary>
            <form action={createProductAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Base product name</span>
                <input name="name" required placeholder="Sign - ACM - 3mm" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product type</span>
                <select name="starterType" defaultValue="sign_acm" style={inputStyle}>
                  {productTypes.map((type) => <option key={type.value} value={type.value}>{type.title}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Base purchased material</span>
                <select name="baseMaterialId" defaultValue="" style={inputStyle}>
                  <option value="">Link later</option>
                  {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>How stock is allocated</span>
                <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
                  <option value="part_sheet">Part sheet / nested from parent sheet</option>
                  <option value="whole_sheet">Whole sheet per item</option>
                  <option value="roll_metres">Metres from roll</option>
                  <option value="paper_yield">Paper/card parent sheet yield</option>
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>SKU</span>
                <input name="sku" placeholder="Optional" style={inputStyle} />
              </label>
              <p style={{ margin: 0, ...mutedTextStyle }}>This creates the base product and the quote behaviour staff will see later. Tax is GST automatically.</p>
              <button type="submit" style={buttonStyle}>Create product</button>
            </form>
          </details>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>Open product</h2>
              <p style={{ margin: "6px 0 0", color: "#475467", fontSize: 14 }}>Search and edit base products.</p>
            </div>
            <form method="GET" action="/products" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
              <input type="text" name="q" defaultValue={query} placeholder="Search products" style={inputStyle} />
              <button type="submit" style={secondaryButtonStyle}>Go</button>
            </form>
            <div style={{ display: "grid", gap: 8, maxHeight: 540, overflowY: "auto", paddingRight: 2 }}>
              {filteredProducts.map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                return (
                  <a
                    key={product.id}
                    href={selectedProductUrl(product.id, query)}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      border: isSelected ? "1px solid #4f46e5" : "1px solid #e5e7eb",
                      background: isSelected ? "#eef2ff" : "#fafafa",
                      color: "#111827",
                      borderRadius: 14,
                      padding: 13
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>{product.name}</strong>
                      <span style={{ border: "1px solid", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 900, ...statusTone(product.status) }}>{product.status}</span>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 13, color: "#475467" }}>{product.sku || "No SKU"} · {humanize(product.productFamily)}</div>
                    <div style={{ marginTop: 5, fontSize: 12, color: "#667085" }}>{product.templateName ? "quote behaviour ready" : "needs setup"}</div>
                  </a>
                );
              })}
            </div>
          </section>
        </aside>

        <main style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {!selectedProduct ? (
            <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Select or create a product</h2>
              <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>
                Use Products to create base sellable items only. Example: create “Sign - ACM - 3mm”, link the ACM material, then go to Quotes to choose size, print type, laminate and finishing.
              </p>
            </section>
          ) : (
            <>
              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Selected base product</p>
                    <h2 style={{ margin: "8px 0 0", fontSize: 30 }}>{selectedProduct.name}</h2>
                    <p style={{ margin: "6px 0 0", color: "#667085" }}>{selectedProduct.sku || "No SKU"} · {humanize(selectedProduct.productFamily)} · GST</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={greenPillStyle}>{baseComponents.length} base material rows</span>
                    <span style={pillStyle}>{fields.length} quote choices</span>
                    <span style={pillStyle}>{setupName(setupPreset)}</span>
                  </div>
                </div>
                <div style={{ ...softCardStyle, background: "#fffaeb", borderColor: "#fedf89" }}>
                  <strong style={{ color: "#b54708" }}>Important split</strong>
                  <p style={{ margin: "6px 0 0", color: "#7a2e0e", lineHeight: 1.55 }}>
                    This is not a quote. This product only defines the base item and stock it can consume. Staff choose size, print type, laminate, finishing and quantity on the Quotes page.
                  </p>
                </div>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <StepHeading number="1" title="Base product details">
                  Keep this as the simple sellable product name staff will recognise in a quote.
                </StepHeading>
                <form action={updateProductAction} style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="productId" value={selectedProduct.id} />
                  <input type="hidden" name="defaultTemplateId" value={selectedProduct.defaultTemplateId ?? ""} />
                  <div style={gridThreeStyle}>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Product name</span>
                      <input name="name" required defaultValue={selectedProduct.name} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>SKU</span>
                      <input name="sku" defaultValue={selectedProduct.sku ?? ""} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Status</span>
                      <select name="status" defaultValue={selectedProduct.status} style={inputStyle}>
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                  <div style={gridTwoStyle}>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Department</span>
                      <select name="department" defaultValue={selectedProduct.department} style={inputStyle}>
                        <option value="signage">Signage</option>
                        <option value="small_format">Small format</option>
                        <option value="installation">Installation</option>
                        <option value="general">General</option>
                      </select>
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Product family</span>
                      <select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}>
                        <option value="rigid_signage">Rigid signage / sheet signs</option>
                        <option value="roll_media">Roll media / vinyl print</option>
                        <option value="banners">Banners</option>
                        <option value="stickers_labels">Stickers / labels</option>
                        <option value="window_wall_graphics">Window / wall graphics</option>
                        <option value="vehicle_graphics">Vehicle graphics</option>
                        <option value="small_format_print">Small format print</option>
                        <option value="display_products">Books / display products</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" style={buttonStyle}>Save product details</button>
                  </div>
                </form>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <StepHeading number="2" title="Base material / stock used by this product">
                  Link the purchased material behind the base product. This is where stock allocation begins: ACM sheet, banner roll, card stock, paper, carbonless paper, cover card or tape.
                </StepHeading>

                {baseComponents.length === 0 ? (
                  <EmptyState>No base material linked yet. Add the purchased material that this product is built from.</EmptyState>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {baseComponents.map((item, index) => <MaterialRow key={item.id ?? `${item.label}-${index}`} component={item} materialMap={materialMap} productId={selectedProduct.id} activeMaterials={activeMaterials} fields={fields} />)}
                  </div>
                )}

                <details open={baseComponents.length === 0} style={softCardStyle}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add or link a base material</summary>
                  <form action={addProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Purchased material</span>
                        <select name="materialId" defaultValue="" style={inputStyle}>
                          <option value="">No material linked yet</option>
                          {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
                        </select>
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>How this stock is consumed</span>
                        <select name="baseUsage" defaultValue={currentType.baseUsage} style={inputStyle}>
                          <option value="part_sheet">Part sheet / nested from parent sheet</option>
                          <option value="whole_sheet">Whole sheet per item</option>
                          <option value="roll_metres">Metres from roll</option>
                          <option value="paper_yield">Paper/card parent sheet yield</option>
                          <option value="area">Square metres</option>
                          <option value="each">Each / box / item</option>
                        </select>
                      </label>
                    </div>
                    <div style={gridThreeStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Friendly name</span>
                        <input name="label" placeholder="eg 3mm ACM sheet / 510gsm banner roll" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Default amount</span>
                        <input name="quantity" placeholder="Usually 1" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Waste %</span>
                        <input name="wastePercent" placeholder="Usually 10" style={inputStyle} />
                      </label>
                    </div>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Notes</span>
                      <textarea name="notes" rows={3} placeholder="Example: allocate part of a 2440 × 1220 ACM sheet from quote size." style={textareaStyle} />
                    </label>
                    <button type="submit" style={buttonStyle}>Add base material</button>
                  </form>
                </details>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <StepHeading number="3" title="Quote behaviour for this product">
                  These are not product creation fields. They are the choices staff see after selecting this product on a quote.
                </StepHeading>

                <div style={{ ...softCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
                  <strong style={{ color: "#067647" }}>Example flow</strong>
                  <p style={{ margin: "6px 0 0", color: "#064e3b", lineHeight: 1.55 }}>
                    Product: <strong>{selectedProduct.name}</strong>. Quote choices: size, print type, laminate and finishing. If size is 600 × 900, the app allocates part of the base material. If roll stock is chosen, it also allocates roll stock. If laminate is chosen, it allocates laminate.
                  </p>
                </div>

                {fields.length === 0 ? (
                  <EmptyState>No quote choices yet. Add quote choices below, or use a product type starter and then edit/remove anything you do not want.</EmptyState>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {fields.map((field, index) => <FieldPreview key={field.id ?? `${field.key}-${index}`} field={field} index={index} total={fields.length} productId={selectedProduct.id} />)}
                  </div>
                )}

                {quoteComponents.length > 0 ? (
                  <section style={{ display: "grid", gap: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 18 }}>Materials added by quote choices</h3>
                    {quoteComponents.map((item, index) => <MaterialRow key={item.id ?? `${item.label}-${index}`} component={item} materialMap={materialMap} productId={selectedProduct.id} activeMaterials={activeMaterials} fields={fields} />)}
                  </section>
                ) : null}

                <details style={softCardStyle}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Optional: start from another product type</summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
                    {productTypes.map((type) => <PresetButton key={type.value} productId={selectedProduct.id} type={type} activeMaterials={activeMaterials} />)}
                  </div>
                </details>

                <details style={softCardStyle}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add a quote choice</summary>
                  <form action={addProductOptionAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Choice shown on quote</span>
                        <input name="label" placeholder="eg Laminate / Finishing / Cover colour" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Answer style</span>
                        <select name="fieldType" defaultValue="select" style={inputStyle}>
                          <option value="select">Pick one from list</option>
                          <option value="size_select">Size list</option>
                          <option value="quantity">Number / quantity</option>
                          <option value="color">Colour list</option>
                          <option value="text">Typed answer</option>
                        </select>
                      </label>
                    </div>
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Default answer</span>
                        <input name="defaultAnswer" placeholder="eg None / 600x900 / Duplicate" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Other answers</span>
                        <input name="otherOptionsCsv" placeholder="eg Gloss laminate,Matt laminate" style={inputStyle} />
                      </label>
                    </div>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Help text</span>
                      <input name="helpText" placeholder="Optional note for quoting staff" style={inputStyle} />
                    </label>
                    <button type="submit" style={buttonStyle}>Add quote choice</button>
                  </form>
                </details>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <a href={`/quotes?product=${selectedProduct.id}`} style={{ ...secondaryButtonStyle, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Preview on quote page</a>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
