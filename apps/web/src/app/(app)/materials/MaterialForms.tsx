"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { createMaterialAction, updateMaterialAction } from "./actions";

type SupplierOption = {
  id: string;
  displayName: string;
};

type MaterialFormRecord = {
  id: string;
  supplierId: string | null;
  name: string;
  sku: string | null;
  materialType: string;
  materialGroup: string | null;
  stockUom: string | null;
  purchaseUom: string | null;
  stockQuantity: string | null;
  purchaseCost: string | null;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  notes: string | null;
};

type MaterialGroupValue = "signage" | "plan-printing" | "poster-printing" | "small-format" | "shared";

type MaterialKind =
  | "sheet_media"
  | "roll_media"
  | "roll_laminate"
  | "paper_stock"
  | "card_stock"
  | "cello_stock"
  | "binding"
  | "finishing"
  | "fixing"
  | "item"
  | "other";

const materialGroupOptions: Array<{ value: MaterialGroupValue; label: string; hint: string }> = [
  { value: "signage", label: "Signage", hint: "ACM, corflute, acrylic, PVC, banner, vinyl and signage laminate." },
  { value: "plan-printing", label: "Plan printing", hint: "Plan paper, bond paper, CAD paper and plan film rolls or sheets." },
  { value: "poster-printing", label: "Poster printing", hint: "Poster paper, photo paper, presentation stock and synthetic poster media." },
  { value: "small-format", label: "Small format", hint: "Paper, card, cello, binding, tape and bookmaking stock." },
  { value: "shared", label: "Shared / consumables", hint: "Eyelets, fixings, hardware, blades, app tape and general consumables." }
];

const materialTypeOptions: Array<{ value: MaterialKind; label: string; hint: string }> = [
  { value: "sheet_media", label: "Sheet material", hint: "ACM, corflute, acrylic, PVC, foamboard." },
  { value: "roll_media", label: "Roll media", hint: "SAV, banner, printable vinyl, print film." },
  { value: "roll_laminate", label: "Roll laminate", hint: "Gloss, matte, anti-graffiti, whiteboard laminate." },
  { value: "paper_stock", label: "Paper stock", hint: "Plan, poster or small-format paper supplied as reams, packs or sheets." },
  { value: "card_stock", label: "Card stock", hint: "Business card stock, cover stock, heavier sheet stock." },
  { value: "cello_stock", label: "Cello / coating roll", hint: "Celloglaze, coating film, small format laminate rolls." },
  { value: "binding", label: "Binding / tape", hint: "Book tape, binding strips, wire, comb, padding glue." },
  { value: "finishing", label: "Finishing consumable", hint: "Eyelets, drill bits, blades, masking, app tape." },
  { value: "fixing", label: "Hardware / fixing", hint: "Screws, standoffs, brackets, fixings." },
  { value: "item", label: "Consumable / each item", hint: "Items bought and used one-by-one or by box/pack." },
  { value: "other", label: "Other", hint: "Fallback for anything that does not fit above." }
];

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
const helperStyle: CSSProperties = { margin: 0, color: "#667085", fontSize: 12, lineHeight: 1.35 };
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 };
const buttonStyle: CSSProperties = { minHeight: 46, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer", padding: "0 16px" };

function normaliseMaterialKind(value: string | null | undefined): MaterialKind {
  switch (value) {
    case "sheet":
    case "sheet_media":
      return "sheet_media";
    case "roll":
    case "roll_media":
      return "roll_media";
    case "roll_laminate":
      return "roll_laminate";
    case "paper":
    case "paper_stock":
      return "paper_stock";
    case "card stock":
    case "card_stock":
      return "card_stock";
    case "cello_stock":
      return "cello_stock";
    case "binding":
      return "binding";
    case "finishing":
      return "finishing";
    case "hardware":
    case "fixing":
      return "fixing";
    case "consumable":
    case "item":
      return "item";
    default:
      return "other";
  }
}

function normaliseMaterialGroup(value: string | null | undefined, kind: MaterialKind): MaterialGroupValue {
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
      if (kind === "paper_stock" || kind === "card_stock" || kind === "cello_stock" || kind === "binding") return "small-format";
      if (kind === "sheet_media" || kind === "roll_media" || kind === "roll_laminate") return "signage";
      return "shared";
  }
}

