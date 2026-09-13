"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMaterialPriceManagerAction } from "./actions";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type MaterialManagerSource = {
  id: string;
  name: string;
  customerFacingName: string | null;
  supplierName: string | null;
  sku: string | null;
  materialType: string;
  materialGroup: string | null;
  stockUom: string;
  purchaseUom: string;
  stockQuantity: string;
  purchaseCost: string;
  widthMm: string | null;
  lengthMm: string | null;
  rollWidthMm: string | null;
  gsm: string | null;
  active: boolean;
  priceCheckedAt: string;
  catalogState: string;
};

type SupplierOption = { displayName: string; isActive: boolean };
type MaterialAction = "KEEP" | "ADD" | "HIDE" | "ARCHIVE" | "RESTORE";
type GroupKey = "signage" | "small-format" | "plan-printing" | "poster-printing" | "shared";

type GridRow = {
  key: string;
  id: string | null;
  action: MaterialAction;
  materialGroup: GroupKey;
  materialType: string;
  name: string;
  customerFacingName: string;
  supplierName: string;
  sku: string;
  purchaseUom: string;
  stockUom: string;
  stockQuantity: string;
  purchaseCost: string;
  widthMm: string;
  lengthMm: string;
  rollWidthMm: string;
  gsm: string;
  priceCheckedAt: string;
  active: boolean;
  savedState: "active" | "hidden" | "archived";
};

type SaveResult =
  | { ok: true; updated: number; added: number; supplierPlaceholders: number; hidden: number; archived: number; restored: number; syncQueued: number }
  | { ok: false; error: string };

type Section = { key: string; label: string; types: string[]; defaultType: string };

const GROUPS: Array<{ key: GroupKey; label: string }> = [
  { key: "signage", label: "Signage" },
  { key: "small-format", label: "Small Format" },
  { key: "plan-printing", label: "Plan Printing" },
  { key: "poster-printing", label: "Poster Printing" },
  { key: "shared", label: "Shared + Consumables" }
];

const SECTIONS: Record<GroupKey, Section[]> = {
  signage: [
    { key: "sheet", label: "Sheet stock", types: ["sheet_media"], defaultType: "sheet_media" },
    { key: "roll", label: "Roll media", types: ["roll_media"], defaultType: "roll_media" },
    { key: "laminate", label: "Laminate", types: ["roll_laminate"], defaultType: "roll_laminate" },
    { key: "fixing", label: "Hardware / fixings", types: ["fixing"], defaultType: "fixing" },
    { key: "consumable", label: "Consumables", types: ["finishing", "item"], defaultType: "finishing" },
    { key: "other", label: "Other", types: ["other", "paper_stock", "card_stock", "cello_stock", "binding"], defaultType: "other" }
  ],
  "small-format": [
    { key: "paper", label: "Paper", types: ["paper_stock"], defaultType: "paper_stock" },
    { key: "card", label: "Card", types: ["card_stock"], defaultType: "card_stock" },
    { key: "cello", label: "Cello / coating", types: ["cello_stock"], defaultType: "cello_stock" },
    { key: "binding", label: "Binding / tape", types: ["binding"], defaultType: "binding" },
    { key: "consumable", label: "Consumables", types: ["finishing", "item"], defaultType: "finishing" },
    { key: "other", label: "Other", types: ["other", "sheet_media", "roll_media", "roll_laminate", "fixing"], defaultType: "other" }
  ],
  "plan-printing": [
    { key: "paper", label: "Paper", types: ["paper_stock"], defaultType: "paper_stock" },
    { key: "roll", label: "Roll media", types: ["roll_media"], defaultType: "roll_media" },
    { key: "sheet", label: "Sheet media", types: ["sheet_media"], defaultType: "sheet_media" },
    { key: "other", label: "Other", types: ["other", "card_stock", "cello_stock", "binding", "finishing", "fixing", "item", "roll_laminate"], defaultType: "other" }
  ],
  "poster-printing": [
    { key: "paper", label: "Paper", types: ["paper_stock"], defaultType: "paper_stock" },
    { key: "roll", label: "Roll media", types: ["roll_media"], defaultType: "roll_media" },
    { key: "sheet", label: "Sheet media", types: ["sheet_media"], defaultType: "sheet_media" },
    { key: "other", label: "Other", types: ["other", "card_stock", "cello_stock", "binding", "finishing", "fixing", "item", "roll_laminate"], defaultType: "other" }
  ],
  shared: [
    { key: "fixing", label: "Hardware / fixings", types: ["fixing"], defaultType: "fixing" },
    { key: "finishing", label: "Finishing", types: ["finishing"], defaultType: "finishing" },
    { key: "binding", label: "Binding / tape", types: ["binding"], defaultType: "binding" },
    { key: "consumable", label: "General consumables", types: ["item"], defaultType: "item" },
    { key: "other", label: "Other", types: ["other", "sheet_media", "roll_media", "roll_laminate", "paper_stock", "card_stock", "cello_stock"], defaultType: "other" }
  ]
};

