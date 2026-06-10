import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getConfiguratorTemplateById } from "@/server/configurators";
import { listMaterialsForTenant } from "@/server/materials";
import { getProductById, listProductsForTenant } from "@/server/products";
import { addProductComponentAction, addProductOptionAction, addStarterRulesAction, createProductAction, updateProductAction } from "./actions";

type ProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type EditorDefinition = {
  setupPreset?: string | null;
  components: Array<Record<string, any>>;
  fields: Array<Record<string, any>>;
};

type StarterCard = {
  value: string;
  title: string;
  plainName: string;
  description: string;
  defaultChoices: string;
  defaultMaterials: string;
};

type ChoiceCard = {
  preset: string;
  title: string;
  defaultAnswer: string;
  otherAnswers: string;
  description: string;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function matchesQuery(value: string | null | undefined, query: string): boolean {
  return String(value ?? "").toLowerCase().includes(query.toLowerCase());
}

function formatFamily(value: string | null | undefined): string {
  return String(value ?? "general").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelFromValue(value: string | null | undefined): string {
  if (!value) return "Not set";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/(\d+)x(\d+)/i, "$1 × $2 mm");
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
  if (defaultValue) return labelFromValue(defaultValue);
  if (options[0]) return choiceLabel(options[0]);
  if (field.type === "quantity" || field.type === "number") return "Entered while quoting";
  return "Not set";
}

function otherChoiceLabels(field: Record<string, any>): string {
  const defaultValue = String(field.defaultValue ?? "");
  const options = Array.isArray(field.options) ? field.options : [];
  const others = options.filter((option: any) => choiceValue(option) !== defaultValue && choiceLabel(option) !== defaultValue);
  if (others.length === 0) {
    if (field.type === "quantity" || field.type === "number") return "Staff enters the number when quoting.";
    if (field.type === "text") return "Staff types the answer when quoting.";
    return "No other answers added yet.";
  }
  return others.map(choiceLabel).join(", ");
}

function friendlyFieldType(value: string | null | undefined): string {
  switch (value) {
    case "yes_no":
      return "Yes / no";
    case "select":
      return "Pick one";
    case "size_select":
      return "Size list";
    case "quantity":
      return "Number / quantity";
    case "number":
      return "Number";
    case "color":
      return "Colour list";
    case "binding":
      return "Binding list";
    case "text":
      return "Typed answer";
    default:
      return "Pick one";
  }
}

function friendlyUsage(component: Record<string, any>): string {
  const usage = component.stockUsage ?? {};
  const ruleType = String(component.ruleType ?? usage.usageBasis ?? "fixed");
  const quantity = component.quantity ?? "1";
  const unit = component.unit ?? "each";

  if (ruleType === "per_sheet") return `Uses ${quantity} ${unit} from purchased sheet stock`;
  if (ruleType === "yield_based") return `Uses parent sheet yield${usage.partsPerSheet ? ` (${usage.partsPerSheet} up)` : ""}`;
  if (ruleType === "per_linear_metre") return `Uses ${quantity} ${unit} from a purchased roll`;
  if (ruleType === "per_sqm") return `Uses ${quantity} ${unit} by square metre / printed area`;
  if (ruleType === "per_unit") return `Uses ${quantity} ${unit} per quoted unit`;
  if (ruleType === "selected_by_option") return `Only used when a customer answer turns it on`;
  return `Uses ${quantity} ${unit}`;
}

function triggerSummary(component: Record<string, any>): string {
  const trigger = component.trigger ?? {};
  const optionKey = trigger.optionKey ?? component.stockUsage?.optionKey;
  const values = Array.isArray(trigger.optionValues) && trigger.optionValues.length > 0 ? trigger.optionValues : component.stockUsage?.optionValues;
  if (!optionKey) return "Always used";
  const friendlyValues = Array.isArray(values) && values.length > 0 ? values.map(labelFromValue).join(", ") : "selected";
  return `Only when ${labelFromValue(optionKey)} is ${friendlyValues}`;
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
  switch (value) {
    case "rigid_signage":
      return "Sheet sign / board sign";
    case "roll_print":
      return "Roll print / vinyl / banner";
    case "cards":
      return "Business cards / flyers";
    case "books":
      return "Books / pads";
    case "carbon_books":
      return "Duplicate / triplicate books";
    default:
      return "No starting point selected";
  }
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

const compactCardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
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
const defaultPillStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#ecfdf3", color: "#067647", padding: "5px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const mutedTextStyle: CSSProperties = { color: "#667085", fontSize: 13, lineHeight: 1.5 };
const sectionAnchorStyle: CSSProperties = { scrollMarginTop: 24 };

const starterCards: StarterCard[] = [
  {
    value: "rigid_signage",
    title: "Sheet sign / board sign",
    plainName: "eg ACM sign, corflute sign, foamboard sign",
    description: "Best for signs made from a purchased sheet or board, including part-sheet sizes such as 600 × 900 or 450 × 600.",
    defaultChoices: "Size, front/back, laminate, eyelets, quantity",
    defaultMaterials: "Parent sheet, print/ink area, laminate if selected, eyelets if selected"
  },
  {
    value: "roll_print",
    title: "Roll print / vinyl / banner",
    plainName: "eg vinyl print, banner, sticker roll work",
    description: "Best for products consumed from a purchased roll by metres or square metres.",
    defaultChoices: "Finished size, laminate, quantity",
    defaultMaterials: "Roll media metres, ink area, laminate metres if selected"
  },
  {
    value: "cards",
    title: "Business cards / flyers",
    plainName: "eg business cards, postcards, flyers",
    description: "Best for small format sheet work with size, sides, GSM and cello choices.",
    defaultChoices: "Size, front/back, cello, GSM, quantity",
    defaultMaterials: "Paper/card sheet yield, print faces, cello if selected"
  },
  {
    value: "books",
    title: "Books / pads",
    plainName: "eg pads, booklets, printed books",
    description: "Best for books or pads with pages, cover stock and binding.",
    defaultChoices: "Size, pages, cover colour, binding, quantity",
    defaultMaterials: "Internal paper, cover card, binding consumables/labour"
  },
  {
    value: "carbon_books",
    title: "Duplicate / triplicate books",
    plainName: "eg invoice books, docket books, NCR books",
    description: "Best for carbonless books with pages, duplicate/triplicate, copy colours, cover colour, tape colour and numbering.",
    defaultChoices: "Size, pages, copies, copy colours, cover, tape, numbering, quantity",
    defaultMaterials: "Carbonless paper, cover card, tape, numbering labour"
  }
];

const choiceCards: ChoiceCard[] = [
  { preset: "finished_size", title: "Size", defaultAnswer: "600x900", otherAnswers: "450x600,300x450", description: "Finished product size. Used for sheet, roll, ink, laminate and cello usage." },
  { preset: "sides", title: "Front / back", defaultAnswer: "Front only=single_sided", otherAnswers: "Front and back=double_sided", description: "Single or double-sided print selection." },
  { preset: "laminate", title: "Laminate", defaultAnswer: "None=none", otherAnswers: "Matte laminate=matte_laminate,Gloss laminate=gloss_laminate", description: "Signage laminate choice." },
  { preset: "cello", title: "Celloglaze", defaultAnswer: "None=none", otherAnswers: "Matte cello=matte_cello,Gloss cello=gloss_cello", description: "Small format cello choice." },
  { preset: "page_count", title: "Pages", defaultAnswer: "50", otherAnswers: "", description: "Pages per book or pad." },
  { preset: "copy_set", title: "Copies", defaultAnswer: "Duplicate=duplicate", otherAnswers: "Triplicate=triplicate,Quadruplicate=quadruplicate", description: "Copy set for carbon books." },
  { preset: "copy_colours", title: "Copy colours", defaultAnswer: "White / Yellow=white_yellow", otherAnswers: "White / Yellow / Pink=white_yellow_pink,White / Green / Blue=white_green_blue", description: "Carbonless sheet colour set." },
  { preset: "cover_colour", title: "Cover colour", defaultAnswer: "Blue=blue", otherAnswers: "White=white,Black=black,Green=green,Red=red,Yellow=yellow", description: "Cover card colour." },
  { preset: "tape_colour", title: "Tape colour", defaultAnswer: "Black=black", otherAnswers: "White=white,Blue=blue,Red=red,Green=green", description: "Binding tape colour." },
  { preset: "binding_type", title: "Binding", defaultAnswer: "Pad binding=pad_binding", otherAnswers: "Saddle stitch=saddle_stitch,Wire bind=wire_bind,Perfect bind=perfect_bind,Carbon book tape=carbon_book_tape", description: "Binding method." },
  { preset: "quantity", title: "Quantity", defaultAnswer: "1", otherAnswers: "", description: "Quantity staff enter while quoting." }
];

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

function StarterButton({ productId, card }: { productId: string; card: StarterCard }) {
  return (
    <form action={addStarterRulesAction} style={{ minWidth: 0 }}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="starterType" value={card.value} />
      <button type="submit" style={{ ...compactCardStyle, textAlign: "left", width: "100%", cursor: "pointer", minHeight: 210 }}>
        <span style={defaultPillStyle}>Recommended setup</span>
        <strong style={{ display: "block", marginTop: 12, fontSize: 18 }}>{card.title}</strong>
        <span style={{ display: "block", marginTop: 6, color: "#475467", lineHeight: 1.45 }}>{card.plainName}</span>
        <span style={{ display: "block", marginTop: 10, color: "#667085", fontSize: 13, lineHeight: 1.45 }}>{card.description}</span>
        <span style={{ display: "block", marginTop: 12, color: "#344054", fontSize: 12, lineHeight: 1.5 }}><strong>Creates questions:</strong> {card.defaultChoices}</span>
        <span style={{ display: "block", marginTop: 4, color: "#344054", fontSize: 12, lineHeight: 1.5 }}><strong>Creates material rows:</strong> {card.defaultMaterials}</span>
      </button>
    </form>
  );
}

function QuickChoiceButton({ productId, choice }: { productId: string; choice: ChoiceCard }) {
  return (
    <form action={addProductOptionAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="optionPreset" value={choice.preset} />
      <input type="hidden" name="defaultAnswer" value={choice.defaultAnswer} />
      <input type="hidden" name="otherOptionsCsv" value={choice.otherAnswers} />
      <button type="submit" style={{ ...compactCardStyle, textAlign: "left", width: "100%", cursor: "pointer", minHeight: 145 }}>
        <strong style={{ display: "block", fontSize: 15 }}>{choice.title}</strong>
        <span style={{ display: "block", marginTop: 7, color: "#067647", fontSize: 12, fontWeight: 900 }}>Default: {choice.defaultAnswer.split("=")[0]}</span>
        <span style={{ display: "block", marginTop: 8, color: "#667085", fontSize: 13, lineHeight: 1.45 }}>{choice.description}</span>
      </button>
    </form>
  );
}

function FieldCard({ field }: { field: Record<string, any> }) {
  return (
    <article style={{ ...compactCardStyle, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: 17 }}>{field.label}</strong>
          <div style={{ marginTop: 4, ...mutedTextStyle }}>{friendlyFieldType(field.type)} · {field.required ? "Required" : "Optional"}</div>
        </div>
        <span style={pillStyle}>{field.key}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 0.7fr) minmax(220px, 1.3fr)", gap: 10 }}>
        <div style={{ ...softCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
          <div style={{ ...labelTextStyle, color: "#067647" }}>Default answer</div>
          <div style={{ marginTop: 5, fontSize: 16, fontWeight: 900, color: "#064e3b" }}>{defaultChoiceLabel(field)}</div>
        </div>
        <div style={softCardStyle}>
          <div style={labelTextStyle}>Other answers staff can choose</div>
          <div style={{ marginTop: 5, ...mutedTextStyle }}>{otherChoiceLabels(field)}</div>
        </div>
      </div>
      {field.helpText ? <div style={mutedTextStyle}>{field.helpText}</div> : null}
    </article>
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

  const editorDefinition: EditorDefinition = {
    setupPreset: String(editorTemplate?.definitionJson?.setupPreset ?? "") || null,
    components: Array.isArray(editorTemplate?.definitionJson?.components) ? editorTemplate.definitionJson.components : [],
    fields: Array.isArray(editorTemplate?.definitionJson?.fields) ? editorTemplate.definitionJson.fields : []
  };

  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const activeMaterials = materials.filter((material) => material.active);
  const hasSetup = editorDefinition.components.length > 0 || editorDefinition.fields.length > 0;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gap: 16, minWidth: 0 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 16, fontWeight: 850 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 16, fontWeight: 850 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Catalog</p>
            <h1 style={{ margin: "10px 0 8px", fontSize: 34 }}>Products</h1>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 960 }}>
              Create products in plain production language: choose what you sell, add the purchased materials it consumes, then set the default answers staff see when quoting.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={pillStyle}>{products.length} products</span>
            <span style={pillStyle}>{activeMaterials.length} active materials</span>
            <span style={pillStyle}>GST automatic</span>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 350px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 16 }}>
          <details open style={{ ...cardStyle }}>
            <summary style={{ cursor: "pointer", fontSize: 20, fontWeight: 900 }}>Create product</summary>
            <form action={createProductAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product name</span>
                <input name="name" required placeholder="Business cards / 5mm corflute sign" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>SKU</span>
                <input name="sku" placeholder="Optional" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Product type</span>
                <select name="productFamily" defaultValue="rigid_signage" style={inputStyle}>
                  <option value="rigid_signage">Sheet sign / board sign</option>
                  <option value="roll_media">Roll print / vinyl / banner</option>
                  <option value="small_format_print">Business cards / flyers</option>
                  <option value="display_products">Books / pads / carbon books</option>
                  <option value="installation">Installation / labour</option>
                  <option value="general">General product</option>
                </select>
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Department</span>
                <select name="department" defaultValue="signage" style={inputStyle}>
                  <option value="signage">Signage</option>
                  <option value="small_format">Small format</option>
                  <option value="installation">Installation</option>
                  <option value="general">General</option>
                </select>
              </label>
              <input type="hidden" name="status" value="draft" />
              <button type="submit" style={buttonStyle}>Create product</button>
              <p style={{ margin: 0, ...mutedTextStyle }}>Tax code is saved as GST automatically.</p>
            </form>
          </details>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>Open product</h2>
              <p style={{ margin: "6px 0 0", color: "#475467", fontSize: 14 }}>Search and continue setup.</p>
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
                    <div style={{ marginTop: 5, fontSize: 13, color: "#475467" }}>{product.sku || "No SKU"} · {formatFamily(product.productFamily)}</div>
                    <div style={{ marginTop: 5, fontSize: 12, color: "#667085" }}>{product.templateName ? "setup started" : "needs setup"}</div>
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
                The new setup flow is designed for staff: choose a product starting point, add materials, then set default answers for quoting questions.
              </p>
            </section>
          ) : (
            <>
              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>Selected product</p>
                    <h2 style={{ margin: "8px 0 0", fontSize: 30 }}>{selectedProduct.name}</h2>
                    <p style={{ margin: "6px 0 0", color: "#667085" }}>{selectedProduct.sku || "No SKU"} · {formatFamily(selectedProduct.productFamily)} · GST</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={pillStyle}>{editorDefinition.components.length} material / work rows</span>
                    <span style={pillStyle}>{editorDefinition.fields.length} quoting questions</span>
                    <span style={defaultPillStyle}>{setupName(editorDefinition.setupPreset)}</span>
                  </div>
                </div>
                <div style={{ ...softCardStyle, display: "grid", gap: 8 }}>
                  <strong>Simple setup order</strong>
                  <div style={{ color: "#475467", lineHeight: 1.55 }}>1. Pick the closest product starting point. 2. Swap/add purchased materials. 3. Set the default answer for each quoting question. Staff can quote from defaults without understanding the calculation rules.</div>
                </div>
              </section>

              <section id="product-details" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="1" title="What are we selling?">
                  Keep this section simple. This is the sellable item staff select on a quote.
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
                      <span style={labelTextStyle}>Product type</span>
                      <select name="productFamily" defaultValue={selectedProduct.productFamily} style={inputStyle}>
                        <option value="rigid_signage">Sheet sign / board sign</option>
                        <option value="roll_media">Roll print / vinyl / banner</option>
                        <option value="small_format_print">Business cards / flyers</option>
                        <option value="display_products">Books / pads / carbon books</option>
                        <option value="installation">Installation / labour</option>
                        <option value="general">General product</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" style={buttonStyle}>Save product details</button>
                  </div>
                </form>
              </section>

              <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
                <StepHeading number="2" title="Pick the closest starting point">
                  This creates sensible default questions and material rows. You can still change the materials and default answers afterwards.
                </StepHeading>
                {hasSetup ? (
                  <div style={{ ...softCardStyle, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <strong>Current starting point: {setupName(editorDefinition.setupPreset)}</strong>
                      <div style={{ marginTop: 4, ...mutedTextStyle }}>Click another setup below only if this product should use a different starter set.</div>
                    </div>
                    <span style={defaultPillStyle}>Setup started</span>
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                  {starterCards.map((card) => <StarterButton key={card.value} productId={selectedProduct.id} card={card} />)}
                </div>
              </section>

              <section id="product-materials" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="3" title="What materials / work does it use?">
                  Add the purchased stock consumed by this product: whole sheets, part sheets, metres from a roll, cello, laminate, carbon paper, covers, tape, numbering or labour.
                </StepHeading>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.components.length === 0 ? (
                    <EmptyState>No material rows yet. Pick a starting point above or add the first material below.</EmptyState>
                  ) : (
                    editorDefinition.components.map((component, index) => {
                      const material = component.materialId ? materialMap.get(component.materialId) : null;
                      return (
                        <article key={component.id ?? `${component.label}-${index}`} style={{ ...compactCardStyle, display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div>
                              <strong style={{ fontSize: 17 }}>{component.label || material?.name || "Material row"}</strong>
                              <div style={{ marginTop: 4, ...mutedTextStyle }}>{material?.name ? `Purchased material: ${material.name}` : "No purchased material linked yet"}</div>
                            </div>
                            <span style={pillStyle}>{component.kind === "labour" ? "Work / labour" : "Material"}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>How it is used</div>
                              <div style={{ marginTop: 5, ...mutedTextStyle }}>{friendlyUsage(component)}</div>
                            </div>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>When it is used</div>
                              <div style={{ marginTop: 5, ...mutedTextStyle }}>{triggerSummary(component)}</div>
                            </div>
                            <div style={softCardStyle}>
                              <div style={labelTextStyle}>Waste allowance</div>
                              <div style={{ marginTop: 5, ...mutedTextStyle }}>{component.wastePercent ?? "0"}%</div>
                            </div>
                          </div>
                          {component.notes ? <div style={mutedTextStyle}>{component.notes}</div> : null}
                        </article>
                      );
                    })
                  )}
                </div>

                <details open={!hasSetup} style={{ ...softCardStyle }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add a material / work row</summary>
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
                        <span style={labelTextStyle}>Used as</span>
                        <select name="componentPreset" defaultValue="part_sheet_material" style={inputStyle}>
                          <option value="part_sheet_material">Part sheet from parent sheet</option>
                          <option value="full_sheet_material">Whole sheet / board</option>
                          <option value="roll_metres_material">Metres from a roll</option>
                          <option value="area_coverage_material">Area coverage: ink / laminate / cello</option>
                          <option value="paper_stock">Paper/card parent sheet yield</option>
                          <option value="each_material">Each item: eyelets / screws / boxes</option>
                          <option value="binding">Binding / tape consumable</option>
                          <option value="labour_time">Labour or machine time</option>
                        </select>
                      </label>
                    </div>
                    <div style={gridThreeStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Friendly name</span>
                        <input name="label" placeholder="eg 5mm ACM, matte cello, yellow copy paper" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Default amount</span>
                        <input name="quantity" placeholder="Leave blank for normal default" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Waste %</span>
                        <input name="wastePercent" placeholder="Leave blank for normal default" style={inputStyle} />
                      </label>
                    </div>
                    <details style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Only used for special cases</summary>
                      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                        <div style={gridThreeStyle}>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Parts per parent sheet</span>
                            <input name="partsPerSheet" placeholder="eg 8 up" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Only when question is</span>
                            <input name="triggerOptionKey" placeholder="eg cello / laminate / copy_set" style={inputStyle} />
                          </label>
                          <label style={labelStyle}>
                            <span style={labelTextStyle}>Only when answer is</span>
                            <input name="triggerOptionValuesCsv" placeholder="eg matte_cello,triplicate,black" style={inputStyle} />
                          </label>
                        </div>
                        <label style={labelStyle}>
                          <span style={labelTextStyle}>Notes for staff</span>
                          <textarea name="notes" rows={3} placeholder="Example: part sheet from 2440 × 1220 ACM, allow 10% waste." style={textareaStyle} />
                        </label>
                      </div>
                    </details>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <p style={{ margin: 0, ...mutedTextStyle }}>Most staff should only need material, used as, friendly name and default amount.</p>
                      <button type="submit" style={buttonStyle}>Add material / work row</button>
                    </div>
                  </form>
                </details>
              </section>

              <section id="product-options" style={{ ...cardStyle, ...sectionAnchorStyle, display: "grid", gap: 16 }}>
                <StepHeading number="4" title="What questions should quoting staff answer?">
                  Each question has a default answer. The default is what staff see first when quoting, and alternatives are only there when the job changes.
                </StepHeading>

                <div style={{ ...softCardStyle, background: "#ecfdf3", borderColor: "#abefc6" }}>
                  <strong style={{ color: "#067647" }}>How defaults work</strong>
                  <p style={{ margin: "6px 0 0", color: "#064e3b", lineHeight: 1.55 }}>
                    Example: for business cards, create the question “Celloglaze”, set the default answer to “None”, then add “Matt cello” and “Gloss cello” as other answers. Quoting staff can leave it at the default unless the client asks for cello.
                  </p>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {editorDefinition.fields.length === 0 ? (
                    <EmptyState>No quoting questions yet. Pick a starting point above or add the first question below.</EmptyState>
                  ) : (
                    editorDefinition.fields.map((field, index) => <FieldCard key={field.id ?? `${field.key}-${index}`} field={field} />)
                  )}
                </div>

                <details open={!hasSetup} style={{ ...softCardStyle }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add a simple quoting question</summary>
                  <form action={addProductOptionAction} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <input type="hidden" name="productId" value={selectedProduct.id} />
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Question type</span>
                        <select name="optionPreset" defaultValue="custom" style={inputStyle}>
                          <option value="custom">Custom question</option>
                          <option value="finished_size">Size</option>
                          <option value="sides">Front / back</option>
                          <option value="laminate">Laminate</option>
                          <option value="cello">Celloglaze</option>
                          <option value="page_count">Pages</option>
                          <option value="copy_set">Copies</option>
                          <option value="copy_colours">Copy colours</option>
                          <option value="cover_colour">Cover colour</option>
                          <option value="tape_colour">Tape colour</option>
                          <option value="binding_type">Binding</option>
                          <option value="quantity">Quantity</option>
                        </select>
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Question shown to staff</span>
                        <input name="questionLabel" placeholder="eg Celloglaze / Finished size / Copy colours" style={inputStyle} />
                      </label>
                    </div>
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Default answer</span>
                        <input name="defaultAnswer" placeholder="eg None / 600x900 / Duplicate / White-yellow" style={inputStyle} />
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Other answers</span>
                        <input name="otherOptionsCsv" placeholder="eg Matt cello,Gloss cello or 450x600,300x450" style={inputStyle} />
                      </label>
                    </div>
                    <div style={gridTwoStyle}>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Answer style</span>
                        <select name="fieldType" defaultValue="select" style={inputStyle}>
                          <option value="select">Pick one from a list</option>
                          <option value="size_select">Size list</option>
                          <option value="yes_no">Yes / no</option>
                          <option value="quantity">Number / quantity</option>
                          <option value="text">Typed answer</option>
                          <option value="color">Colour list</option>
                        </select>
                      </label>
                      <label style={labelStyle}>
                        <span style={labelTextStyle}>Help text</span>
                        <input name="helpText" placeholder="Optional note for quoting staff" style={inputStyle} />
                      </label>
                    </div>
                    <input type="hidden" name="required" value="yes" />
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <p style={{ margin: 0, ...mutedTextStyle }}>The default answer is saved first. Other answers are optional.</p>
                      <button type="submit" style={buttonStyle}>Add quoting question</button>
                    </div>
                  </form>
                </details>

                <section style={{ display: "grid", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18 }}>One-click common questions</h3>
                    <p style={{ margin: "6px 0 0", ...mutedTextStyle }}>These add a question with a sensible default answer already set.</p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                    {choiceCards.map((choice) => <QuickChoiceButton key={choice.preset} productId={selectedProduct.id} choice={choice} />)}
                  </div>
                </section>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
