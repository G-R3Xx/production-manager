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
  applyQuoteBehaviourPresetAction,
  createProductAction,
  deleteProductOptionAction,
  moveProductOptionAction,
  updateProductAction,
  updateProductOptionAction
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
  { value: "size_select", label: "Size choices" },
  { value: "yes_no", label: "Yes / No" },
  { value: "quantity", label: "Quantity" },
  { value: "number", label: "Number" },
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
  { value: "fixed_charge", label: "$ each", short: "Adds charge", amountLabel: "Sell $ each", amountPlaceholder: "eg 15" }
];

const quickQuestionPresets = [
  {
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
    label: "White ink",
    type: "yes_no",
    required: "yes",
    rows: [
      { answer: "No", mode: "none", amount: "" },
      { answer: "Yes", mode: "sqm_charge", amount: "10", chargeName: "White Ink" }
    ]
  },
  {
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
    label: "Finishing",
    type: "select",
    required: "yes",
    rows: [
      { answer: "None", mode: "none", amount: "" },
      { answer: "Jingwei cutting", mode: "fixed_charge", amount: "0" },
      { answer: "Drill holes", mode: "fixed_charge", amount: "0" }
    ]
  },
  {
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
    return triggerKey === fieldKey && values.includes(optionValue);
  }) ?? null;
}

function optionUsageModeFromComponent(component: any): string {
  const stockUsage = component?.stockUsage ?? {};
  const ruleType = String(component?.ruleType ?? stockUsage?.usageBasis ?? "yield_based");
  if (!component) return "none";
  if (ruleType === "sell_sqm") return "sqm_charge";
  if (ruleType === "sell_each") return "fixed_charge";
  if (ruleType === "per_linear_metre") return "roll_metres";
  if (ruleType === "per_unit" && String(component?.unit ?? "") === "sheet") return "sheets_per_item";
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
  if (mode === "sqm_charge" || mode === "fixed_charge") return cleanUsageNumber(stockUsage?.sellRate ?? component?.quantity) || "";
  return "";
}

function optionChargeNameFromComponent(component: any): string {
  return String(component?.stockUsage?.chargeName ?? component?.label ?? "");
}