const TYPE_OPTIONS = [
  ["sheet_media", "Sheet stock"],
  ["roll_media", "Roll media"],
  ["roll_laminate", "Laminate"],
  ["paper_stock", "Paper"],
  ["card_stock", "Card"],
  ["cello_stock", "Cello / coating"],
  ["binding", "Binding / tape"],
  ["finishing", "Finishing"],
  ["fixing", "Hardware / fixing"],
  ["item", "Consumable"],
  ["other", "Other"]
] as const;

const cellInputStyle = {
  width: "100%",
  minWidth: 0,
  height: 36,
  border: "1px solid #e4e7ec",
  borderRadius: 8,
  background: "#fff",
  padding: "0 8px",
  fontSize: 13,
  color: "#101828",
  boxSizing: "border-box" as const,
  outline: "none"
};

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 5 });

function canonicalType(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (raw === "sheet") return "sheet_media";
  if (raw === "roll") return "roll_media";
  if (raw === "paper") return "paper_stock";
  if (raw === "card stock") return "card_stock";
  if (raw === "roll laminate") return "roll_laminate";
  if (raw === "hardware") return "fixing";
  if (raw === "consumable") return "item";
  return TYPE_OPTIONS.some(([key]) => key === raw) ? raw : "other";
}

function groupForMaterial(material: MaterialManagerSource): GroupKey {
  const raw = String(material.materialGroup ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (GROUPS.some((group) => group.key === raw)) return raw as GroupKey;
  const type = canonicalType(material.materialType);
  if (["paper_stock", "card_stock", "cello_stock", "binding"].includes(type)) return "small-format";
  if (["sheet_media", "roll_media", "roll_laminate"].includes(type)) return "signage";
  return "shared";
}

function savedState(material: MaterialManagerSource): GridRow["savedState"] {
  if (material.active) return "active";
  const state = String(material.catalogState ?? "").toLowerCase();
  return state === "hidden" ? "hidden" : "archived";
}

function priceChecked(material: MaterialManagerSource): string {
  const value = String(material.priceCheckedAt ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function rowsFromMaterials(materials: MaterialManagerSource[]): GridRow[] {
  return materials.map((material) => ({
    key: material.id,
    id: material.id,
    action: "KEEP",
    materialGroup: groupForMaterial(material),
    materialType: canonicalType(material.materialType),
    name: material.name ?? "",
    customerFacingName: material.customerFacingName ?? "",
    supplierName: material.supplierName ?? "",
    sku: material.sku ?? "",
    purchaseUom: material.purchaseUom ?? "unit",
    stockUom: material.stockUom ?? "unit",
    stockQuantity: String(material.stockQuantity ?? ""),
    purchaseCost: String(material.purchaseCost ?? ""),
    widthMm: material.widthMm ?? "",
    lengthMm: material.lengthMm ?? "",
    rollWidthMm: material.rollWidthMm ?? "",
    gsm: material.gsm ?? "",
    priceCheckedAt: priceChecked(material),
    active: material.active,
    savedState: savedState(material)
  }));
}

function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultUoms(type: string): { purchaseUom: string; stockUom: string } {
  if (["paper_stock", "card_stock"].includes(type)) return { purchaseUom: "ream", stockUom: "sheet" };
  if (["roll_media", "roll_laminate", "cello_stock"].includes(type)) return { purchaseUom: "roll", stockUom: "m" };
  if (type === "sheet_media") return { purchaseUom: "sheet", stockUom: "sheet" };
  return { purchaseUom: "unit", stockUom: "unit" };
}

function unitCost(row: GridRow): number {
  const cost = Number(String(row.purchaseCost).replace(/,/g, ""));
  const qty = Number(String(row.stockQuantity).replace(/,/g, ""));
  if (!Number.isFinite(cost)) return 0;
  const purchase = row.purchaseUom.toLowerCase();
  const stock = row.stockUom.toLowerCase();
  const divided = purchase.includes("ream") || purchase.includes("pack") || purchase.includes("box") || purchase.includes("bag") || (purchase.includes("roll") && ["m", "lm", "metre", "meter", "linear metre", "linear meter"].includes(stock));
  return divided && Number.isFinite(qty) && qty > 0 ? cost / qty : cost;
}

function sectionForType(group: GroupKey, type: string): string {
  const canonical = canonicalType(type);
  return SECTIONS[group].find((section) => section.types.includes(canonical))?.key ?? "other";
}

export function MaterialPriceManager({ tenantId, materials, suppliers }: { tenantId: string; materials: MaterialManagerSource[]; suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<GridRow[]>(() => rowsFromMaterials(materials));
  const [group, setGroup] = useState<GroupKey>("signage");
  const [section, setSection] = useState("all");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [syncMyob, setSyncMyob] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirtyCountRef = useRef(0);

  useEffect(() => { dirtyCountRef.current = dirty.size; }, [dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyCountRef.current < 1) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (dirtyCountRef.current === 0) setRows(rowsFromMaterials(materials));
  }, [materials]);
  useEffect(() => {
    const refreshIfClean = () => { if (dirtyCountRef.current === 0) router.refresh(); };
    const timer = window.setInterval(refreshIfClean, 60_000);
    window.addEventListener("focus", refreshIfClean);

    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null = null;
    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel("material-price-manager-live")
        .on("postgres_changes", { event: "*", schema: "catalog", table: "materials", filter: `tenant_id=eq.${tenantId}` }, refreshIfClean)
        .on("postgres_changes", { event: "*", schema: "app", table: "suppliers", filter: `tenant_id=eq.${tenantId}` }, refreshIfClean)
        .subscribe();
    } catch {
      // The focus/interval refresh remains as a safe fallback if Realtime is unavailable.
    }

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfClean);
      if (channel) void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [router, tenantId]);

  const supplierNames = useMemo(() => [...new Set(suppliers.filter((supplier) => supplier.isActive).map((supplier) => supplier.displayName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [suppliers]);
  const sections = SECTIONS[group];

  useEffect(() => {
    if (section !== "all" && !SECTIONS[group].some((item) => item.key === section)) setSection("all");
  }, [group, section]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.materialGroup !== group) return false;
      if (!showInactive && !row.active && row.id && !dirty.has(row.key)) return false;
      if (section !== "all" && sectionForType(group, row.materialType) !== section && !dirty.has(row.key)) return false;
      if (!needle) return true;
      return [row.name, row.customerFacingName, row.supplierName, row.sku, row.materialType, row.purchaseUom, row.stockUom].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, group, showInactive, section, search, dirty]);

  const groupCounts = useMemo(() => Object.fromEntries(GROUPS.map((item) => [item.key, rows.filter((row) => row.materialGroup === item.key && (showInactive || row.active || !row.id)).length])) as Record<GroupKey, number>, [rows, showInactive]);

  function markDirty(key: string) {
    setDirty((current) => { const next = new Set(current); next.add(key); return next; });
    setMessage(""); setError("");
  }

  function updateRow(key: string, field: keyof GridRow, value: string | boolean) {
    setRows((current) => current.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, [field]: value } as GridRow;
      if (field === "purchaseCost") next.priceCheckedAt = todayLocal();
      if (field === "action") {
        if (value === "HIDE" || value === "ARCHIVE") next.active = false;
        else if (value === "RESTORE") next.active = true;
        else if (value === "KEEP") next.active = row.savedState === "active";
      }
      if (field === "materialType" && !row.id) {
        const uoms = defaultUoms(String(value));
        next.purchaseUom = uoms.purchaseUom;
        next.stockUom = uoms.stockUom;
      }
      return next;
    }));
    markDirty(key);
  }

  function addMaterial() {
    const currentSection = section === "all" ? sections[0] : sections.find((item) => item.key === section) ?? sections[0];
    const materialType = currentSection.defaultType;
    const uoms = defaultUoms(materialType);
    const key = `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setRows((current) => [...current, {
      key, id: null, action: "ADD", materialGroup: group, materialType, name: "", customerFacingName: "", supplierName: "", sku: "",
      purchaseUom: uoms.purchaseUom, stockUom: uoms.stockUom, stockQuantity: "", purchaseCost: "", widthMm: "", lengthMm: "", rollWidthMm: "", gsm: "",
      priceCheckedAt: todayLocal(), active: true, savedState: "active"
    }]);
    setSection(currentSection.key);
    markDirty(key);
  }

  function duplicateRow(source: GridRow) {
    const key = `new-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const copy: GridRow = { ...source, key, id: null, action: "ADD", name: `${source.name} copy`, active: true, savedState: "active", priceCheckedAt: todayLocal() };
    setRows((current) => [...current, copy]);
    markDirty(key);
  }

  function removeNewRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
    setDirty((current) => { const next = new Set(current); next.delete(key); return next; });
  }

  function discardChanges() {
    if (dirty.size && !window.confirm(`Discard ${dirty.size} unsaved material change${dirty.size === 1 ? "" : "s"}?`)) return;
    setRows(rowsFromMaterials(materials));
    setDirty(new Set());
    setMessage(""); setError("");
  }

  function saveChanges() {
    const changedRows = rows.filter((row) => dirty.has(row.key));
    if (!changedRows.length) return;
    const invalid = changedRows.find((row) => !row.name.trim());
    if (invalid) { setError("Every new or edited material needs an internal material name before saving."); return; }
    if (!window.confirm(`Save ${changedRows.length} material change${changedRows.length === 1 ? "" : "s"}?\n\nExisting quotes and historical jobs will not be repriced.`)) return;

    const payload = changedRows.map((row) => ({
      id: row.id,
      action: row.id ? row.action : "ADD",
      materialGroup: row.materialGroup,
      materialType: row.materialType,
      name: row.name,
      customerFacingName: row.customerFacingName || null,
      supplierName: row.supplierName || null,
      sku: row.sku || null,
      purchaseUom: row.purchaseUom,
      stockUom: row.stockUom,
      stockQuantity: row.stockQuantity,
      purchaseCost: row.purchaseCost,
      widthMm: row.widthMm || null,
      lengthMm: row.lengthMm || null,
      rollWidthMm: row.rollWidthMm || null,
      gsm: row.gsm || null,
      priceCheckedAt: row.priceCheckedAt || null
    }));
    const formData = new FormData();
    formData.set("changes", JSON.stringify(payload));
    if (syncMyob) formData.set("syncMyob", "true");
    setError(""); setMessage("");

    startTransition(async () => {
      const result = await saveMaterialPriceManagerAction(formData) as SaveResult;
      if ("error" in result) { setError(result.error); return; }
      const parts = [
        result.updated ? `${result.updated} updated` : "",
        result.added ? `${result.added} added` : "",
        result.supplierPlaceholders ? `${result.supplierPlaceholders} placeholder supplier${result.supplierPlaceholders === 1 ? "" : "s"} created` : "",
        result.hidden ? `${result.hidden} hidden` : "",
        result.archived ? `${result.archived} archived` : "",
        result.restored ? `${result.restored} restored` : "",
        result.syncQueued ? `${result.syncQueued} MYOB sync${result.syncQueued === 1 ? "" : "s"} queued` : ""
      ].filter(Boolean);
      setDirty(new Set());
      setMessage(parts.length ? `${parts.join(" · ")}.` : "Changes saved.");
      router.refresh();
    });
  }

  function pasteCosts(startKey: string, raw: string) {
    const values = raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (values.length < 2) return false;
    const start = visibleRows.findIndex((row) => row.key === startKey);
    if (start < 0) return false;
    const targets = visibleRows.slice(start, start + values.length);
    setRows((current) => {
      const updates = new Map(targets.map((row, index) => [row.key, values[index].replace(/^\$/, "").replace(/,/g, "")]));
      return current.map((row) => updates.has(row.key) ? { ...row, purchaseCost: updates.get(row.key) ?? row.purchaseCost, priceCheckedAt: row.priceCheckedAt || todayLocal() } : row);
    });
    setDirty((current) => { const next = new Set(current); targets.forEach((row) => next.add(row.key)); return next; });
    return true;
  }

  return (
    <section style={{ border: "1px solid #c7d7fe", borderRadius: 20, background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: 18, borderBottom: "1px solid #e4e7ec", background: "linear-gradient(180deg,#f8fbff 0%,#fff 100%)", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Material Price Manager</h2>
              <span style={{ borderRadius: 999, background: "#eef2ff", color: "#4338ca", padding: "4px 9px", fontSize: 11, fontWeight: 900 }}>OWNER / MANAGER</span>
            </div>
            <p style={{ margin: "6px 0 0", color: "#475467", lineHeight: 1.5, maxWidth: 880 }}>Edit materials directly like a spreadsheet. Changes stay highlighted until you save them. New supplier names automatically create a placeholder supplier in PM.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {dirty.size ? <span style={{ borderRadius: 999, background: "#fff7ed", color: "#b54708", padding: "7px 10px", fontSize: 12, fontWeight: 900 }}>{dirty.size} unsaved</span> : <span style={{ borderRadius: 999, background: "#ecfdf3", color: "#067647", padding: "7px 10px", fontSize: 12, fontWeight: 900 }}>Up to date</span>}
            <button type="button" onClick={discardChanges} disabled={!dirty.size || isPending} style={{ minHeight: 40, borderRadius: 10, border: "1px solid #d0d5dd", background: "#fff", color: "#344054", fontWeight: 800, padding: "0 13px", cursor: !dirty.size || isPending ? "not-allowed" : "pointer", opacity: !dirty.size || isPending ? 0.55 : 1 }}>Discard</button>
            <button type="button" onClick={saveChanges} disabled={!dirty.size || isPending} style={{ minHeight: 40, borderRadius: 10, border: "none", background: !dirty.size || isPending ? "#98a2b3" : "#067647", color: "#fff", fontWeight: 900, padding: "0 15px", cursor: !dirty.size || isPending ? "not-allowed" : "pointer" }}>{isPending ? "Saving…" : "Save changes"}</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {GROUPS.map((item) => <button key={item.key} type="button" onClick={() => { setGroup(item.key); setSection("all"); }} style={{ border: group === item.key ? "1px solid #2563eb" : "1px solid #d0d5dd", background: group === item.key ? "#eff6ff" : "#fff", color: group === item.key ? "#1d4ed8" : "#344054", borderRadius: 10, minHeight: 38, padding: "0 12px", fontWeight: 850, cursor: "pointer" }}>{item.label} <span style={{ opacity: 0.7 }}>({groupCounts[item.key]})</span></button>)}
        </div>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => setSection("all")} style={{ border: section === "all" ? "1px solid #667085" : "1px solid #e4e7ec", background: section === "all" ? "#f2f4f7" : "#fff", borderRadius: 999, minHeight: 34, padding: "0 11px", fontWeight: 800, cursor: "pointer" }}>All types</button>
          {sections.map((item) => <button key={item.key} type="button" onClick={() => setSection(item.key)} style={{ border: section === item.key ? "1px solid #667085" : "1px solid #e4e7ec", background: section === item.key ? "#f2f4f7" : "#fff", borderRadius: 999, minHeight: 34, padding: "0 11px", fontWeight: 800, cursor: "pointer" }}>{item.label}</button>)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto auto", gap: 10, alignItems: "center" }}>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search material, supplier or SKU…" style={{ minHeight: 40, border: "1px solid #d0d5dd", borderRadius: 10, padding: "0 12px", fontSize: 14 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#344054", fontWeight: 700, whiteSpace: "nowrap" }}><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show hidden / archived</label>
          <button type="button" onClick={addMaterial} style={{ minHeight: 40, borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 900, padding: "0 14px", cursor: "pointer" }}>+ Add material</button>
        </div>

        {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 750 }}>{message}</div> : null}
        {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 750 }}>{error}</div> : null}
      </div>

      <div style={{ overflowX: "auto", maxHeight: 620, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1780, fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: "#f9fafb", color: "#344054", textAlign: "left" }}>
              {["Action", "Material", "Client name", "Supplier", "SKU", "Type", "Purchase UOM", "Stock UOM", "Pack / roll qty", "Purchase cost", "Unit cost", "Price checked", "Width mm", "Length mm", "Roll width", "GSM", ""].map((label) => <th key={label || "controls"} style={{ padding: "9px 8px", borderBottom: "1px solid #e4e7ec", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const changed = dirty.has(row.key);
              const inactive = !row.active && row.id;
              return <tr key={row.key} style={{ background: changed ? "#fffcf5" : inactive ? "#f9fafb" : "#fff", opacity: inactive ? 0.78 : 1 }}>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", width: 112 }}>
                  <select value={row.action} disabled={!row.id} onChange={(event) => updateRow(row.key, "action", event.target.value as MaterialAction)} style={{ ...cellInputStyle, borderColor: changed ? "#fdb022" : "#d0d5dd", background: row.action === "HIDE" || row.action === "ARCHIVE" ? "#fff5f4" : row.action === "RESTORE" ? "#ecfdf3" : "#fff", fontWeight: 800 }}>
                    {row.id ? <><option value="KEEP">{row.savedState === "hidden" ? "HIDDEN" : row.savedState === "archived" ? "ARCHIVED" : "KEEP"}</option><option value="HIDE">HIDE</option><option value="ARCHIVE">DELETE / ARCHIVE</option>{row.savedState === "active" ? null : <option value="RESTORE">RESTORE</option>}</> : <option value="ADD">ADD</option>}
                  </select>
                </td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 210 }}><input value={row.name} onChange={(event) => updateRow(row.key, "name", event.target.value)} style={{ ...cellInputStyle, fontWeight: 750, borderColor: changed ? "#fdb022" : "#e4e7ec" }} placeholder="Material name" /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 190 }}><input value={row.customerFacingName} onChange={(event) => updateRow(row.key, "customerFacingName", event.target.value)} style={cellInputStyle} placeholder="Optional" /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 185 }}><input list="pm-material-suppliers" value={row.supplierName} onChange={(event) => updateRow(row.key, "supplierName", event.target.value)} style={cellInputStyle} placeholder="Supplier" /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 105 }}><input value={row.sku} onChange={(event) => updateRow(row.key, "sku", event.target.value)} style={cellInputStyle} placeholder="SKU" /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 150 }}><select value={row.materialType} onChange={(event) => updateRow(row.key, "materialType", event.target.value)} style={{ ...cellInputStyle, background: "#fff" }}>{TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 105 }}><input value={row.purchaseUom} onChange={(event) => updateRow(row.key, "purchaseUom", event.target.value)} style={cellInputStyle} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 95 }}><input value={row.stockUom} onChange={(event) => updateRow(row.key, "stockUom", event.target.value)} style={cellInputStyle} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 110 }}><input inputMode="decimal" value={row.stockQuantity} onChange={(event) => updateRow(row.key, "stockQuantity", event.target.value)} style={{ ...cellInputStyle, textAlign: "right" }} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 120 }}><input inputMode="decimal" value={row.purchaseCost} onPaste={(event) => { if (pasteCosts(row.key, event.clipboardData.getData("text"))) event.preventDefault(); }} onChange={(event) => updateRow(row.key, "purchaseCost", event.target.value)} style={{ ...cellInputStyle, textAlign: "right", fontWeight: 800, borderColor: changed ? "#fdb022" : "#e4e7ec" }} /></td>
                <td style={{ padding: "5px 10px", borderBottom: "1px solid #eaecf0", minWidth: 105, textAlign: "right", fontWeight: 850, color: "#0f766e", whiteSpace: "nowrap" }}>{money.format(unitCost(row))}</td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 135 }}><input type="date" value={row.priceCheckedAt} onChange={(event) => updateRow(row.key, "priceCheckedAt", event.target.value)} style={cellInputStyle} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 88 }}><input inputMode="decimal" value={row.widthMm} onChange={(event) => updateRow(row.key, "widthMm", event.target.value)} style={{ ...cellInputStyle, textAlign: "right" }} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 88 }}><input inputMode="decimal" value={row.lengthMm} onChange={(event) => updateRow(row.key, "lengthMm", event.target.value)} style={{ ...cellInputStyle, textAlign: "right" }} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 92 }}><input inputMode="decimal" value={row.rollWidthMm} onChange={(event) => updateRow(row.key, "rollWidthMm", event.target.value)} style={{ ...cellInputStyle, textAlign: "right" }} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", minWidth: 75 }}><input inputMode="decimal" value={row.gsm} onChange={(event) => updateRow(row.key, "gsm", event.target.value)} style={{ ...cellInputStyle, textAlign: "right" }} /></td>
                <td style={{ padding: 5, borderBottom: "1px solid #eaecf0", whiteSpace: "nowrap" }}>
                  <button type="button" onClick={() => duplicateRow(row)} title="Duplicate material" style={{ border: "1px solid #d0d5dd", background: "#fff", borderRadius: 8, minHeight: 34, padding: "0 9px", fontWeight: 800, cursor: "pointer" }}>Duplicate</button>
                  {!row.id ? <button type="button" onClick={() => removeNewRow(row.key)} title="Remove unsaved row" style={{ marginLeft: 5, border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 8, minHeight: 34, padding: "0 9px", fontWeight: 800, cursor: "pointer" }}>Remove</button> : null}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {!visibleRows.length ? <div style={{ padding: 30, textAlign: "center", color: "#667085" }}>No materials match this department/type filter.</div> : null}
      </div>

      <datalist id="pm-material-suppliers">{supplierNames.map((name) => <option key={name} value={name} />)}</datalist>
      <div style={{ padding: "11px 16px", borderTop: "1px solid #e4e7ec", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", color: "#667085", fontSize: 12 }}>
        <span>{visibleRows.length} shown · Paste a column of prices from Google Sheets directly into <b>Purchase cost</b>. The table refreshes automatically when clean.</span>
        <label style={{ display: "flex", alignItems: "center", gap: 7, color: "#344054", fontWeight: 700 }}><input type="checkbox" checked={syncMyob} onChange={(event) => setSyncMyob(event.target.checked)} /> Queue saved/new materials to MYOB Items</label>
      </div>
    </section>
  );
}
