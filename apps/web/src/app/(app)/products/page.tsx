import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";
import {
  addProductOptionAction,
  addQuickProductQuestionAction,
  addProductComponentAction,
  applyQuoteBehaviourPresetAction,
  createProductAction,
  deleteProductOptionAction,
  moveProductOptionAction,
  updateProductAction,
  updateProductComponentAction,
  updateProductOptionAction,
  deleteProductComponentAction
} from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type Choice = {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  widthMm?: string | number | null;
  heightMm?: string | number | null;
};

type StarterType = {
  value: string;
  label: string;
  plainName: string;
  description: string;
  quickAnswers: string;
};

const starterTypes: StarterType[] = [
  {
    value: "sign_acm",
    label: "ACM sign",
    plainName: "Sign - ACM - 3mm",
    description: "Rigid sign with size, print type, laminate, finishing, ink and quantity.",
    quickAnswers: "Size · Print · Laminate · White ink · Finish"
  },
  {
    value: "sign_corflute",
    label: "Corflute sign",
    plainName: "Sign - Corflute - 5mm",
    description: "Corflute sign with the same simple signage setup pattern.",
    quickAnswers: "Size · Print · Finish · Qty"
  },
  {
    value: "sign_acrylic",
    label: "Acrylic / PVC sign",
    plainName: "Sign - Acrylic - 4.5mm",
    description: "Sheet product where the quoted size decides sheet usage.",
    quickAnswers: "Size · Print · Cut · Qty"
  },
  {
    value: "banner",
    label: "Banner",
    plainName: "Banner",
    description: "Roll stock banner with size, finishing, ink and quantity.",
    quickAnswers: "Size · Media · Finish · Qty"
  },
  {
    value: "roll_print",
    label: "Roll print / sticker",
    plainName: "Roll Print",
    description: "Roll media print with media, laminate and quantity choices.",
    quickAnswers: "Size · Media · Laminate · Qty"
  },
  {
    value: "business_cards",
    label: "Business cards",
    plainName: "Business Cards",
    description: "Small format card product with size, sides, cello and quantity.",
    quickAnswers: "Size · Sides · Cello · Qty"
  },
  {
    value: "flyers",
    label: "Brochures / flyers",
    plainName: "Flyers / Brochures",
    description: "Small format print with size, sides, folds, cello and quantity.",
    quickAnswers: "Size · Sides · Folds · Qty"
  },
  {
    value: "carbon_books",
    label: "Duplicate / triplicate books",
    plainName: "Carbon Books",
    description: "Carbonless books with copies, colours, tape, numbering and quantity.",
    quickAnswers: "Size · Copies · Colours · Numbering"
  }
];

const optionTypes = [
  { value: "select", label: "Dropdown choices" },
  { value: "multi_select", label: "Tick multiple choices" },
  { value: "size_select", label: "Size choices" },
  { value: "yes_no", label: "Yes / No" },
  { value: "quantity", label: "Quantity" },
  { value: "number", label: "Number entry" },
  { value: "text", label: "Text box" },
  { value: "color", label: "Colour choices" }
];

const optionUsageModes = [
  { value: "none", label: "No extra cost", short: "Choice only", amountLabel: "Leave blank", amountPlaceholder: "blank" },
  { value: "auto_sheet", label: "Material from size", short: "Uses material", amountLabel: "Leave blank", amountPlaceholder: "auto" },
  { value: "parts_per_sheet", label: "Parts per sheet", short: "Uses material", amountLabel: "Parts per sheet", amountPlaceholder: "eg 8" },
  { value: "sheets_per_item", label: "Sheets per item", short: "Uses material", amountLabel: "Sheets per item", amountPlaceholder: "eg 1 or 0.25" },
  { value: "roll_metres", label: "Metres per item", short: "Uses roll", amountLabel: "Metres", amountPlaceholder: "eg 1.2" },
  { value: "sqm_charge", label: "$ per m²", short: "Adds charge", amountLabel: "Sell $/m²", amountPlaceholder: "eg 10" },
  { value: "fixed_charge", label: "$ each", short: "Adds charge", amountLabel: "Sell $ each", amountPlaceholder: "eg 15" },
  { value: "material_each", label: "Hardware / consumable each", short: "Uses hardware", amountLabel: "Qty each", amountPlaceholder: "eg 1" },
  { value: "labour_hours", label: "Labour hours", short: "Adds labour", amountLabel: "Hours", amountPlaceholder: "eg 0.25" }
];

const quickQuestionPresets = [
  {
    key: "size",
    label: "Size",
    type: "size_select",
    required: "yes",
    rows: [
      { answer: "600 x 900 mm", mode: "parts_per_sheet", amount: "8" },
      { answer: "900 x 1200 mm", mode: "parts_per_sheet", amount: "4" },
      { answer: "1200 x 2400 mm", mode: "sheets_per_item", amount: "1" }
    ]
  },
  {
    key: "print_type",
    label: "Print type",
    type: "select",
    required: "yes",
    rows: [
      { answer: "Direct print", mode: "sqm_charge", amount: "10", chargeName: "CMYK Ink" },
      { answer: "SAV 7YR", mode: "auto_sheet", amount: "" },
      { answer: "No print", mode: "none", amount: "" }
    ]
  },
  {
    key: "white_ink",
    label: "White ink",
    type: "yes_no",
    required: "yes",
    rows: [
      { answer: "No", mode: "none", amount: "" },
      { answer: "Yes", mode: "sqm_charge", amount: "10", chargeName: "White Ink" }
    ]
  },
  {
    key: "laminate",
    label: "Laminate",
    type: "select",
    required: "yes",
    rows: [
      { answer: "None", mode: "none", amount: "" },
      { answer: "Gloss laminate", mode: "auto_sheet", amount: "" },
      { answer: "Matt laminate", mode: "auto_sheet", amount: "" }
    ]
  },
  {
    key: "finishing",
    label: "Finishing",
    type: "multi_select",
    required: "no",
    rows: [
      { answer: "Jingwei cutting", mode: "labour_hours", amount: "0.25" },
      { answer: "Drill holes", mode: "labour_hours", amount: "0.10" }
    ]
  },
  {
    key: "quantity",
    label: "Quantity",
    type: "quantity",
    required: "yes",
    rows: []
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
    .replace(/(\d+)x(\d+)/i, "$1 × $2");
}

function selectedProductUrl(productId: string, query: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  return `/products?selected=${productId}${q}`;
}

function editProductUrl(productId: string, query: string, id: string): string {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  return `/products?selected=${productId}${q}&editOption=${id}`;
}

function cleanUsageNumber(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || text === "0" || text === "0.00") return "";
  return text;
}

function optionKeyValue(option: any): string {
  return String(option?.value ?? option?.label ?? "").trim();
}

function choiceLabel(option: Choice): string {
  return String(option.label ?? option.value ?? "Choice");
}

function choicesForField(field: any): Choice[] {
  return Array.isArray(field?.options) ? field.options : [];
}

function linkedOptionComponent(field: any, option: any, components: any[]): any | null {
  const fieldKey = String(field?.key ?? "");
  const optionValue = optionKeyValue(option);
  if (!fieldKey || !optionValue) return null;

  return components.find((component: any) => {
    const triggerKey = String(component?.trigger?.optionKey ?? component?.stockUsage?.optionKey ?? "");
    const values = Array.isArray(component?.trigger?.optionValues)
      ? component.trigger.optionValues
      : Array.isArray(component?.stockUsage?.optionValues)
        ? component.stockUsage.optionValues
        : [];
    const ruleType = String(component?.ruleType ?? component?.stockUsage?.usageBasis ?? "");
    return triggerKey === fieldKey && values.includes(optionValue) && ruleType !== "labour_hours" && String(component?.kind ?? "") !== "labour";
  }) ?? null;
}

function linkedLabourComponent(field: any, option: any, components: any[]): any | null {
  const fieldKey = String(field?.key ?? "");
  const optionValue = optionKeyValue(option);
  if (!fieldKey || !optionValue) return null;

  return components.find((component: any) => {
    const triggerKey = String(component?.trigger?.optionKey ?? component?.stockUsage?.optionKey ?? "");
    const values = Array.isArray(component?.trigger?.optionValues)
      ? component.trigger.optionValues
      : Array.isArray(component?.stockUsage?.optionValues)
        ? component.stockUsage.optionValues
        : [];
    const ruleType = String(component?.ruleType ?? component?.stockUsage?.usageBasis ?? "");
    return triggerKey === fieldKey && values.includes(optionValue) && (ruleType === "labour_hours" || String(component?.kind ?? "") === "labour");
  }) ?? null;
}

function optionUsageModeFromComponent(component: any): string {
  const stockUsage = component?.stockUsage ?? {};
  const ruleType = String(component?.ruleType ?? stockUsage?.usageBasis ?? "yield_based");
  if (!component) return "none";
  if (ruleType === "labour_hours" || String(component?.kind ?? "") === "labour") return "labour_hours";
  if (ruleType === "sell_sqm") return "sqm_charge";
  if (ruleType === "sell_each") return "fixed_charge";
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_unit" && String(component?.unit ?? "") === "sheet") return "sheets_per_item";
  if (ruleType === "per_unit" && String(component?.unit ?? "") !== "sheet") return "material_each";
  if (cleanUsageNumber(stockUsage?.partsPerSheet)) return "parts_per_sheet";
  if (cleanUsageNumber(stockUsage?.sheetsPerUnit)) return "sheets_per_item";
  if (cleanUsageNumber(stockUsage?.metresPerUnit)) return "roll_metres";
  if (component?.materialId) return "auto_sheet";
  return "none";
}

function optionUsageAmountFromComponent(component: any): string {
  const stockUsage = component?.stockUsage ?? {};
  const mode = optionUsageModeFromComponent(component);
  if (mode === "parts_per_sheet") return cleanUsageNumber(stockUsage?.partsPerSheet);
  if (mode === "sheets_per_item") return cleanUsageNumber(stockUsage?.sheetsPerUnit) || "1";
  if (mode === "roll_metres") return cleanUsageNumber(stockUsage?.metresPerUnit);
  if (mode === "material_each") return cleanUsageNumber(component?.quantity) || "1";
  if (mode === "labour_hours") return cleanUsageNumber(component?.quantity ?? stockUsage?.hoursPerUnit) || "";
  if (mode === "sqm_charge" || mode === "fixed_charge") return cleanUsageNumber(stockUsage?.sellRate ?? component?.quantity) || "";
  return "";
}

function optionChargeNameFromComponent(component: any): string {
  return String(component?.stockUsage?.chargeName ?? component?.label ?? "");
}