function defaultStockUomFor(kind: MaterialKind): string {
  switch (kind) {
    case "roll_media":
    case "roll_laminate":
    case "cello_stock":
      return "lm";
    case "paper_stock":
    case "card_stock":
    case "sheet_media":
      return "sheet";
    case "binding":
    case "finishing":
    case "fixing":
    case "item":
      return "each";
    default:
      return "unit";
  }
}

function defaultPurchaseUomFor(kind: MaterialKind): string {
  switch (kind) {
    case "roll_media":
    case "roll_laminate":
    case "cello_stock":
      return "roll";
    case "paper_stock":
    case "card_stock":
      return "ream";
    case "sheet_media":
      return "sheet";
    case "binding":
    case "finishing":
    case "fixing":
    case "item":
      return "box";
    default:
      return "unit";
  }
}

function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) {
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>{label}</span>
      {children}
      {helper ? <p style={helperStyle}>{helper}</p> : null}
    </label>
  );
}

function SupplierSelect({ suppliers, defaultValue = "" }: { suppliers: SupplierOption[]; defaultValue?: string }) {
  return (
    <select name="supplierId" defaultValue={defaultValue} style={inputStyle}>
      <option value="">No supplier linked</option>
      {suppliers.map((supplier) => (
        <option key={supplier.id} value={supplier.id}>{supplier.displayName}</option>
      ))}
    </select>
  );
}