function questionCostingText(field: any, components: any[]): string {
  const choices = choicesForField(field);
  if (!["select", "size_select", "color", "yes_no"].includes(String(field?.type ?? ""))) return "No pricing rows needed";
  if (choices.length === 0) return "No answers yet";
  const costed = choices.filter((choice) => {
    const linked = linkedOptionComponent(field, choice, components);
    const mode = optionUsageModeFromComponent(linked);
    return linked && mode !== "none";
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
  const stats = [
    { label: "Quote cards", value: fields.length, ready: fields.length > 0 },
    { label: "Price rows", value: components.length, ready: components.length > 0 },
    { label: "Materials ready", value: activeMaterials.length, ready: activeMaterials.length > 0 }
  ];

  return (
    <section style={{ ...cardStyle, display: "grid", gap: 16, background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <p style={tinyLabelStyle}>Product recipe builder</p>
          <h1 style={{ margin: "8px 0 6px", fontSize: 42, letterSpacing: "-0.05em" }}>Build products visually</h1>
          <p style={{ ...mutedStyle, maxWidth: 880 }}>
            Start with the thing you sell, then add the quote questions staff will answer. Each answer line says what it adds: no cost, material, parts per sheet, roll metres, $/m² or $ each.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={greenChipStyle}>No configurator page</span>
          <span style={blueChipStyle}>Answer-line pricing</span>
          <span style={plainChipStyle}>GST hidden</span>
        </div>
      </div>

      {selectedProduct ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1.2fr) repeat(3, minmax(130px, 0.45fr))", gap: 12 }}>
          <div style={{ ...whitePanelStyle, background: "#fff" }}>
            <span style={greenChipStyle}>Open product</span>
            <strong style={{ fontSize: 20 }}>{selectedProduct.name}</strong>
            <p style={mutedStyle}>{selectedProduct.sku || "No SKU"} · {humanize(selectedProduct.productFamily)}</p>
          </div>
          {stats.map((stat) => (
            <div key={stat.label} style={{ ...whitePanelStyle, background: stat.ready ? "#f6fef9" : "#fffcf5", borderColor: stat.ready ? "#abefc6" : "#fedf89" }}>
              <span style={stat.ready ? greenChipStyle : yellowChipStyle}>{stat.ready ? "Ready" : "Next"}</span>
              <strong style={{ fontSize: 24 }}>{stat.value}</strong>
              <p style={mutedStyle}>{stat.label}</p>
            </div>
          ))}
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
          <StepNumber number="1" title="Add the question" body="Example: Size, Print type, White ink, Laminate." />
          <StepNumber number="2" title="Add answer lines" body="Example: 600 × 900mm, SAV 7YR, Yes, Matt laminate." />
          <StepNumber number="3" title="Choose what each answer adds" body="No cost, material from size, parts per sheet, $/m² or $ each." />
        </div>
      </div>
      <div style={whitePanelStyle}>
        <strong>Common recipes</strong>
        <RecipeLine label="ACM size" body="Parts per sheet, eg 600×900 = 8" />
        <RecipeLine label="Roll vinyl" body="Material from size, linked to roll stock" />
        <RecipeLine label="CMYK ink" body="$ per m², rate 10" />
        <RecipeLine label="White ink" body="Yes answer = $ per m², rate 10" />
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
  if (!["select", "size_select", "color", "yes_no"].includes(String(field?.type ?? ""))) {
    return <span style={plainChipStyle}>{String(field?.type ?? "text") === "quantity" ? "Entered as quantity" : "Typed by staff"}</span>;
  }

  if (choices.length === 0) return <span style={yellowChipStyle}>Needs answers</span>;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {choices.map((choice) => {
        const linked = linkedOptionComponent(field, choice, components);
        const mode = optionUsageModeFromComponent(linked);
        const chip = mode === "none" ? plainChipStyle : mode.includes("charge") ? blueChipStyle : greenChipStyle;
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
  const blankCount = field ? Math.max(2, 5 - existingRows.length) : 5;
  const rows = [
    ...existingRows,
    ...Array.from({ length: blankCount }, (_, index) => ({ choice: null, component: null, blankId: `blank-${index}` }))
  ];

  return (
    <section style={{ ...panelStyle, background: "#f8fafc", borderColor: "#bfdbfe" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <strong style={{ fontSize: 18 }}>Answer lines</strong>
          <p style={{ ...mutedStyle, marginTop: 4 }}>Each row is one answer staff can pick. The pricing recipe stays on the product, so quotes calculate automatically.</p>
        </div>
        <span style={blueChipStyle}>Simple mode</span>
      </div>

      {materials.length === 0 ? (
        <div style={{ ...whitePanelStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
          <strong>No active materials yet</strong>
          <p style={mutedStyle}>You can still create the answers. Link stock later from the Materials page.</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((row: any, index: number) => {
          const component = row.component;
          const choice = row.choice;
          const usageMode = component ? optionUsageModeFromComponent(component) : "none";
          const usageMeta = optionUsageModes.find((mode) => mode.value === usageMode) ?? optionUsageModes[0];
          const isCharge = usageMode === "sqm_charge" || usageMode === "fixed_charge";
          const hasCost = Boolean(component?.materialId) || isCharge;

          return (
            <div key={choice?.id ?? row.blankId ?? index} style={{ border: "1px solid #dbe7f5", borderRadius: 20, background: choice ? "#fff" : "#fbfdff", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 0 }}>
                <div style={{ background: hasCost ? "#ecfdf3" : "#f1f5f9", color: hasCost ? "#067647" : "#475569", display: "grid", placeItems: "center", fontWeight: 950 }}>{index + 1}</div>
                <div style={{ padding: 14, display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{choice ? choiceLabel(choice) : "Blank answer"}</strong>
                    <span style={hasCost ? greenChipStyle : plainChipStyle}>{hasCost ? usageMeta.short : "Choice only"}</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 1.1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(120px, 0.55fr)", gap: 10 }}>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Visible answer</span>
                      <input name="optionAnswerLabel" defaultValue={String(choice?.label ?? "")} placeholder="eg 600 x 900 mm, Yes, Matt" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Price recipe</span>
                      <select name="optionUsageMode" defaultValue={usageMode} style={inputStyle}>
                        {optionUsageModes.map((mode) => (
                          <option key={mode.value} value={mode.value}>{mode.label}</option>
                        ))}
                      </select>
                    </label>
                    <label style={labelStyle}>
                      <span style={labelTextStyle}>Material used</span>
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
                    </label>
                  </div>

                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 900, color: "#475569" }}>More for this answer</summary>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      <div style={grid3}>
                        <label style={labelStyle}>
                          <span style={labelTextStyle}>Charge label</span>
                          <input name="optionChargeName" defaultValue={isCharge ? optionChargeNameFromComponent(component) : ""} placeholder="eg CMYK Ink or White Ink" style={inputStyle} />
                        </label>
                        <label style={labelStyle}>
                          <span style={labelTextStyle}>Waste %</span>
                          <input name="optionWastePercent" defaultValue={String(component?.wastePercent ?? "10")} placeholder="eg 10" style={inputStyle} />
                        </label>
                        <label style={labelStyle}>
                          <span style={labelTextStyle}>Internal note</span>
                          <input name="optionNotes" defaultValue={String(component?.notes ?? "")} placeholder="optional" style={inputStyle} />
                        </label>
                      </div>
                      <p style={mutedStyle}>For ink: choose <b>$ per m²</b>, leave material blank, enter <b>10</b>. For ACM sizes: choose <b>Parts per sheet</b>, pick ACM, enter the yield such as <b>8</b>.</p>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p style={mutedStyle}>Need more blank rows? Save this question, edit it again, and more blanks appear.</p>
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

function QuickQuestionButton({ selectedProductId, preset, activeMaterials }: { selectedProductId: string; preset: (typeof quickQuestionPresets)[number]; activeMaterials: any[] }) {
  const firstMaterialId = activeMaterials[0]?.id ? String(activeMaterials[0].id) : "";
  return (
    <form action={addProductOptionAction} style={{ ...whitePanelStyle, minHeight: 150 }}>
      <input type="hidden" name="productId" value={selectedProductId} />
      <input type="hidden" name="label" value={preset.label} />
      <input type="hidden" name="fieldType" value={preset.type} />
      <input type="hidden" name="required" value={preset.required} />
      {preset.rows.map((row) => (
        <div key={`${preset.label}-${row.answer}`}>
          <input type="hidden" name="optionAnswerLabel" value={row.answer} />
          <input type="hidden" name="optionUsageMode" value={row.mode} />
          <input type="hidden" name="optionUsageAmount" value={row.amount} />
          <input type="hidden" name="optionMaterialId" value={row.mode.includes("charge") || row.mode === "none" ? "" : firstMaterialId} />
          <input type="hidden" name="optionWastePercent" value={row.mode.includes("charge") || row.mode === "none" ? "0" : "10"} />
          <input type="hidden" name="optionChargeName" value={row.chargeName ?? ""} />
          <input type="hidden" name="optionNotes" value="" />
        </div>
      ))}
      <span style={blueChipStyle}>Quick add</span>
      <strong style={{ fontSize: 18 }}>{preset.label}</strong>
      <p style={mutedStyle}>{preset.rows.length ? `${preset.rows.length} starter answers` : "Quantity field"}</p>
      <button type="submit" style={ghostStyle}>Add {preset.label}</button>
    </form>
  );
}

function AddQuestionPanel({ selectedProduct, activeMaterials, fields }: { selectedProduct: any; activeMaterials: any[]; fields: any[] }) {
  return (
    <section style={{ ...panelStyle, background: "#f8fafc", borderStyle: "dashed" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 22 }}>Add the next quote question</h3>
          <p style={{ ...mutedStyle, marginTop: 4 }}>Use a quick card, or build your own with visual answer lines.</p>
        </div>
        <span style={yellowChipStyle}>Next step</span>
      </div>

      <details open={fields.length === 0} style={{ ...whitePanelStyle }}>
        <summary style={{ cursor: "pointer", fontWeight: 950 }}>Quick add common question</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 12 }}>
          {quickQuestionPresets.map((preset) => (
            <QuickQuestionButton key={preset.label} selectedProductId={selectedProduct.id} preset={preset} activeMaterials={activeMaterials} />
          ))}
        </div>
        {activeMaterials.length === 0 ? <p style={mutedStyle}>Quick material rows can be linked after materials are added.</p> : null}
      </details>

      <details style={{ ...whitePanelStyle }}>
        <summary style={{ cursor: "pointer", fontWeight: 950 }}>Build a custom question</summary>
        <form action={addProductOptionAction} style={{ display: "grid", gap: 14, marginTop: 12 }}>
          <input type="hidden" name="productId" value={selectedProduct.id} />
          <QuestionBasics />
          <VisualAnswerBuilder materials={activeMaterials} components={[]} />
          <AdvancedQuestionSettings fields={fields} />
          <button type="submit" style={blueButtonStyle}>Save new question</button>
        </form>
      </details>
    </section>
  );
}

function ProductRecipeCanvas({ selectedProduct, fields, components, activeMaterials, query, editOptionId, selectedStarterType }: { selectedProduct: any; fields: any[]; components: any[]; activeMaterials: any[]; query: string; editOptionId: string; selectedStarterType: string }) {
  return (
    <section style={canvasStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", alignItems: "stretch" }}>
        <div style={{ background: "#f8fafc", borderRight: "1px solid #dfe7f2", padding: 18, display: "grid", gap: 12, alignContent: "start" }}>
          <BuilderHelpPanel />
          <ProductBasicsPanel selectedProduct={selectedProduct} />
          <PresetRowsPanel productId={selectedProduct.id} activeMaterials={activeMaterials} selectedStarterType={selectedStarterType} />
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <p style={tinyLabelStyle}>Quote experience</p>
              <h2 style={sectionHeadingStyle}>Staff will answer these cards</h2>
              <p style={{ ...mutedStyle, marginTop: 6 }}>Keep the cards in the same order staff should see them on the quote page.</p>
            </div>
            <span style={fields.length ? greenChipStyle : yellowChipStyle}>{fields.length ? `${fields.length} cards` : "Start with Size"}</span>
          </div>

          {fields.length === 0 ? (
            <div style={{ ...whitePanelStyle, background: "#fffcf5", borderColor: "#fedf89" }}>
              <strong>No quote cards yet</strong>
              <p style={mutedStyle}>Add Size first, then Print type, White ink, Laminate, Finishing and Quantity.</p>
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

          <details style={{ ...whitePanelStyle, background: "#fcfcfd" }}>
            <summary style={{ cursor: "pointer", fontWeight: 950, color: "#64748b" }}>Developer/advanced data preview</summary>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              <p style={mutedStyle}>This is intentionally hidden from normal product setup. It is only here to confirm the automatic pricing rows being created from answer lines.</p>
              <div style={{ display: "grid", gap: 8 }}>
                {components.length === 0 ? <p style={mutedStyle}>No pricing rows yet.</p> : components.map((component: any) => (
                  <div key={component.id ?? component.label} style={{ ...panelStyle, background: "#fff" }}>
                    <strong>{component.label}</strong>
                    <p style={mutedStyle}>{humanize(component.ruleType)} · {component.materialId ? "Linked material" : "No material"} · trigger {component.trigger?.optionKey || component.stockUsage?.optionKey || "always"}</p>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>
    </section>
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
        />
      )}
    </div>
  );
}