function quantityPromptFromComponent(component: any, labourComponent?: any): string {
  return String(component?.stockUsage?.quantityPrompt ?? labourComponent?.stockUsage?.quantityPrompt ?? "");
}

function quantityPresetTextFromComponent(component: any, labourComponent?: any): string {
  const presets = Array.isArray(component?.stockUsage?.quantityPresets)
    ? component.stockUsage.quantityPresets
    : Array.isArray(labourComponent?.stockUsage?.quantityPresets)
      ? labourComponent.stockUsage.quantityPresets
      : [];
  return presets
    .map((preset: any) => {
      const label = String(preset?.label ?? "").trim();
      const qty = cleanUsageNumber(preset?.qty ?? preset?.quantity);
      return label && qty ? `${label}=${qty}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function allowCustomQuantityFromComponent(component: any, labourComponent?: any): boolean {
  return Boolean(component?.stockUsage?.allowCustomQuantity ?? labourComponent?.stockUsage?.allowCustomQuantity ?? false);
}

function customQuantityLabelFromComponent(component: any, labourComponent?: any): string {
  return String(component?.stockUsage?.customQuantityLabel ?? labourComponent?.stockUsage?.customQuantityLabel ?? "Custom quantity");
}

function questionCostingText(field: any, components: any[]): string {
  const choices = choicesForField(field);
  if (!["select", "size_select", "multi_select", "color", "yes_no"].includes(String(field?.type ?? ""))) return "No pricing rows needed";
  if (choices.length === 0) return "No answers yet";
  const costed = choices.filter((choice) => {
    const linked = linkedOptionComponent(field, choice, components);
    const labour = linkedLabourComponent(field, choice, components);
    const mode = optionUsageModeFromComponent(linked);
    return Boolean(labour) || (linked && mode !== "none");
  }).length;
  return `${costed}/${choices.length} answers add pricing`;
}

function defaultAnswerText(field: any): string {
  const defaultValue = String(field?.defaultValue ?? "");
  if (!defaultValue) return "None";
  const match = choicesForField(field).find((choice) => String(choice.value ?? "") === defaultValue);
  return choiceLabel(match ?? { label: defaultValue });
}

function starterDescription(value: string): string {
  return starterTypes.find((starter) => starter.value === value)?.description ?? "Starter rows can be edited or removed after creation.";
}

function starterQuickAnswers(value: string): string {
  return starterTypes.find((starter) => starter.value === value)?.quickAnswers ?? "Quote questions can be edited after creation.";
}

const pageStyle: CSSProperties = { maxWidth: 1440, margin: "0 auto", display: "grid", gap: 18, paddingBottom: 42 };
const cardStyle: CSSProperties = { background: "rgba(255,255,255,0.96)", border: "1px solid #dfe7f2", borderRadius: 28, padding: 22, boxShadow: "0 18px 48px rgba(15,23,42,0.06)" };
const canvasStyle: CSSProperties = { ...cardStyle, padding: 0, overflow: "hidden" };
const panelStyle: CSSProperties = { border: "1px solid #dfe7f2", borderRadius: 22, padding: 16, background: "#fbfdff", display: "grid", gap: 12 };
const whitePanelStyle: CSSProperties = { ...panelStyle, background: "#ffffff" };
const inputStyle: CSSProperties = { width: "100%", minHeight: 44, borderRadius: 14, border: "1px solid #cfd9e8", padding: "0 13px", fontSize: 14, boxSizing: "border-box", background: "#fff", color: "#0f172a" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 76, padding: 12, fontFamily: "inherit" };
const labelStyle: CSSProperties = { display: "grid", gap: 6, minWidth: 0 };
const labelTextStyle: CSSProperties = { fontWeight: 900, fontSize: 12, color: "#334155" };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 };
const grid3: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 44, borderRadius: 14, border: "none", background: "#0f172a", color: "#fff", fontWeight: 950, padding: "0 16px", cursor: "pointer" };
const blueButtonStyle: CSSProperties = { ...buttonStyle, background: "#2563eb" };
const ghostStyle: CSSProperties = { minHeight: 42, borderRadius: 14, border: "1px solid #cfd9e8", background: "#fff", color: "#1e293b", fontWeight: 850, padding: "0 14px", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const dangerGhostStyle: CSSProperties = { ...ghostStyle, color: "#b42318", borderColor: "#fda29b" };
const chipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#eef4ff", color: "#1d4ed8", padding: "6px 10px", fontSize: 12, fontWeight: 950, width: "fit-content", whiteSpace: "nowrap" };
const plainChipStyle: CSSProperties = { ...chipStyle, background: "#f1f5f9", color: "#475569" };
const greenChipStyle: CSSProperties = { ...chipStyle, background: "#ecfdf3", color: "#067647" };
const yellowChipStyle: CSSProperties = { ...chipStyle, background: "#fffaeb", color: "#b54708" };
const blueChipStyle: CSSProperties = { ...chipStyle, background: "#dbeafe", color: "#1d4ed8" };
const sectionHeadingStyle: CSSProperties = { margin: 0, fontSize: 26, letterSpacing: "-0.03em" };
const mutedStyle: CSSProperties = { margin: 0, color: "#64748b", lineHeight: 1.55 };
const tinyLabelStyle: CSSProperties = { margin: 0, fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.1em", color: "#2563eb" };

function MessageBanner({ tone, children }: { tone: "success" | "error"; children: string }) {
  const success = tone === "success";
  return (
    <section style={{ border: `1px solid ${success ? "#abefc6" : "#fda29b"}`, background: success ? "#ecfdf3" : "#fff5f4", color: success ? "#067647" : "#b42318", borderRadius: 16, padding: 14, fontWeight: 850 }}>
      {children}
    </section>
  );
}

function ProductFlowHero({ selectedProduct, fields, components, activeMaterials }: { selectedProduct: any; fields: any[]; components: any[]; activeMaterials: any[] }) {
  const readyCount = [Boolean(selectedProduct), fields.length > 0, components.length > 0].filter(Boolean).length;
  return (
    <section style={{ ...cardStyle, display: "grid", gap: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <p style={tinyLabelStyle}>Products</p>
          <h1 style={{ margin: "6px 0 4px", fontSize: 34, letterSpacing: "-0.04em" }}>Product setup</h1>
          <p style={{ ...mutedStyle, maxWidth: 840 }}>
            Build one product like a simple quote sheet. Add the questions staff answer, then attach the costing to those answers.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={readyCount >= 1 ? greenChipStyle : plainChipStyle}>1 Product</span>
          <span style={readyCount >= 2 ? greenChipStyle : plainChipStyle}>2 Questions</span>
          <span style={readyCount >= 3 ? greenChipStyle : plainChipStyle}>3 Costing</span>
        </div>
      </div>
      {selectedProduct ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={blueChipStyle}>{selectedProduct.name}</span>
          <span style={plainChipStyle}>{fields.length} quote question{fields.length === 1 ? "" : "s"}</span>
          <span style={plainChipStyle}>{components.length} costing row{components.length === 1 ? "" : "s"}</span>
          <span style={plainChipStyle}>{activeMaterials.length} active material{activeMaterials.length === 1 ? "" : "s"}</span>
        </div>
      ) : null}
    </section>
  );
}

function ProductChooser({ products, filteredProducts, selectedProduct, query, activeMaterials }: { products: any[]; filteredProducts: any[]; selectedProduct: any; query: string; activeMaterials: any[] }) {
  return (
    <details open={!selectedProduct} style={{ ...cardStyle, display: "grid", gap: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 950, color: "#1e293b", fontSize: 18 }}>
        {selectedProduct ? "Change product / create another" : "Create or open a product"}
      </summary>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.9fr) minmax(320px, 1.1fr)", gap: 16, marginTop: 16 }}>
        <form action={createProductAction} style={{ ...panelStyle, background: "#f8fafc" }}>
          <div>
            <h2 style={sectionHeadingStyle}>New product</h2>
            <p style={{ ...mutedStyle, marginTop: 6 }}>Pick the closest starter. Everything it adds can be changed after the product opens.</p>
          </div>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Product name</span>
            <input name="name" required placeholder="eg Sign - ACM - 3mm" style={inputStyle} />
          </label>
          <div style={{ display: "grid", gap: 10 }}>
            <span style={labelTextStyle}>Start from</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
              {starterTypes.slice(0, 8).map((starter) => (
                <label key={starter.value} style={{ ...whitePanelStyle, cursor: "pointer", gap: 8 }}>
                  <input type="radio" name="starterType" value={starter.value} defaultChecked={starter.value === "sign_acm"} />
                  <strong>{starter.label}</strong>
                  <p style={mutedStyle}>{starter.quickAnswers}</p>
                </label>
              ))}
            </div>
          </div>
          <details style={{ ...whitePanelStyle }}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>Optional: link main material now</summary>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
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
              <input type="hidden" name="baseUsage" value="part_sheet" />
            </div>
          </details>
          <button type="submit" style={blueButtonStyle}>Create and open</button>
        </form>

        <section style={{ ...panelStyle, background: "#fff" }}>
          <div>
            <h2 style={sectionHeadingStyle}>Open existing</h2>
            <p style={{ ...mutedStyle, marginTop: 6 }}>{products.length} products available.</p>
          </div>
          <form method="get" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
            <input name="q" defaultValue={query} placeholder="Search products" style={inputStyle} />
            <button type="submit" style={ghostStyle}>Search</button>
          </form>
          <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
            {filteredProducts.length === 0 ? (
              <div style={panelStyle}>No matching products.</div>
            ) : (
              filteredProducts.map((product) => (
                <Link key={product.id} href={selectedProductUrl(product.id, query)} style={{ ...whitePanelStyle, textDecoration: "none", color: "inherit", background: selectedProduct?.id === product.id ? "#eef2ff" : "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{product.name}</strong>
                    <span style={selectedProduct?.id === product.id ? blueChipStyle : plainChipStyle}>{selectedProduct?.id === product.id ? "Open" : humanize(product.status)}</span>
                  </div>
                  <div style={mutedStyle}>{product.sku || "No SKU"} · {humanize(product.productFamily)}</div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </details>
  );
}

function ProductBasicsPanel({ selectedProduct }: { selectedProduct: any }) {
  return (
    <details style={{ ...whitePanelStyle }}>
      <summary style={{ cursor: "pointer", fontWeight: 950 }}>Product basics</summary>
      <form action={updateProductAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="hidden" name="productId" value={selectedProduct.id} />
        <input type="hidden" name="defaultTemplateId" value={selectedProduct.defaultTemplateId ?? ""} />
        <label style={labelStyle}>
          <span style={labelTextStyle}>Product name</span>
          <input name="name" defaultValue={selectedProduct.name} required style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>SKU / code</span>
          <input name="sku" defaultValue={selectedProduct.sku ?? ""} style={inputStyle} />
        </label>
        <div style={grid2}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Status</span>
            <select name="status" defaultValue={selectedProduct.status ?? "draft"} style={inputStyle}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Department</span>
            <select name="department" defaultValue={selectedProduct.department ?? "signage"} style={inputStyle}>
              <option value="signage">Signage</option>
              <option value="small_format">Small format</option>
              <option value="install">Install</option>
              <option value="outsourced">Outsourced</option>
            </select>
          </label>
        </div>
        <input type="hidden" name="productFamily" value={selectedProduct.productFamily ?? "rigid_signage"} />
        <button type="submit" style={buttonStyle}>Save product basics</button>
      </form>
    </details>
  );
}

function PresetRowsPanel({ productId, activeMaterials, selectedStarterType }: { productId: string; activeMaterials: any[]; selectedStarterType: string }) {
  return (
    <details style={{ ...whitePanelStyle }}>
      <summary style={{ cursor: "pointer", fontWeight: 950 }}>Reset / add starter cards</summary>
      <form action={applyQuoteBehaviourPresetAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="hidden" name="productId" value={productId} />
        <p style={mutedStyle}>Adds editable starter quote cards. Existing cards with the same key are not duplicated.</p>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Starter type</span>
          <select name="starterType" defaultValue={selectedStarterType || "sign_acm"} style={inputStyle}>
            {starterTypes.map((starter) => (
              <option key={starter.value} value={starter.value}>{starter.label}</option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Main stock/material</span>
          <select name="baseMaterialId" defaultValue="" style={inputStyle}>
            <option value="">Do not add stock now</option>
            {activeMaterials.map((material) => (
              <option key={material.id} value={material.id}>{material.name}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="baseUsage" value="part_sheet" />
        <button type="submit" style={ghostStyle}>Add starter cards</button>
      </form>
    </details>
  );
}

function BuilderHelpPanel() {
  return (
    <aside style={{ display: "grid", gap: 12 }}>
      <div style={{ ...whitePanelStyle, background: "#eff6ff", borderColor: "#bfdbfe" }}>
        <span style={blueChipStyle}>No training flow</span>
        <strong style={{ fontSize: 20 }}>How to build it</strong>
        <div style={{ display: "grid", gap: 10 }}>
          <StepNumber number="1" title="Add the question" body="Example: Size, Print type, White ink, Laminate, Finishing." />
          <StepNumber number="2" title="Add answer lines" body="Example: 600 × 900mm, SAV 7YR, Yes, Matt laminate, Jingwei cutting." />
          <StepNumber number="3" title="Choose what each answer adds" body="No cost, material from size, parts per sheet, $/m², labour, or $ each." />
        </div>
      </div>
      <div style={whitePanelStyle}>
        <strong>Common recipes</strong>
        <RecipeLine label="ACM size" body="Parts per sheet, eg 600×900 = 8" />
        <RecipeLine label="Roll vinyl" body="Material from size, linked to roll stock" />
        <RecipeLine label="CMYK ink" body="$ per m², rate 10" />
        <RecipeLine label="White ink" body="Yes answer = $ per m², rate 10" />
        <RecipeLine label="Labour" body="Choose Labour hours, eg 0.25 at $66/hr" />
        <RecipeLine label="Eyelets" body="Hardware each + ask placement presets like 4 corners=4" />
        <RecipeLine label="No laminate" body="No extra cost" />
      </div>
    </aside>
  );
}

function StepNumber({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "start" }}>
      <span style={{ ...blueChipStyle, width: 32, height: 32, padding: 0, justifyContent: "center" }}>{number}</span>
      <div>
        <strong>{title}</strong>
        <p style={mutedStyle}>{body}</p>
      </div>
    </div>
  );
}

function RecipeLine({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
      <strong>{label}</strong>
      <p style={mutedStyle}>{body}</p>
    </div>
  );
}

function AnswerPills({ field, components }: { field: any; components: any[] }) {
  const choices = choicesForField(field);
  if (!["select", "size_select", "multi_select", "color", "yes_no"].includes(String(field?.type ?? ""))) {
    return <span style={plainChipStyle}>{String(field?.type ?? "text") === "quantity" ? "Entered as quantity" : "Typed by staff"}</span>;
  }

  if (choices.length === 0) return <span style={yellowChipStyle}>Needs answers</span>;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {choices.map((choice) => {
        const linked = linkedOptionComponent(field, choice, components);
        const labour = linkedLabourComponent(field, choice, components);
        const mode = optionUsageModeFromComponent(linked);
        const chip = labour ? yellowChipStyle : mode === "none" ? plainChipStyle : mode.includes("charge") ? blueChipStyle : greenChipStyle;
        return <span key={String(choice.id ?? choice.value ?? choice.label)} style={chip}>{choiceLabel(choice)}</span>;
      })}
    </div>
  );
}

function QuestionCard({ field, index, selectedProduct, query, components, isEditing, activeMaterials, fields }: { field: any; index: number; selectedProduct: any; query: string; components: any[]; isEditing: boolean; activeMaterials: any[]; fields: any[] }) {
  const currentShowWhenKey = String(field?.showWhen?.optionKey ?? "");
  const showWhenValues = Array.isArray(field?.showWhen?.optionValues) ? field.showWhen.optionValues.join(", ") : "";
  const questionId = String(field.id ?? "");

  return (
    <article style={{ ...whitePanelStyle, background: isEditing ? "#f8fbff" : "#fff", borderColor: isEditing ? "#93c5fd" : "#dfe7f2" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "start" }}>
        <div style={{ ...blueChipStyle, width: 36, height: 36, padding: 0, justifyContent: "center" }}>{index + 1}</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 22 }}>{field.label}</h3>
            <span style={plainChipStyle}>{humanize(field.type)}</span>
            <span style={field.required === false ? yellowChipStyle : greenChipStyle}>{field.required === false ? "Optional" : "Required"}</span>
          </div>
          <p style={mutedStyle}>Default: {defaultAnswerText(field)} · {questionCostingText(field, components)}</p>
          <AnswerPills field={field} components={components} />
          {field.showWhen?.optionKey ? <p style={mutedStyle}>Only shown when <b>{field.showWhen.optionKey}</b> is {showWhenValues || "selected"}</p> : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <form action={moveProductOptionAction}>
            <input type="hidden" name="productId" value={selectedProduct.id} />
            <input type="hidden" name="fieldId" value={questionId} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" style={ghostStyle}>↑</button>
          </form>
          <form action={moveProductOptionAction}>
            <input type="hidden" name="productId" value={selectedProduct.id} />
            <input type="hidden" name="fieldId" value={questionId} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" style={ghostStyle}>↓</button>
          </form>
          <Link href={editProductUrl(selectedProduct.id, query, questionId)} style={ghostStyle}>{isEditing ? "Editing" : "Edit"}</Link>
        </div>
      </div>

      {isEditing ? (
        <form action={updateProductOptionAction} style={{ display: "grid", gap: 14, borderTop: "1px solid #dbe7f5", paddingTop: 14, marginTop: 14 }}>
          <input type="hidden" name="productId" value={selectedProduct.id} />
          <input type="hidden" name="fieldId" value={questionId} />
          <QuestionBasics field={field} />
          <VisualAnswerBuilder materials={activeMaterials} field={field} components={components} />
          <AdvancedQuestionSettings fields={fields} field={field} currentShowWhenKey={currentShowWhenKey} showWhenValues={showWhenValues} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" style={blueButtonStyle}>Save question</button>
              <Link href={selectedProductUrl(selectedProduct.id, query)} style={ghostStyle}>Cancel</Link>
            </div>
            <button type="submit" formAction={deleteProductOptionAction} style={dangerGhostStyle}>Remove question</button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function QuestionBasics({ field }: { field?: any }) {
  return (
    <div style={grid3}>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Question staff see</span>
        <input name="label" defaultValue={String(field?.label ?? "")} placeholder="eg Size, Print type, White ink" style={inputStyle} />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>How staff answer</span>
        <select name="fieldType" defaultValue={String(field?.type ?? "select")} style={inputStyle}>
          {optionTypes.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Required?</span>
        <select name="required" defaultValue={field?.required === false ? "no" : "yes"} style={inputStyle}>
          <option value="yes">Required</option>
          <option value="no">Optional</option>
        </select>
      </label>
    </div>
  );
}

function VisualAnswerBuilder({ materials, field, components = [] }: { materials: any[]; field?: any; components?: any[] }) {
  const options = choicesForField(field);
  const existingRows = options.map((choice: any) => ({ choice, component: linkedOptionComponent(field, choice, components) }));
  const blankCount = field ? Math.max(1, 3 - existingRows.length) : 3;
  const rows = [
    ...existingRows,
    ...Array.from({ length: blankCount }, (_, index) => ({ choice: null, component: null, blankId: `blank-${index}` }))
  ];

  return (
    <section style={{ ...panelStyle, background: "#f8fafc", borderColor: "#bfdbfe" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <strong style={{ fontSize: 18 }}>Answers staff can pick</strong>
          <p style={{ ...mutedStyle, marginTop: 4 }}>
            Keep this like a quote sheet: answer on the left, what it adds on the right.
          </p>
        </div>
        <span style={blueChipStyle}>Simple</span>
      </div>

      {materials.length === 0 ? (
        <div style={{ ...whitePanelStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
          <strong>No active materials yet</strong>
          <p style={mutedStyle}>You can still add choices like CMYK ink or White ink. Link stock materials later.</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(170px, 1.15fr) minmax(145px, 0.85fr) minmax(155px, 0.95fr) minmax(90px, 0.45fr) minmax(90px, 0.45fr)", gap: 10, padding: "0 4px" }}>
          <span style={labelTextStyle}>Answer</span>
          <span style={labelTextStyle}>Adds</span>
          <span style={labelTextStyle}>Material</span>
          <span style={labelTextStyle}>Amount / rate</span>
          <span style={labelTextStyle}>Labour hrs</span>
        </div>

        {rows.map((row: any, index: number) => {
          const component = row.component;
          const choice = row.choice;
          const labourComponent = choice ? linkedLabourComponent(field, choice, components) : null;
          const usageMode = component ? optionUsageModeFromComponent(component) : "none";
          const usageMeta = optionUsageModes.find((mode) => mode.value === usageMode) ?? optionUsageModes[0];
          const isCharge = usageMode === "sqm_charge" || usageMode === "fixed_charge";
          const isConsumableEach = usageMode === "material_each";
          const isLabour = usageMode === "labour_hours";
          const hasCost = Boolean(component?.materialId) || isCharge || isConsumableEach || isLabour;

          return (
            <div key={choice?.id ?? row.blankId ?? index} style={{ display: "grid", gridTemplateColumns: "minmax(170px, 1.15fr) minmax(145px, 0.85fr) minmax(155px, 0.95fr) minmax(90px, 0.45fr) minmax(90px, 0.45fr)", gap: 10, alignItems: "center", border: "1px solid #dbe7f5", borderRadius: 18, background: choice ? "#fff" : "#fbfdff", padding: 10 }}>
              <label style={labelStyle}>
                <span style={{ ...labelTextStyle, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={hasCost ? greenChipStyle : plainChipStyle}>{index + 1}</span>
                  {choice ? "Existing answer" : "New answer"}
                </span>
                <input name="optionAnswerLabel" defaultValue={String(choice?.label ?? "")} placeholder="eg 600 x 900mm" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Cost type</span>
                <select name="optionUsageMode" defaultValue={usageMode} style={inputStyle}>
                  {optionUsageModes.map((mode) => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>{isCharge || isLabour ? "Not needed" : "Stock/material"}</span>
                <select name="optionMaterialId" defaultValue={String(component?.materialId ?? "")} style={inputStyle}>
                  <option value="">No material</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>{material.name}</option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>{usageMeta.amountLabel}</span>
                <input name="optionUsageAmount" defaultValue={optionUsageAmountFromComponent(component)} placeholder={usageMeta.amountPlaceholder} style={inputStyle} />
                <input type="hidden" name="optionWastePercent" value={String(component?.wastePercent ?? (isCharge || isConsumableEach ? "0" : "10"))} />
                <input type="hidden" name="optionChargeName" value={isCharge || isLabour ? optionChargeNameFromComponent(component) : ""} />
                <input type="hidden" name="optionLabourRate" value={isLabour ? String(component?.stockUsage?.sellRate ?? "66") : "66"} />
                <input type="hidden" name="optionNotes" value={String(component?.notes ?? "")} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Extra labour</span>
                <input name="optionLabourHours" defaultValue={cleanUsageNumber(labourComponent?.quantity)} placeholder="eg 0.25" style={inputStyle} />
                <input type="hidden" name="optionLabourName" value={String(labourComponent?.label ?? "")} />
              </label>
              <details style={{ gridColumn: "1 / -1", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 900, color: "#475569" }}>More for this answer: ask quantity / placement</summary>
                <div style={{ ...grid3, marginTop: 10 }}>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Ask this when picked</span>
                    <input name="optionQuantityPrompt" defaultValue={quantityPromptFromComponent(component, labourComponent)} placeholder="eg Eyelet placement" style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Quantity presets</span>
                    <textarea name="optionQuantityPresets" defaultValue={quantityPresetTextFromComponent(component, labourComponent)} placeholder={"4 corners=4\nTop corners only=2\nCustom=custom"} style={{ ...textareaStyle, minHeight: 92 }} />
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Custom quantity?</span>
                    <select name="optionAllowCustomQuantity" defaultValue={allowCustomQuantityFromComponent(component, labourComponent) ? "yes" : "no"} style={inputStyle}>
                      <option value="no">No</option>
                      <option value="yes">Allow staff to type qty</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Custom label</span>
                    <input name="optionCustomQuantityLabel" defaultValue={customQuantityLabelFromComponent(component, labourComponent)} placeholder="eg Custom quantity" style={inputStyle} />
                  </label>
                </div>
                <p style={{ ...mutedStyle, fontSize: 13, marginTop: 8 }}>Use this for eyelets, drill holes, standoffs, pole pockets, or anything where staff pick a placement and the app turns it into a quantity.</p>
              </details>
            </div>
          );
        })}
      </div>

      <div style={{ ...whitePanelStyle, background: "#fff" }}>
        <strong>Examples</strong>
        <p style={mutedStyle}>ACM size: <b>Parts per sheet</b> + ACM + <b>8</b>. Ink: <b>$ per m²</b> + no material + <b>10</b>. Print setup / laminate apply / Jingwei: add <b>Labour hrs</b> like <b>0.25</b> on the same answer line. Roll vinyl: <b>Material from size</b> + SAV roll stock. Eyelets: <b>Hardware / consumable each</b> + Eyelet material + ask placement presets.</p>
      </div>
    </section>
  );
}

function AdvancedQuestionSettings({ fields, field, currentShowWhenKey, showWhenValues }: { fields: any[]; field?: any; currentShowWhenKey?: string; showWhenValues?: string }) {
  const missingShowWhenOption = currentShowWhenKey && !fields.some((item: any) => String(item.key ?? "") === currentShowWhenKey);
  return (
    <details style={whitePanelStyle}>
      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Advanced: when to show this question</summary>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <div style={grid3}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Internal key</span>
            <input name="key" defaultValue={String(field?.key ?? "")} placeholder="Optional - generated from label" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Only show after question</span>
            <select name="showWhenOptionKey" defaultValue={currentShowWhenKey ?? ""} style={inputStyle}>
              <option value="">Always show</option>
              {missingShowWhenOption ? <option value={currentShowWhenKey}>{currentShowWhenKey}</option> : null}
              {fields.filter((item: any) => String(item.id ?? "") !== String(field?.id ?? "")).map((item: any) => (
                <option key={item.id ?? item.key} value={String(item.key ?? "")}>{item.label}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Show only for answers</span>
            <input name="showWhenOptionValuesCsv" defaultValue={showWhenValues ?? ""} placeholder="eg roll_stock" style={inputStyle} />
          </label>
        </div>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Help text</span>
          <input name="helpText" defaultValue={String(field?.helpText ?? "")} placeholder="Explain this question if needed" style={inputStyle} />
        </label>
      </div>
    </details>
  );
}

function questionAlreadyExists(fields: any[], preset: (typeof quickQuestionPresets)[number]): boolean {
  const key = String(preset.key ?? "");
  return fields.some((field: any) => {
    const fieldKey = String(field.key ?? "").toLowerCase();
    const fieldLabel = String(field.label ?? "").toLowerCase();
    const fieldType = String(field.type ?? "").toLowerCase();

    if (key === "size") return fieldType === "size_select" || fieldKey.includes("size") || fieldLabel.includes("size");
    if (key === "print_type") return fieldKey.includes("print") || fieldLabel.includes("print");
    if (key === "white_ink") return (fieldKey.includes("white") && fieldKey.includes("ink")) || (fieldLabel.includes("white") && fieldLabel.includes("ink"));
    if (key === "laminate") return fieldKey.includes("laminate") || fieldLabel.includes("laminate");
    if (key === "finishing") return fieldKey.includes("finish") || fieldLabel.includes("finish");
    if (key === "quantity") return fieldType === "quantity" || fieldKey === "quantity" || fieldLabel === "quantity";

    return fieldKey === key;
  });
}

function QuickQuestionButton({ selectedProductId, preset, activeMaterials }: { selectedProductId: string; preset: (typeof quickQuestionPresets)[number]; activeMaterials: any[] }) {
  const firstMaterialId = activeMaterials[0]?.id ? String(activeMaterials[0].id) : "";
  return (
    <form action={addQuickProductQuestionAction} method="post" style={{ margin: 0 }}>
      <input type="hidden" name="productId" value={selectedProductId} />
      <input type="hidden" name="presetKey" value={preset.key} />
      <input type="hidden" name="fallbackMaterialId" value={firstMaterialId} />
      <button type="submit" style={{ ...ghostStyle, width: "100%", minHeight: 54, justifyContent: "space-between", gap: 10 }}>
        <span>+ {preset.label}</span>
        <small style={{ color: "#64748b", fontWeight: 800 }}>{preset.rows.length ? `${preset.rows.length} answers` : "qty"}</small>
      </button>
    </form>
  );
}

function AddedQuestionChip({ preset }: { preset: (typeof quickQuestionPresets)[number] }) {
  return (
    <div style={{ ...ghostStyle, minHeight: 54, justifyContent: "space-between", gap: 10, cursor: "default", opacity: 0.72 }}>
      <span>✓ {preset.label}</span>
      <small style={{ color: "#64748b", fontWeight: 800 }}>added</small>
    </div>
  );
}

function AddQuestionPanel({ selectedProduct, activeMaterials, fields }: { selectedProduct: any; activeMaterials: any[]; fields: any[] }) {
  const addedPresets = quickQuestionPresets.filter((preset) => questionAlreadyExists(fields, preset));
  const missingPresets = quickQuestionPresets.filter((preset) => !questionAlreadyExists(fields, preset));

  return (
    <section style={{ ...panelStyle, background: "#f8fafc", borderStyle: "dashed" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 22 }}>Add the next question</h3>
          <p style={{ ...mutedStyle, marginTop: 4 }}>Only missing questions are clickable now. Already-added questions show with a tick so it is obvious what happened.</p>
        </div>
        <span style={missingPresets.length ? yellowChipStyle : greenChipStyle}>{missingPresets.length ? "Next" : "All common questions added"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {missingPresets.map((preset) => (
          <QuickQuestionButton key={preset.key} selectedProductId={selectedProduct.id} preset={preset} activeMaterials={activeMaterials} />
        ))}
        {addedPresets.map((preset) => (
          <AddedQuestionChip key={`added-${preset.key}`} preset={preset} />
        ))}
      </div>
      {activeMaterials.length === 0 ? <p style={mutedStyle}>Material-linked choices can be connected after materials are added.</p> : null}

      <details style={{ ...whitePanelStyle }}>
        <summary style={{ cursor: "pointer", fontWeight: 950 }}>Need a custom question?</summary>
        <form action={addProductOptionAction} method="post" style={{ display: "grid", gap: 14, marginTop: 12 }}>
          <input type="hidden" name="productId" value={selectedProduct.id} />
          <QuestionBasics />
          <VisualAnswerBuilder materials={activeMaterials} components={[]} />
          <AdvancedQuestionSettings fields={fields} />
          <button type="submit" style={blueButtonStyle}>Save custom question</button>
        </form>
      </details>
    </section>
  );
}



function componentRuleType(component: any): string {
  return String(component?.ruleType ?? component?.stockUsage?.usageBasis ?? "yield_based");
}

function componentTriggerText(component: any, fields: any[]): string {
  const optionKey = String(component?.trigger?.optionKey ?? component?.stockUsage?.optionKey ?? "");
  const values = Array.isArray(component?.trigger?.optionValues)
    ? component.trigger.optionValues
    : Array.isArray(component?.stockUsage?.optionValues)
      ? component.stockUsage.optionValues
      : [];

  if (!optionKey || values.length === 0) return "Always included";
  const fieldLabel = fields.find((field: any) => String(field.key ?? "") === optionKey)?.label ?? humanize(optionKey);
  return `${fieldLabel}: ${values.map(humanize).join(", ")}`;
}

function recipeRowType(component: any): "material" | "charge" | "labour" | "outsource" {
  const kind = String(component?.kind ?? "material");
  const role = String(component?.role ?? "");
  const ruleType = componentRuleType(component);
  if (kind === "labour" || ruleType === "labour_hours") return "labour";
  if (kind === "outsourced" || role.includes("outsource") || ruleType === "outsourced_each") return "outsource";
  if (["sell_sqm", "sell_each"].includes(ruleType) || role === "quote_sell_charge") return "charge";
  return "material";
}

function recipeBasisText(component: any): string {
  const ruleType = componentRuleType(component);
  const stockUsage = component?.stockUsage ?? {};
  if (ruleType === "sell_sqm") return `$${cleanUsageNumber(stockUsage.sellRate ?? component.quantity) || "0"} / m²`;
  if (ruleType === "sell_each") return `$${cleanUsageNumber(stockUsage.sellRate ?? component.quantity) || "0"} each`;
  if (ruleType === "labour_hours") return `${cleanUsageNumber(component.quantity) || "0"} hr × $${cleanUsageNumber(stockUsage.sellRate) || "0"}/hr`;
  if (ruleType === "outsourced_each") return `${cleanUsageNumber(component.quantity) || "1"} × $${cleanUsageNumber(stockUsage.sellRate) || "0"}`;
  if (ruleType === "per_linear_metre") return cleanUsageNumber(stockUsage.metresPerUnit) ? `${cleanUsageNumber(stockUsage.metresPerUnit)} lm each` : "Roll length from size";
  if (ruleType === "per_sqm") return "Square metres from size";
  if (ruleType === "per_unit") return String(component.unit ?? "each") === "sheet" ? `${cleanUsageNumber(stockUsage.sheetsPerUnit) || "1"} sheet each` : `${cleanUsageNumber(component.quantity) || "1"} each`;
  if (cleanUsageNumber(stockUsage.partsPerSheet)) return `1 sheet makes ${cleanUsageNumber(stockUsage.partsPerSheet)}`;
  return "Part sheet from size";
}

function materialNameFor(component: any, materials: any[]): string {
  if (!component?.materialId) return "No material";
  return materials.find((material: any) => String(material.id) === String(component.materialId))?.name ?? "Linked material";
}

function RecipeRowCard({ component, fields, materials }: { component: any; fields: any[]; materials: any[] }) {
  const type = recipeRowType(component);
  const chip = type === "material" ? greenChipStyle : type === "charge" ? blueChipStyle : type === "labour" ? yellowChipStyle : plainChipStyle;
  return (
    <div style={{ ...whitePanelStyle, gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <strong>{component.label}</strong>
          <p style={mutedStyle}>{type === "material" ? materialNameFor(component, materials) : humanize(type)} · {recipeBasisText(component)}</p>
        </div>
        <span style={chip}>{humanize(type)}</span>
      </div>
      <p style={{ ...mutedStyle, fontSize: 13 }}>{componentTriggerText(component, fields)}</p>
    </div>
  );
}

function ExistingRecipeRows({ title, emptyText, rows, fields, materials }: { title: string; emptyText: string; rows: any[]; fields: any[]; materials: any[] }) {
  return (
    <section style={{ ...panelStyle, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>{title}</strong>
        <span style={plainChipStyle}>{rows.length} row{rows.length === 1 ? "" : "s"}</span>
      </div>
      {rows.length === 0 ? (
        <p style={mutedStyle}>{emptyText}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((component: any) => <RecipeRowCard key={component.id ?? component.label} component={component} fields={fields} materials={materials} />)}
        </div>
      )}
    </section>
  );
}

function AppliesWhenFields({ fields }: { fields: any[] }) {
  return (
    <details style={{ ...whitePanelStyle, background: "#fbfdff" }}>
      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Optional: only use this row for certain quote answers</summary>
      <div style={{ ...grid2, marginTop: 12 }}>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Question</span>
          <select name="triggerOptionKey" defaultValue="" style={inputStyle}>
            <option value="">Always included</option>
            {fields.map((field: any) => <option key={field.id ?? field.key} value={String(field.key ?? "")}>{field.label}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span style={labelTextStyle}>Answers</span>
          <input name="triggerOptionValuesCsv" placeholder="eg matte_laminate, gloss_laminate" style={inputStyle} />
        </label>
      </div>
    </details>
  );
}

function AddMaterialRecipeRow({ productId, materials, fields }: { productId: string; materials: any[]; fields: any[] }) {
  return (
    <details style={whitePanelStyle}>
      <summary style={{ cursor: "pointer", fontWeight: 950 }}>+ Add material / stock row</summary>
      <form action={addProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="kind" value="material" />
        <div style={grid3}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Row name</span>
            <input name="label" placeholder="eg ACM sheet, SAV 7YR, Matt laminate" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Material from stock list</span>
            <select name="materialId" defaultValue="" style={inputStyle}>
              <option value="">Choose material</option>
              {materials.map((material: any) => <option key={material.id} value={material.id}>{material.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>How it is used</span>
            <select name="baseUsage" defaultValue="part_sheet" style={inputStyle}>
              <option value="part_sheet">Part sheet from quoted size</option>
              <option value="roll_metres">Roll metres from quoted size</option>
              <option value="area">Square metres from quoted size</option>
              <option value="whole_sheet">Whole sheet each</option>
              <option value="each">Each / fixed item</option>
            </select>
          </label>
        </div>
        <div style={grid3}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Qty / allowance</span>
            <input name="quantity" defaultValue="1" placeholder="usually 1" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Waste %</span>
            <input name="wastePercent" defaultValue="10" placeholder="eg 10" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Unit label</span>
            <input name="unit" placeholder="sheet, lm, each" style={inputStyle} />
          </label>
        </div>
        <AppliesWhenFields fields={fields} />
        <label style={labelStyle}>
          <span style={labelTextStyle}>Note</span>
          <input name="notes" placeholder="eg roll length comes from finished size" style={inputStyle} />
        </label>
        <button type="submit" style={blueButtonStyle}>Add material row</button>
      </form>
    </details>
  );
}

function AddChargeRecipeRow({ productId, fields }: { productId: string; fields: any[] }) {
  return (
    <details style={whitePanelStyle}>
      <summary style={{ cursor: "pointer", fontWeight: 950 }}>+ Add ink / production charge</summary>
      <form action={addProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="kind" value="material" />
        <div style={grid3}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Charge name</span>
            <input name="label" placeholder="eg CMYK Ink, White Ink" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Charge type</span>
            <select name="baseUsage" defaultValue="sell_sqm" style={inputStyle}>
              <option value="sell_sqm">Sell $ per m²</option>
              <option value="sell_each">Sell $ each</option>
            </select>
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Sell rate</span>
            <input name="sellRate" placeholder="eg 10" style={inputStyle} />
          </label>
        </div>
        <input type="hidden" name="quantity" value="1" />
        <input type="hidden" name="wastePercent" value="0" />
        <AppliesWhenFields fields={fields} />
        <label style={labelStyle}>
          <span style={labelTextStyle}>Note</span>
          <input name="notes" placeholder="eg finished area × $10/m²" style={inputStyle} />
        </label>
        <button type="submit" style={blueButtonStyle}>Add charge row</button>
      </form>
    </details>
  );
}

function AddLabourRecipeRow({ productId, fields }: { productId: string; fields: any[] }) {
  return (
    <details style={whitePanelStyle}>
      <summary style={{ cursor: "pointer", fontWeight: 950 }}>+ Add factory labour row</summary>
      <form action={addProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="kind" value="labour" />
        <input type="hidden" name="baseUsage" value="labour_hours" />
        <div style={grid3}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Labour name</span>
            <input name="label" placeholder="eg Print setup, Laminate apply, Jingwei" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Hours per item</span>
            <input name="quantity" placeholder="eg 0.25" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Rate $/hr</span>
            <input name="sellRate" defaultValue="66" style={inputStyle} />
          </label>
        </div>
        <input type="hidden" name="wastePercent" value="0" />
        <AppliesWhenFields fields={fields} />
        <label style={labelStyle}>
          <span style={labelTextStyle}>Note</span>
          <input name="notes" placeholder="eg only when Jingwei is selected" style={inputStyle} />
        </label>
        <button type="submit" style={blueButtonStyle}>Add labour row</button>
      </form>
    </details>
  );
}

function AddOutsourceRecipeRow({ productId, fields }: { productId: string; fields: any[] }) {
  return (
    <details style={whitePanelStyle}>
      <summary style={{ cursor: "pointer", fontWeight: 950 }}>+ Add outsourced / supplier row</summary>
      <form action={addProductComponentAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="kind" value="outsourced" />
        <input type="hidden" name="baseUsage" value="outsourced_each" />
        <div style={grid3}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Supplier row name</span>
            <input name="label" placeholder="eg Laser cut letters, powder coat" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Qty per item</span>
            <input name="quantity" defaultValue="1" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>Cost / sell each</span>
            <input name="sellRate" placeholder="eg 120" style={inputStyle} />
          </label>
        </div>
        <input type="hidden" name="wastePercent" value="0" />
        <AppliesWhenFields fields={fields} />
        <label style={labelStyle}>
          <span style={labelTextStyle}>Note</span>
          <input name="notes" placeholder="eg ordered from supplier" style={inputStyle} />
        </label>
        <button type="submit" style={blueButtonStyle}>Add outsourced row</button>
      </form>
    </details>
  );
}

function SpreadsheetRecipeRows({ selectedProduct, fields, components, materials }: { selectedProduct: any; fields: any[]; components: any[]; materials: any[] }) {
  const materialRows = components.filter((component: any) => recipeRowType(component) === "material");
  const chargeRows = components.filter((component: any) => recipeRowType(component) === "charge");
  const labourRows = components.filter((component: any) => recipeRowType(component) === "labour");
  const outsourceRows = components.filter((component: any) => recipeRowType(component) === "outsource");

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        <div style={{ ...whitePanelStyle, background: "#f6fef9", borderColor: "#abefc6" }}>
          <span style={greenChipStyle}>1</span>
          <strong>Materials / stock</strong>
          <p style={mutedStyle}>Sheets, roll media, laminate, fixings and consumables.</p>
        </div>
        <div style={{ ...whitePanelStyle, background: "#eff6ff", borderColor: "#bfdbfe" }}>
          <span style={blueChipStyle}>2</span>
          <strong>Ink / charges</strong>
          <p style={mutedStyle}>Simple charges like $10/m² CMYK and $10/m² white ink.</p>
        </div>
        <div style={{ ...whitePanelStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
          <span style={yellowChipStyle}>3</span>
          <strong>Factory labour</strong>
          <p style={mutedStyle}>Artwork, setup, cutting, laminating and finishing time.</p>
        </div>
        <div style={{ ...whitePanelStyle }}>
          <span style={plainChipStyle}>4</span>
          <strong>Supplier / outsource</strong>
          <p style={mutedStyle}>Any supplier cost or bought-in production item.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(300px, 1fr)", gap: 14 }}>
        <ExistingRecipeRows title="Materials this item uses" emptyText="No material rows yet." rows={materialRows} fields={fields} materials={materials} />
        <ExistingRecipeRows title="Ink / production charges" emptyText="No charge rows yet." rows={chargeRows} fields={fields} materials={materials} />
        <ExistingRecipeRows title="Factory labour" emptyText="No labour rows yet." rows={labourRows} fields={fields} materials={materials} />
        <ExistingRecipeRows title="Outsourced / supplier items" emptyText="No outsourced rows yet." rows={outsourceRows} fields={fields} materials={materials} />
      </div>

      <section style={{ ...panelStyle, background: "#f8fafc", borderStyle: "dashed" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 22 }}>Add a recipe row</h3>
          <p style={{ ...mutedStyle, marginTop: 4 }}>This now matches the spreadsheet idea: one row for each material, charge, labour line or outsourced item.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 12 }}>
          <AddMaterialRecipeRow productId={selectedProduct.id} materials={materials} fields={fields} />
          <AddChargeRecipeRow productId={selectedProduct.id} fields={fields} />
          <AddLabourRecipeRow productId={selectedProduct.id} fields={fields} />
          <AddOutsourceRecipeRow productId={selectedProduct.id} fields={fields} />
        </div>
      </section>
    </section>
  );
}


type ProductBuildSlot = {
  key: string;
  label: string;
  chooseLabel: string;
  description: string;
  baseUsage: string;
  role: string;
  kind: string;
  componentLabel: string;
  materialFilter: string;
  triggerOptionKey?: string;
  triggerOptionValuesCsv?: string;
  defaultQuantity?: string;
  defaultWaste?: string;
};

const productBuildSlots: ProductBuildSlot[] = [
  {
    key: "substrate",
    label: "Substrate",
    chooseLabel: "Choose substrate",
    description: "The main sheet, board, acrylic, corflute or panel this product is made from.",
    baseUsage: "part_sheet",
    role: "base_material",
    kind: "material",
    componentLabel: "Substrate",
    materialFilter: "substrate",
    defaultWaste: "10"
  },
  {
    key: "print_media",
    label: "Print media",
    chooseLabel: "Choose print media",
    description: "Roll stock or print media used when the product is not direct printed.",
    baseUsage: "roll_metres",
    role: "quote_selected_material",
    kind: "material",
    componentLabel: "Print media",
    materialFilter: "print_media",
    triggerOptionKey: "print_type",
    triggerOptionValuesCsv: "sav_7yr, roll_stock, roll_stock_applied, clear_reverse, white"
  },
  {
    key: "ink",
    label: "Ink / print charge",
    chooseLabel: "Add ink charge",
    description: "CMYK and white ink charges, usually priced by finished square metres.",
    baseUsage: "sell_sqm",
    role: "quote_sell_charge",
    kind: "material",
    componentLabel: "CMYK Ink",
    materialFilter: "charge",
    triggerOptionKey: "print_type",
    triggerOptionValuesCsv: "direct_print, sav_7yr, roll_stock, roll_stock_applied"
  },
  {
    key: "laminate",
    label: "Laminate",
    chooseLabel: "Choose laminate",
    description: "Optional laminate roll. Normally only applies when laminate is selected on the quote.",
    baseUsage: "roll_metres",
    role: "quote_selected_material",
    kind: "material",
    componentLabel: "Laminate",
    materialFilter: "laminate",
    triggerOptionKey: "laminate",
    triggerOptionValuesCsv: "matt_laminate, matte, gloss_laminate, gloss, anti_graffiti"
  },
  {
    key: "finishing",
    label: "Finishing / hardware",
    chooseLabel: "Choose finishing",
    description: "Eyelets, fixings, drill holes, Jingwei, router cutting or other finishing processes.",
    baseUsage: "each",
    role: "quote_finishing",
    kind: "material",
    componentLabel: "Finishing hardware",
    materialFilter: "finishing",
    triggerOptionKey: "finishing",
    triggerOptionValuesCsv: "eyelets, drill_holes, jingwei_cutting, router_cutting, cnc_cut"
  },
  {
    key: "labour",
    label: "Labour / process",
    chooseLabel: "Add labour process",
    description: "Artwork, print setup, laminate apply, cutting, drilling, packing or general production time.",
    baseUsage: "labour_hours",
    role: "factory_labour",
    kind: "labour",
    componentLabel: "Factory labour",
    materialFilter: "labour",
    defaultQuantity: "0.25",
    defaultWaste: "0"
  },
  {
    key: "outsourced",
    label: "Outsourced",
    chooseLabel: "Add supplier item",
    description: "Bought-in production, laser cutting, powder coating, formed parts or supplier services.",
    baseUsage: "outsourced_each",
    role: "outsourced_item",
    kind: "outsourced",
    componentLabel: "Outsourced item",
    materialFilter: "outsourced",
    defaultQuantity: "1",
    defaultWaste: "0"
  }
];

function lowerText(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function productBuilderUrl(productId: string, query: string, part?: string): string {
  const params = new URLSearchParams();
  params.set("selected", productId);
  if (query) params.set("q", query);
  if (part) params.set("part", part);
  return `/products?${params.toString()}`;
}

function materialTypeText(material: any): string {
  return lowerText(`${material?.materialType ?? ""} ${material?.stockUom ?? ""} ${material?.purchaseUom ?? ""}`);
}

function materialSizeText(material: any): string {
  if (material?.rollWidthMm) return `${material.rollWidthMm}mm roll`;
  if (material?.widthMm || material?.lengthMm) return `${material.widthMm ?? "?"} × ${material.lengthMm ?? "?"}mm`;
  return humanize(material?.stockUom ?? material?.purchaseUom ?? "each");
}

function moneyText(value: unknown): string {
  const amount = Number(String(value ?? "0"));
  if (!Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function isRollMaterial(material: any): boolean {
  const text = `${materialTypeText(material)} ${lowerText(material?.name)}`;
  return text.includes("roll") || text.includes("vinyl") || text.includes("sav") || text.includes("laminate") || text.includes("cello") || text.includes("banner");
}

function isSheetMaterial(material: any): boolean {
  const text = `${materialTypeText(material)} ${lowerText(material?.name)}`;
  return text.includes("sheet") || text.includes("card") || text.includes("paper") || text.includes("acm") || text.includes("corflute") || text.includes("acrylic") || text.includes("foam") || text.includes("pvc");
}

function materialMatchesPart(material: any, part: string): boolean {
  const text = `${materialTypeText(material)} ${lowerText(material?.name)} ${lowerText(material?.sku)} ${lowerText(material?.notes)}`;
  if (part === "substrate") return isSheetMaterial(material) && !text.includes("laminate") && !text.includes("cello");
  if (part === "print_media") return isRollMaterial(material) && (text.includes("print") || text.includes("sav") || text.includes("vinyl") || text.includes("banner") || text.includes("media") || text.includes("clear") || text.includes("white"));
  if (part === "laminate") return text.includes("laminate") || text.includes("cello") || text.includes("gloss") || text.includes("matt") || text.includes("matte") || text.includes("anti graffiti");
  if (part === "finishing") return text.includes("fixing") || text.includes("hardware") || text.includes("eyelet") || text.includes("standoff") || text.includes("screw") || text.includes("tape") || text.includes("item") || text.includes("consumable");
  return true;
}

function slotForKey(part: string): ProductBuildSlot | undefined {
  return productBuildSlots.find((slot) => slot.key === part);
}

function componentMatchesBuildSlot(component: any, slot: ProductBuildSlot): boolean {
  const label = lowerText(component?.label);
  const role = lowerText(component?.role);
  const kind = lowerText(component?.kind);
  const rule = componentRuleType(component);
  const triggerKey = lowerText(component?.trigger?.optionKey ?? component?.stockUsage?.optionKey);

  if (slot.key === "substrate") {
    return role === "base_material" || (label.includes("substrate") || label.includes("base sheet") || label.includes("base material"));
  }
  if (slot.key === "print_media") {
    return label.includes("print media") || label.includes("roll stock") || label.includes("sav") || (role === "quote_selected_material" && (triggerKey.includes("print") || triggerKey.includes("roll_stock")));
  }
  if (slot.key === "ink") {
    return label.includes("ink") || rule === "sell_sqm";
  }
  if (slot.key === "laminate") {
    return label.includes("laminate") || label.includes("cello") || triggerKey.includes("laminate");
  }
  if (slot.key === "finishing") {
    return role.includes("finishing") || triggerKey.includes("finish") || label.includes("eyelet") || label.includes("drill") || label.includes("jingwei") || label.includes("router") || label.includes("hole") || label.includes("fixing");
  }
  if (slot.key === "labour") {
    return kind === "labour" || rule === "labour_hours";
  }
  if (slot.key === "outsourced") {
    return kind === "outsourced" || role.includes("outsource") || rule === "outsourced_each";
  }
  return false;
}

function selectedComponentForSlot(components: any[], slot: ProductBuildSlot): any | null {
  return components.find((component) => componentMatchesBuildSlot(component, slot)) ?? null;
}

function componentsForSlot(components: any[], slot: ProductBuildSlot): any[] {
  return components.filter((component) => componentMatchesBuildSlot(component, slot));
}

function componentPartListText(component: any, materials: any[]): string {
  if (!component) return "Nothing selected";
  const rule = componentRuleType(component);
  const materialName = materialNameFor(component, materials);
  if (rule === "sell_sqm") return `${component.label} · ${recipeBasisText(component)}`;
  if (rule === "sell_each") return `${component.label} · ${recipeBasisText(component)}`;
  if (rule === "labour_hours") return `${component.label} · ${recipeBasisText(component)}`;
  if (materialName !== "No material") return materialName;
  return component.label ?? "Selected";
}

function BuildSlotRow({ slot, selectedProduct, query, components, materials }: { slot: ProductBuildSlot; selectedProduct: any; query: string; components: any[]; materials: any[] }) {
  const slotComponents = componentsForSlot(components, slot);
  const selected = slotComponents[0] ?? null;
  const hasMultiple = slotComponents.length > 1;
  const isDone = Boolean(selected);

  return (
    <tr style={{ borderTop: "1px solid #e5e7eb" }}>
      <td style={{ padding: "13px 10px", fontWeight: 900, color: "#2563eb", width: 170 }}>
        <Link href={productBuilderUrl(selectedProduct.id, query, slot.key)} style={{ color: "#2563eb", textDecoration: "underline" }}>{slot.label}</Link>
      </td>
      <td style={{ padding: "13px 10px" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>{componentPartListText(selected, materials)}</strong>
          <span style={{ color: "#64748b", fontSize: 13 }}>{selected ? recipeBasisText(selected) : slot.description}</span>
          {hasMultiple ? <span style={plainChipStyle}>+ {slotComponents.length - 1} extra row{slotComponents.length - 1 === 1 ? "" : "s"}</span> : null}
        </div>
      </td>
      <td style={{ padding: "13px 10px", color: "#334155", fontSize: 14 }}>{selected ? componentTriggerText(selected, []) : "Not selected"}</td>
      <td style={{ padding: "13px 10px", fontWeight: 900 }}>{selected?.materialId ? moneyText(materials.find((material) => String(material.id) === String(selected.materialId))?.purchaseCost) : selected ? recipeBasisText(selected) : "—"}</td>
      <td style={{ padding: "13px 10px", textAlign: "right" }}>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Link href={productBuilderUrl(selectedProduct.id, query, slot.key)} style={isDone ? ghostStyle : blueButtonStyle}>{isDone ? "Change" : `+ ${slot.chooseLabel}`}</Link>
          {selected ? (
            <form action={deleteProductComponentAction}>
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <input type="hidden" name="componentId" value={selected.id} />
              <button type="submit" style={dangerGhostStyle}>Remove</button>
            </form>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function ProductPartListSummary({ selectedProduct, fields, components, materials, query }: { selectedProduct: any; fields: any[]; components: any[]; materials: any[]; query: string }) {
  return (
    <aside style={{ display: "grid", gap: 14, alignSelf: "start", position: "sticky", top: 16 }}>
      <section style={{ ...whitePanelStyle, padding: 16, boxShadow: "0 12px 30px rgba(15,23,42,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <strong style={{ fontSize: 18 }}>Product List</strong>
          <span style={blueChipStyle}>{components.length} parts</span>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {productBuildSlots.map((slot) => {
            const selected = selectedComponentForSlot(components, slot);
            return (
              <Link key={slot.key} href={productBuilderUrl(selectedProduct.id, query, slot.key)} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 8, alignItems: "start", color: "inherit", textDecoration: "none", borderTop: "1px solid #eef2f7", paddingTop: 8 }}>
                <span style={selected ? greenChipStyle : plainChipStyle}>{selected ? "✓" : "+"}</span>
                <span style={{ display: "grid", gap: 2 }}>
                  <strong>{slot.label}</strong>
                  <small style={{ color: "#64748b" }}>{selected ? componentPartListText(selected, materials) : "Choose later"}</small>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section style={{ ...whitePanelStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
        <strong>Compatibility</strong>
        <p style={{ ...mutedStyle, marginTop: 6 }}>No hard checks yet. This area will warn if laminate is selected without print, roll width is too small, or eyelet choices need quantity/placement.</p>
      </section>

      <section style={whitePanelStyle}>
        <strong>Quote questions</strong>
        <p style={{ ...mutedStyle, marginTop: 6 }}>{fields.length ? `${fields.length} question${fields.length === 1 ? "" : "s"} ready for the quote page.` : "Add Size, Print type, Laminate, Finishing and Quantity."}</p>
        <Link href={productBuilderUrl(selectedProduct.id, query, "questions")} style={{ ...ghostStyle, marginTop: 10 }}>Manage questions</Link>
      </section>
    </aside>
  );
}

function SupplierPriceHint({ material }: { material: any }) {
  return (
    <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.45 }}>
      <div><b>{material?.supplierName ?? "No supplier linked"}</b></div>
      <div>{material?.sku ? `SKU ${material.sku} · ` : ""}{materialSizeText(material)} · {moneyText(material?.purchaseCost)} / {material?.purchaseUom ?? material?.stockUom ?? "unit"}</div>
      <div>Stock: {material?.stockQuantity ?? "0"} {material?.stockUom ?? ""}</div>
    </div>
  );
}

function SelectMaterialForSlotForm({ selectedProduct, slot, material, existing }: { selectedProduct: any; slot: ProductBuildSlot; material: any; existing: any | null }) {
  const action = existing ? updateProductComponentAction : addProductComponentAction;
  return (
    <form action={action}>
      <input type="hidden" name="productId" value={selectedProduct.id} />
      {existing ? <input type="hidden" name="componentId" value={existing.id} /> : null}
      <input type="hidden" name="label" value={slot.componentLabel} />
      <input type="hidden" name="kind" value={slot.kind} />
      <input type="hidden" name="role" value={slot.role} />
      <input type="hidden" name="materialId" value={material.id} />
      <input type="hidden" name="baseUsage" value={slot.baseUsage} />
      <input type="hidden" name="quantity" value={slot.defaultQuantity ?? "1"} />
      <input type="hidden" name="wastePercent" value={slot.defaultWaste ?? "10"} />
      <input type="hidden" name="triggerOptionKey" value={slot.triggerOptionKey ?? ""} />
      <input type="hidden" name="triggerOptionValuesCsv" value={slot.triggerOptionValuesCsv ?? ""} />
      <input type="hidden" name="notes" value={`${slot.label} selected from the product builder.`} />
      <button type="submit" style={blueButtonStyle}>{existing ? "Use this instead" : "Add to build"}</button>
    </form>
  );
}

function MaterialPickerForSlot({ selectedProduct, slot, materials, existing }: { selectedProduct: any; slot: ProductBuildSlot; materials: any[]; existing: any | null }) {
  const filtered = materials.filter((material) => materialMatchesPart(material, slot.key));
  const rows = filtered.length ? filtered : materials;

  return (
    <section style={{ ...whitePanelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb", padding: 18, display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <p style={tinyLabelStyle}>{slot.label}</p>
          <h3 style={{ margin: "4px 0 2px", fontSize: 26 }}>Choose from materials</h3>
          <p style={mutedStyle}>{slot.description}</p>
        </div>
        <span style={plainChipStyle}>{rows.length} matching material{rows.length === 1 ? "" : "s"}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 18 }}>
          <p style={mutedStyle}>No materials exist yet. Add stock in Materials first, then come back to choose it here.</p>
          <Link href="/materials" style={blueButtonStyle}>Go to Materials</Link>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ padding: "12px 14px" }}>Material</th>
                <th style={{ padding: "12px 14px" }}>Supplier / stock</th>
                <th style={{ padding: "12px 14px" }}>Size</th>
                <th style={{ padding: "12px 14px" }}>Cost</th>
                <th style={{ padding: "12px 14px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((material) => (
                <tr key={material.id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: "14px" }}>
                    <strong>{material.name}</strong>
                    <div style={{ color: "#64748b", fontSize: 13 }}>{humanize(material.materialType)}{material.sku ? ` · ${material.sku}` : ""}</div>
                  </td>
                  <td style={{ padding: "14px" }}><SupplierPriceHint material={material} /></td>
                  <td style={{ padding: "14px" }}>{materialSizeText(material)}</td>
                  <td style={{ padding: "14px", fontWeight: 900 }}>{moneyText(material.purchaseCost)}</td>
                  <td style={{ padding: "14px", textAlign: "right" }}><SelectMaterialForSlotForm selectedProduct={selectedProduct} slot={slot} material={material} existing={existing} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InkBuilderPanel({ selectedProduct, fields }: { selectedProduct: any; fields: any[] }) {
  return (
    <section style={whitePanelStyle}>
      <p style={tinyLabelStyle}>Ink / production charge</p>
      <h3 style={{ margin: "4px 0 8px", fontSize: 24 }}>Add ink as an area charge</h3>
      <p style={mutedStyle}>Ink is not sheet or roll stock. Add CMYK at $10/m² and white ink as another $10/m² when required.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12, marginTop: 14 }}>
        <form action={addProductComponentAction} style={whitePanelStyle}>
          <input type="hidden" name="productId" value={selectedProduct.id} />
          <input type="hidden" name="kind" value="material" />
          <input type="hidden" name="baseUsage" value="sell_sqm" />
          <input type="hidden" name="label" value="CMYK Ink" />
          <input type="hidden" name="sellRate" value="10" />
          <input type="hidden" name="quantity" value="1" />
          <input type="hidden" name="wastePercent" value="0" />
          <input type="hidden" name="triggerOptionKey" value="print_type" />
          <input type="hidden" name="triggerOptionValuesCsv" value="direct_print, sav_7yr, roll_stock, roll_stock_applied" />
          <input type="hidden" name="notes" value="CMYK ink charge: finished square metres × $10/m²." />
          <strong>CMYK Ink</strong>
          <p style={mutedStyle}>$10/m², triggered by print choices.</p>
          <button type="submit" style={blueButtonStyle}>Add CMYK ink</button>
        </form>
        <form action={addProductComponentAction} style={whitePanelStyle}>
          <input type="hidden" name="productId" value={selectedProduct.id} />
          <input type="hidden" name="kind" value="material" />
          <input type="hidden" name="baseUsage" value="sell_sqm" />
          <input type="hidden" name="label" value="White Ink" />
          <input type="hidden" name="sellRate" value="10" />
          <input type="hidden" name="quantity" value="1" />
          <input type="hidden" name="wastePercent" value="0" />
          <input type="hidden" name="triggerOptionKey" value="white_ink" />
          <input type="hidden" name="triggerOptionValuesCsv" value="yes" />
          <input type="hidden" name="notes" value="White ink extra: finished square metres × $10/m² when white ink is selected." />
          <strong>White Ink</strong>
          <p style={mutedStyle}>Extra $10/m², only when White ink = Yes.</p>
          <button type="submit" style={blueButtonStyle}>Add white ink</button>
        </form>
      </div>
      <details style={{ ...whitePanelStyle, marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 950 }}>Custom ink / production charge</summary>
        <div style={{ marginTop: 12 }}><AddChargeRecipeRow productId={selectedProduct.id} fields={fields} /></div>
      </details>
    </section>
  );
}

function LabourBuilderPanel({ selectedProduct, fields }: { selectedProduct: any; fields: any[] }) {
  return (
    <section style={whitePanelStyle}>
      <p style={tinyLabelStyle}>Labour / process</p>
      <h3 style={{ margin: "4px 0 8px", fontSize: 24 }}>Add factory labour</h3>
      <p style={mutedStyle}>Use this for print setup, laminate apply, Jingwei, drilling, eyelets or general production time.</p>
      <div style={{ marginTop: 12 }}><AddLabourRecipeRow productId={selectedProduct.id} fields={fields} /></div>
    </section>
  );
}

function SupplierOrderingPreview({ materials }: { materials: any[] }) {
  const supplierRows = materials.filter((material) => material.supplierName).slice(0, 6);
  return (
    <section style={{ ...whitePanelStyle, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 18 }}>Supplier pricing / ordering direction</strong>
          <p style={mutedStyle}>Material detail pages can become the ordering page: suppliers, prices, stock, and create purchase order.</p>
        </div>
        <Link href="/materials" style={ghostStyle}>Open Materials</Link>
      </div>
      {supplierRows.length ? (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {supplierRows.map((material) => (
            <div key={material.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
              <span><strong>{material.name}</strong><br /><small style={{ color: "#64748b" }}>{material.supplierName}</small></span>
              <span style={{ fontWeight: 900 }}>{moneyText(material.purchaseCost)}</span>
              <button type="button" disabled style={{ ...ghostStyle, opacity: 0.6, cursor: "not-allowed" }}>Order later</button>
            </div>
          ))}
        </div>
      ) : <p style={{ ...mutedStyle, marginTop: 10 }}>No supplier-linked materials yet. Add supplier prices on Materials.</p>}
    </section>
  );
}

function ProductPartPickerBuilder({ selectedProduct, fields, components, materials, query, editOptionId, activePart }: { selectedProduct: any; fields: any[]; components: any[]; materials: any[]; query: string; editOptionId: string; activePart: string }) {
  const activeSlot = slotForKey(activePart);
  const selectedForActiveSlot = activeSlot ? selectedComponentForSlot(components, activeSlot) : null;

  return (
    <section style={{ ...canvasStyle, overflow: "visible" }}>
      <div style={{ background: "#111827", color: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "18px 22px", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <p style={{ margin: 0, color: "#93c5fd", fontSize: 12, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>Product builder</p>
          <h2 style={{ margin: "5px 0 0", fontSize: 30, letterSpacing: "-0.04em" }}>{selectedProduct.name}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...plainChipStyle, background: "#1f2937", color: "#e5e7eb" }}>{components.length} selected parts</span>
          <span style={{ ...plainChipStyle, background: "#1f2937", color: "#e5e7eb" }}>{fields.length} quote questions</span>
          <Link href="/quotes" style={{ ...ghostStyle, borderColor: "#334155", background: "#0f172a", color: "#fff" }}>Go to Quotes</Link>
        </div>
      </div>

      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <ProductPartListSummary selectedProduct={selectedProduct} fields={fields} components={components} materials={materials} query={query} />

        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <section style={{ ...whitePanelStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ background: "#f8fafc", borderBottom: "1px solid #e5e7eb", padding: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: 20 }}>Choose your product parts</strong>
                <p style={{ ...mutedStyle, marginTop: 4 }}>Build the product by selecting the materials and processes it can use.</p>
              </div>
              <span style={components.length ? greenChipStyle : yellowChipStyle}>{components.length ? "Build started" : "Start with substrate"}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "11px 10px" }}>Part</th>
                    <th style={{ padding: "11px 10px" }}>Selection</th>
                    <th style={{ padding: "11px 10px" }}>Applies when</th>
                    <th style={{ padding: "11px 10px" }}>Cost / basis</th>
                    <th style={{ padding: "11px 10px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {productBuildSlots.map((slot) => <BuildSlotRow key={slot.key} slot={slot} selectedProduct={selectedProduct} query={query} components={components} materials={materials} />)}
                  <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "13px 10px", fontWeight: 900, color: "#2563eb" }}>Quote questions</td>
                    <td style={{ padding: "13px 10px" }}><strong>{fields.length ? `${fields.length} questions added` : "No questions yet"}</strong><div style={{ color: "#64748b", fontSize: 13 }}>Size, print, laminate, ink, finishing and quantity.</div></td>
                    <td style={{ padding: "13px 10px" }}>Shown on quote page</td>
                    <td style={{ padding: "13px 10px" }}>Staff selections</td>
                    <td style={{ padding: "13px 10px", textAlign: "right" }}><Link href={productBuilderUrl(selectedProduct.id, query, "questions")} style={fields.length ? ghostStyle : blueButtonStyle}>{fields.length ? "Manage" : "+ Add questions"}</Link></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {activeSlot && ["substrate", "print_media", "laminate", "finishing"].includes(activeSlot.key) ? (
            <MaterialPickerForSlot selectedProduct={selectedProduct} slot={activeSlot} materials={materials} existing={selectedForActiveSlot} />
          ) : null}

          {activePart === "ink" ? <InkBuilderPanel selectedProduct={selectedProduct} fields={fields} /> : null}
          {activePart === "labour" ? <LabourBuilderPanel selectedProduct={selectedProduct} fields={fields} /> : null}
          {activePart === "outsourced" ? <section style={whitePanelStyle}><AddOutsourceRecipeRow productId={selectedProduct.id} fields={fields} /></section> : null}
          {activePart === "questions" ? (
            <section style={whitePanelStyle}>
              <QuoteQuestionsSpreadsheetPanel selectedProduct={selectedProduct} fields={fields} components={components} activeMaterials={materials} query={query} editOptionId={editOptionId} />
            </section>
          ) : null}

          {!activePart ? (
            <section style={{ ...whitePanelStyle, background: "#eff6ff", borderColor: "#bfdbfe" }}>
              <strong style={{ fontSize: 20 }}>How this works</strong>
              <p style={{ ...mutedStyle, marginTop: 6 }}>Click a row, choose the material or process, and the product build fills in like PCPartPicker. Supplier pricing stays on Materials and can later become purchase ordering.</p>
            </section>
          ) : null}

          <SupplierOrderingPreview materials={materials} />

          <details style={{ ...whitePanelStyle }}>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>Advanced: old spreadsheet-style rows and starter reset</summary>
            <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
              <ProductBasicsPanel selectedProduct={selectedProduct} />
              <PresetRowsPanel productId={selectedProduct.id} activeMaterials={materials} selectedStarterType="sign_acm" />
              <SpreadsheetRecipeRows selectedProduct={selectedProduct} fields={fields} components={components} materials={materials} />
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

function QuoteQuestionsSpreadsheetPanel({ selectedProduct, fields, components, activeMaterials, query, editOptionId }: { selectedProduct: any; fields: any[]; components: any[]; activeMaterials: any[]; query: string; editOptionId: string }) {
  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <p style={tinyLabelStyle}>Quote questions</p>
          <h2 style={sectionHeadingStyle}>What staff answer on the quote</h2>
          <p style={{ ...mutedStyle, marginTop: 6 }}>These should stay short: Size, Print type, Laminate, White ink, Finishing and Quantity.</p>
        </div>
        <span style={fields.length ? greenChipStyle : yellowChipStyle}>{fields.length ? `${fields.length} questions` : "Add Size first"}</span>
      </div>

      {fields.length === 0 ? (
        <div style={{ ...whitePanelStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
          <strong>No quote questions yet</strong>
          <p style={mutedStyle}>Add Size first, then Print type, Laminate, White ink, Finishing and Quantity.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {fields.map((field: any, index: number) => (
            <QuestionCard
              key={field.id ?? field.key}
              field={field}
              index={index}
              selectedProduct={selectedProduct}
              query={query}
              components={components}
              isEditing={String(field.id ?? "") === String(editOptionId)}
              activeMaterials={activeMaterials}
              fields={fields}
            />
          ))}
        </div>
      )}

      <AddQuestionPanel selectedProduct={selectedProduct} activeMaterials={activeMaterials} fields={fields} />
    </section>
  );
}

function LiveSpreadsheetPreview({ fields, components }: { fields: any[]; components: any[] }) {
  const sizeField = fields.find((field: any) => String(field.key ?? "").includes("size") || String(field.type ?? "") === "size_select");
  const printField = fields.find((field: any) => String(field.key ?? "").includes("print"));
  const laminateField = fields.find((field: any) => String(field.key ?? "").includes("laminate"));
  const hasInk = components.some((component: any) => String(component.label ?? "").toLowerCase().includes("ink") || componentRuleType(component) === "sell_sqm");

  return (
    <section style={{ ...whitePanelStyle, background: "#f8fafc" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <strong style={{ fontSize: 18 }}>Quick check</strong>
          <p style={mutedStyle}>A normal sign product usually only needs these pieces.</p>
        </div>
        <span style={fields.length && components.length ? greenChipStyle : yellowChipStyle}>{fields.length && components.length ? "Looks usable" : "Keep going"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <RecipeLine label="Size" body={sizeField ? "Ready" : "Add a Size question"} />
        <RecipeLine label="Print / laminate" body={printField || laminateField ? "Ready" : "Add Print type / Laminate if needed"} />
        <RecipeLine label="Ink" body={hasInk ? "Ready" : "Add CMYK at $10/m² if printed"} />
      </div>
    </section>
  );
}

function ProductRecipeCanvas({ selectedProduct, fields, components, activeMaterials, query, editOptionId, selectedStarterType, activePart }: { selectedProduct: any; fields: any[]; components: any[]; activeMaterials: any[]; query: string; editOptionId: string; selectedStarterType: string; activePart: string }) {
  return (
    <ProductPartPickerBuilder
      selectedProduct={selectedProduct}
      fields={fields}
      components={components}
      materials={activeMaterials}
      query={query}
      editOptionId={editOptionId}
      activePart={activePart}
    />
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
  const editOptionId = readParam(params, "editOption");
  const activePart = readParam(params, "part");

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

      <ProductFlowHero selectedProduct={selectedProduct} fields={fields} components={components} activeMaterials={activeMaterials} />

      <ProductChooser products={products} filteredProducts={filteredProducts} selectedProduct={selectedProduct} query={query} activeMaterials={activeMaterials} />

      {!selectedProduct ? (
        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <p style={tinyLabelStyle}>Starter guide</p>
          <h2 style={sectionHeadingStyle}>The product creator starts simple now</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {starterTypes.slice(0, 4).map((starter) => (
              <div key={starter.value} style={whitePanelStyle}>
                <span style={blueChipStyle}>{starter.label}</span>
                <strong>{starter.plainName}</strong>
                <p style={mutedStyle}>{starter.description}</p>
                <p style={mutedStyle}><b>Starts with:</b> {starterQuickAnswers(starter.value)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <ProductRecipeCanvas
          selectedProduct={selectedProduct}
          fields={fields}
          components={components}
          activeMaterials={activeMaterials}
          query={query}
          editOptionId={editOptionId}
          selectedStarterType={selectedStarterType}
          activePart={activePart}
        />
      )}
    </div>
  );
}