function GroupSelect({ value, onChange }: { value: MaterialGroupValue; onChange: (value: MaterialGroupValue) => void }) {
  return (
    <Field label="Material category" helper="This decides which department card and quote material list this stock appears under.">
      <select name="materialGroup" value={value} onChange={(event) => onChange(event.target.value as MaterialGroupValue)} style={inputStyle}>
        {materialGroupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

function TypeSelect({ value, onChange }: { value: MaterialKind; onChange: (value: MaterialKind) => void }) {
  return (
    <Field label="Material type" helper="This changes the fields below so you only see what matters for this material.">
      <select name="materialType" value={value} onChange={(event) => onChange(event.target.value as MaterialKind)} style={inputStyle}>
        {materialTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

function GroupHint({ group }: { group: MaterialGroupValue }) {
  const option = materialGroupOptions.find((item) => item.value === group);
  return (
    <div style={{ border: "1px solid #c7d7fe", background: "#f5f7ff", color: "#3730a3", borderRadius: 14, padding: 12, fontSize: 13, lineHeight: 1.45 }}>
      <strong>{option?.label ?? "Material category"}</strong>: {option?.hint ?? "Choose the department that owns this stock."}
    </div>
  );
}

function TypeHint({ kind }: { kind: MaterialKind }) {
  const option = materialTypeOptions.find((item) => item.value === kind);
  return (
    <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 14, padding: 12, fontSize: 13, lineHeight: 1.45 }}>
      <strong>{option?.label ?? "Material"}</strong>: {option?.hint ?? "Only the relevant setup fields are shown."}
    </div>
  );
}

function UnitSelect({ name, defaultValue, options }: { name: string; defaultValue: string; options: string[] }) {
  return (
    <select name={name} defaultValue={defaultValue} style={inputStyle}>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function CommonTopFields({ suppliers, material }: { suppliers: SupplierOption[]; material?: MaterialFormRecord }) {
  return (
    <>
      <div style={gridStyle}>
        <Field label="Material name">
          <input name="name" required defaultValue={material?.name ?? ""} placeholder="eg 3mm ACM White 2440 × 1220" style={inputStyle} />
        </Field>
        <Field label="Supplier">
          <SupplierSelect suppliers={suppliers} defaultValue={material?.supplierId ?? ""} />
        </Field>
      </div>
      <div style={gridStyle}>
        <Field label="Supplier SKU">
          <input name="sku" defaultValue={material?.sku ?? ""} placeholder="eg ACM-3-WHT" style={inputStyle} />
        </Field>
      </div>
    </>
  );
}

function SheetFields({ material, kind }: { material?: MaterialFormRecord; kind: MaterialKind }) {
  const isPaperOrCard = kind === "paper_stock" || kind === "card_stock";
  return (
    <>
      <div style={gridStyle}>
        <Field label={isPaperOrCard ? "Sheet width mm" : "Sheet width mm"} helper="The short side or sheet width used for nesting and area cost.">
          <input name="widthMm" defaultValue={material?.widthMm ?? ""} placeholder={isPaperOrCard ? "eg 210, 320 or 450" : "eg 1220"} style={inputStyle} />
        </Field>
        <Field label={isPaperOrCard ? "Sheet length mm" : "Sheet length mm"} helper="The long side or sheet length used for nesting and area cost.">
          <input name="lengthMm" defaultValue={material?.lengthMm ?? ""} placeholder={isPaperOrCard ? "eg 297, 450 or 640" : "eg 2440"} style={inputStyle} />
        </Field>
        <Field label="GSM / Thickness" helper={isPaperOrCard ? "Paper and card stock usually use GSM. Rigid sheets usually use thickness." : "Use thickness for rigid sheets, eg 3mm, 5mm, 10mm."}>
          <input name="gsm" defaultValue={material?.gsm ?? ""} placeholder={isPaperOrCard ? "eg 150gsm, 250gsm, 350gsm" : "eg 3mm"} style={inputStyle} />
        </Field>
      </div>
      <div style={gridStyle}>
        <Field label={isPaperOrCard ? "Bought as" : "Bought as"} helper={isPaperOrCard ? "How the supplier sells it: ream, pack, sheet or box." : "How the supplier sells it: sheet, pack or pallet."}>
          <UnitSelect name="purchaseUom" defaultValue={material?.purchaseUom ?? defaultPurchaseUomFor(kind)} options={isPaperOrCard ? ["ream", "pack", "box", "sheet"] : ["sheet", "pack", "pallet"]} />
        </Field>
        <Field label={isPaperOrCard ? "Used / sold as" : "Used as"} helper="How product recipes consume this material.">
          <UnitSelect name="stockUom" defaultValue={material?.stockUom ?? defaultStockUomFor(kind)} options={["sheet", "sqm", "each"]} />
        </Field>
        <Field label={isPaperOrCard ? "Stock qty / sheets per ream" : "Sheets in stock"} helper={isPaperOrCard ? "Use stock count or sheets per ream/pack if you cost by ream." : "Current sheet count. Use 0 if you do not track stock yet."}>
          <input name="stockQuantity" defaultValue={material?.stockQuantity ?? "0"} placeholder={isPaperOrCard ? "eg 500" : "eg 12"} style={inputStyle} />
        </Field>
        <Field label={isPaperOrCard ? "Purchase cost" : "Cost per sheet"} helper={isPaperOrCard ? "Cost for the selected Bought as unit, eg cost per ream/pack/sheet." : "Supplier cost for one sheet."}>
          <input name="purchaseCost" defaultValue={material?.purchaseCost ?? "0"} placeholder={isPaperOrCard ? "eg 38.50" : "eg 80"} style={inputStyle} />
        </Field>
      </div>
    </>
  );
}

function RollFields({ material, kind }: { material?: MaterialFormRecord; kind: MaterialKind }) {
  const isCello = kind === "cello_stock";
  return (
    <>
      <div style={gridStyle}>
        <Field label="Roll width mm" helper="The usable roll width, used to calculate the shortest linear metre usage.">
          <input name="rollWidthMm" defaultValue={material?.rollWidthMm ?? ""} placeholder={isCello ? "eg 320 or 450" : "eg 1370, 1520"} style={inputStyle} />
        </Field>
        <Field label="Roll length lm" helper="The length on the roll. Used to calculate $/lm when bought as a full roll.">
          <input name="stockQuantity" defaultValue={material?.stockQuantity ?? "0"} placeholder="eg 40 or 50" style={inputStyle} />
        </Field>
        <Field label="GSM / Thickness" helper="Optional media weight, laminate thickness, micron rating or description.">
          <input name="gsm" defaultValue={material?.gsm ?? ""} placeholder="eg 100mic, 145gsm, 80mic" style={inputStyle} />
        </Field>
      </div>
      <div style={gridStyle}>
        <Field label="Bought as" helper="Use roll if the supplier charges one full roll price. Use lm if they sell cut metres.">
          <UnitSelect name="purchaseUom" defaultValue={material?.purchaseUom ?? defaultPurchaseUomFor(kind)} options={["roll", "lm", "sqm"]} />
        </Field>
        <Field label="Used / sold as" helper="Most roll stock should be consumed by linear metre.">
          <UnitSelect name="stockUom" defaultValue={material?.stockUom ?? defaultStockUomFor(kind)} options={["lm", "sqm", "roll"]} />
        </Field>
        <Field label="Purchase cost" helper="If bought as roll, enter full roll cost. The picker can display $/lm from roll length.">
          <input name="purchaseCost" defaultValue={material?.purchaseCost ?? "0"} placeholder="eg 450" style={inputStyle} />
        </Field>
      </div>
    </>
  );
}

function EachFields({ material, kind }: { material?: MaterialFormRecord; kind: MaterialKind }) {
  const isBinding = kind === "binding";
  return (
    <div style={gridStyle}>
      <Field label="Bought as" helper={isBinding ? "Roll, box, pack or each depending on binding/tape." : "How the supplier sells it: box, pack or each."}>
        <UnitSelect name="purchaseUom" defaultValue={material?.purchaseUom ?? defaultPurchaseUomFor(kind)} options={isBinding ? ["roll", "box", "pack", "each"] : ["box", "pack", "bag", "each"]} />
      </Field>
      <Field label="Used / sold as" helper="How product recipes consume this item.">
        <UnitSelect name="stockUom" defaultValue={material?.stockUom ?? defaultStockUomFor(kind)} options={["each", "pack", "box", "lm"]} />
      </Field>
      <Field label="Units per pack / stock qty" helper="For eyelets, screws, tape rolls, binding strips, etc. Use 1 if priced each.">
        <input name="stockQuantity" defaultValue={material?.stockQuantity ?? "0"} placeholder="eg 100, 500 or 1" style={inputStyle} />
      </Field>
      <Field label="Purchase cost" helper="Cost for the selected Bought as unit.">
        <input name="purchaseCost" defaultValue={material?.purchaseCost ?? "0"} placeholder="eg 25" style={inputStyle} />
      </Field>
      {isBinding ? (
        <Field label="GSM / Thickness" helper="Optional tape width, wire size or binding description.">
          <input name="gsm" defaultValue={material?.gsm ?? ""} placeholder="eg 24mm tape, 6mm wire" style={inputStyle} />
        </Field>
      ) : null}
    </div>
  );
}

function ParameterFields({ kind, material }: { kind: MaterialKind; material?: MaterialFormRecord }) {
  if (kind === "roll_media" || kind === "roll_laminate" || kind === "cello_stock") {
    return <RollFields kind={kind} material={material} />;
  }

  if (kind === "sheet_media" || kind === "paper_stock" || kind === "card_stock") {
    return <SheetFields kind={kind} material={material} />;
  }

  return <EachFields kind={kind} material={material} />;
}

function MaterialFormBody({ suppliers, material, submitLabel }: { suppliers: SupplierOption[]; material?: MaterialFormRecord; submitLabel: string }) {
  const initialKind = useMemo(() => normaliseMaterialKind(material?.materialType), [material?.materialType]);
  const initialGroup = useMemo(() => normaliseMaterialGroup(material?.materialGroup, initialKind), [material?.materialGroup, initialKind]);
  const [kind, setKind] = useState<MaterialKind>(initialKind);
  const [group, setGroup] = useState<MaterialGroupValue>(initialGroup);

  return (
    <>
      {material ? <input type="hidden" name="materialId" value={material.id} /> : null}
      <CommonTopFields suppliers={suppliers} material={material} />
      <div style={gridStyle}>
        <GroupSelect value={group} onChange={setGroup} />
        <TypeSelect value={kind} onChange={setKind} />
      </div>
      <GroupHint group={group} />
      <TypeHint kind={kind} />
      <ParameterFields kind={kind} material={material} />
      <Field label="Notes">
        <textarea
          name="notes"
          rows={4}
          defaultValue={material?.notes ?? ""}
          placeholder="Supplier notes, yield assumptions, stock handling, ream/pack details, special ordering notes."
          style={textareaStyle}
        />
      </Field>
      <button type="submit" style={buttonStyle}>{submitLabel}</button>
    </>
  );
}

export function CreateMaterialForm({ suppliers }: { suppliers: SupplierOption[] }) {
  return (
    <form action={createMaterialAction} style={{ display: "grid", gap: 14, marginTop: 16 }}>
      <MaterialFormBody suppliers={suppliers} submitLabel="Create material" />
    </form>
  );
}

export function EditMaterialForm({ suppliers, material }: { suppliers: SupplierOption[]; material: MaterialFormRecord }) {
  return (
    <form action={updateMaterialAction} style={{ display: "grid", gap: 14, marginTop: 14 }}>
      <MaterialFormBody suppliers={suppliers} material={material} submitLabel="Save material changes" />
    </form>
  );
}
