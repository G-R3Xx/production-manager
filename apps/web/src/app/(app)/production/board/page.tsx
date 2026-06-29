export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { customerLogoUrl, listCustomersForTenant } from "@/server/customers";
import { listEnquiriesForTenant } from "@/server/enquiries";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProductionBoardCardsForTenant, type ProductionBoardCardRecord, type ProductionBoardColumnKey } from "@/server/production";
import { listQuoteDraftsForTenant } from "@/server/quotes";
import { toggleProductionBoardStepAction } from "../actions";
import { AutoRefreshBoard } from "./AutoRefreshBoard";
import { FullscreenBoardMode } from "./FullscreenBoardMode";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type BoardColumn = {
  key: ProductionBoardColumnKey;
  title: string;
  hint: string;
  accent: string;
};

const columns: BoardColumn[] = [
  { key: "printing", title: "Printing", hint: "Artwork, stock, print and RIP tasks", accent: "#2563eb" },
  { key: "finishing", title: "Finishing", hint: "Laminate, cut, route, trim, pack", accent: "#7c3aed" },
  { key: "install", title: "Install", hint: "Ready for site install", accent: "#f59e0b" },
  { key: "deliver", title: "Deliver", hint: "Courier / delivery jobs", accent: "#0891b2" },
  { key: "pickup", title: "Pickup", hint: "Counter pickup / collection", accent: "#059669" }
];

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short" }).format(date);
}

function formatUpdated(value: string | null | undefined): string {
  if (!value) return "Not updated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not updated";
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).format(date);
}

function compactText(value: string | null | undefined, fallback = ""): string {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function boardSearchText(card: ProductionBoardCardRecord): string {
  return [
    card.itemTitle,
    card.quoteProductName,
    card.quoteOptionSummary,
    card.sizeSummary,
    card.substrateSummary,
    card.colourSummary,
    card.finishingSummary
  ].map((value) => compactText(value)).filter(Boolean).join(" · ");
}

function compactSize(value: string | null | undefined, fallbackText = ""): string {
  const source = compactText(value) || fallbackText;
  const normalised = source.replace(/[×*]/g, "x").replace(/\s+/g, " ");
  const match = normalised.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|m)?/i);
  if (!match) return compactText(value);
  const unit = match[3] ? match[3].toLowerCase() : "mm";
  return `${match[1]}x${match[2]}${unit}`;
}

function materialName(card: ProductionBoardCardRecord): string {
  const source = boardSearchText(card);
  const knownMaterials = [
    "ACM",
    "Acrylic",
    "Corflute",
    "PVC",
    "Foamboard",
    "Foamex",
    "Banner",
    "SAV",
    "Vinyl",
    "Poster",
    "Paper",
    "Card"
  ];
  const lower = source.toLowerCase();
  const found = knownMaterials.find((material) => lower.includes(material.toLowerCase()));
  if (found) return found;

  const cleaned = compactText(card.quoteProductName) || compactText(card.substrateSummary) || compactText(card.itemTitle) || "Signage";
  return cleaned
    .replace(/\b\d+(?:\.\d+)?\s*mm\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*(?:mm|m)?\b/gi, "")
    .split(/[-·,]/)[0]
    .trim() || "Signage";
}

function quantitySuffix(value: string | null | undefined): string {
  const count = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(count) || count <= 1) return "";
  const display = Number.isInteger(count) ? String(count) : count.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return ` (${display} ${count === 1 ? "piece" : "pieces"})`;
}

function optionParts(card: ProductionBoardCardRecord): string[] {
  return [
    card.quoteProductName,
    card.quoteOptionSummary,
    card.substrateSummary,
    card.colourSummary,
    card.finishingSummary,
    card.sizeSummary,
    card.itemTitle
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/\s*[·\n]\s*/g))
    .map((part) => compactText(part))
    .filter(Boolean);
}

function stripDetailLabel(value: string): string {
  return compactText(value.replace(/^(?:material|substrate|stock|base|size|sizes|print|laminate|coating|finishing|finish|install|small format)\s*:\s*/i, ""));
}

function normaliseSizeText(value: string | null | undefined): string {
  const source = compactText(value);
  const normalised = source.replace(/[×*]/g, "x").replace(/\s+/g, " ");
  const match = normalised.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|m)?/i);
  if (!match) return "";
  const unit = match[3] ? match[3].toLowerCase() : "mm";
  return `${match[1]}x${match[2]}${unit}`;
}

function splitSummaryParts(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/\s*[·\n]\s*/g)
    .map((part) => compactText(part))
    .filter(Boolean);
}

function isLikelyStockOrMaterialSize(part: string): boolean {
  const source = part.toLowerCase();
  const hasMaterialWord = /\b(material|substrate|stock|sheet|roll|media|acm|aluminium composite|acrylic|corflute|coreflute|pvc|foamboard|foamex|polycarbonate|vinyl|banner)\b/.test(source);
  const hasThickness = /\b\d+(?:\.\d+)?\s*mm\b/.test(source);
  return hasMaterialWord && hasThickness;
}

function finishedSizeFromOptionSummary(value: string | null | undefined): string {
  const parts = splitSummaryParts(value);
  const labelled = parts.find((part) => /^(?:finished\s*)?size\s*:/i.test(part));
  const labelledSize = normaliseSizeText(labelled);
  if (labelledSize) return labelledSize;

  const standalone = parts.find((part) => /^\d+(?:\.\d+)?\s*[×x*]\s*\d+(?:\.\d+)?\s*(?:mm|m)?$/i.test(part));
  const standaloneSize = normaliseSizeText(standalone);
  if (standaloneSize) return standaloneSize;

  const nonStockPart = parts.find((part) => normaliseSizeText(part) && !isLikelyStockOrMaterialSize(part));
  return normaliseSizeText(nonStockPart);
}

function finishedSizeForCard(card: ProductionBoardCardRecord): string {
  return finishedSizeFromOptionSummary(card.quoteOptionSummary)
    || finishedSizeFromOptionSummary(card.sizeSummary)
    || normaliseSizeText(card.sizeSummary)
    || normaliseSizeText(card.quoteOptionSummary)
    || normaliseSizeText(card.itemTitle);
}

function boardColumnForCard(card: ProductionBoardCardRecord): ProductionBoardColumnKey {
  if (!card.nextStepId && card.handoffColumn) return card.handoffColumn;

  const nextStep = cleanBoardText([card.nextStepLabel, card.nextStepType].filter(Boolean).join(" · "));

  if (nextStep) {
    if (/\b(ready for install|install|installed|installer|site install)\b/.test(nextStep)) return "install";
    if (/\b(ready for delivery|deliver|delivery|courier|freight|drop off|dispatch)\b/.test(nextStep)) return "deliver";
    if (/\b(ready for pickup|pickup|pick up|collect|collection)\b/.test(nextStep)) return "pickup";
    if (/\b(laminate|lamination|cello|fold|score|crease|bind|staple|number|numbering|pad|tape|trim|guillotine|cut|route|router|cnc|jingwei|finish|finishing|quality|pack|packed|apply|mount|mounted|eyelet|drill|hole|holes)\b/.test(nextStep)) return "finishing";
    return "printing";
  }

  return card.column;
}

function boardItemSummary(card: ProductionBoardCardRecord): string {
  const code = compactText(card.itemCode) || "S1";
  const material = materialName(card);
  const size = finishedSizeForCard(card) || normaliseSizeText(boardSearchText(card));
  return [code, material, size].filter(Boolean).join(" - ") + quantitySuffix(card.quantity);
}

function substrateDetail(card: ProductionBoardCardRecord): string | null {
  const parts = optionParts(card);
  const material = materialName(card);
  const substratePart = parts.find((part) => /^(?:material|substrate|stock|base)\s*:/i.test(part))
    || parts.find((part) => /\b(acm|acrylic|corflute|coreflute|pvc|foamboard|foamex|polycarbonate)\b/i.test(part) && /\b\d+(?:\.\d+)?\s*mm\b/i.test(part))
    || compactText(card.substrateSummary)
    || compactText(card.quoteProductName);

  let cleaned = stripDetailLabel(substratePart || "")
    .replace(/\b\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*(?:mm|m)?\b/gi, "")
    .replace(/^\w+\s*-\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const thicknessThenMaterial = cleaned.match(/\b(\d+(?:\.\d+)?\s*mm\s*(?:ACM|Acrylic|Corflute|Coreflute|PVC|Foamboard|Foamex|Polycarbonate))\b/i)?.[1];
  if (thicknessThenMaterial) return compactText(thicknessThenMaterial).replace(/\bCoreflute\b/i, "Corflute");

  const materialThenThickness = cleaned.match(/\b(ACM|Acrylic|Corflute|Coreflute|PVC|Foamboard|Foamex|Polycarbonate)\s*(\d+(?:\.\d+)?\s*mm)\b/i);
  if (materialThenThickness) return `${materialThenThickness[2]} ${materialThenThickness[1]}`.replace(/\bCoreflute\b/i, "Corflute");

  if (!cleaned || cleaned.toLowerCase() === material.toLowerCase()) return null;
  return cleaned;
}

function finishingDetails(card: ProductionBoardCardRecord, laminate: string | null): string[] {
  const laminateKey = cleanBoardText(laminate ?? "");
  const details = optionParts(card)
    .filter((part) => /\b(finishing|finish|eyelet|eyelets|hole|holes|drill|jingwei|router|route|cnc|cut|cutting|fold|score|crease|bind|staple|numbering|pad|tape|trim|guillotine|mount|apply)\b/i.test(part))
    .map(stripDetailLabel)
    .flatMap((part) => part.split(/\s*,\s*/g))
    .map((part) => compactText(part))
    .filter((part) => {
      const key = cleanBoardText(part);
      if (!key) return false;
      if (laminateKey && key === laminateKey) return false;
      if (/^none$/i.test(part)) return false;
      return !/\b(print setup|artwork|direct print|roll stock|cut vinyl|single sided|double sided|cmyk|white ink)\b/i.test(part);
    });

  return Array.from(new Set(details)).slice(0, 4);
}

function cleanBoardText(value: string): string {
  return value.toLowerCase().replace(/[–—_/\\]+/g, " ").replace(/\s+/g, " ").trim();
}

function printMethod(card: ProductionBoardCardRecord): string | null {
  const source = cleanBoardText(boardSearchText(card));
  if (/\bno print\b|\bmaterial only\b/.test(source)) return "No print";
  if (/\bcut vinyl\b/.test(source)) return "Cut vinyl";
  if (/\broll stock\b|\bprint vinyl\b|\bbanner media\b/.test(source)) return "Roll stock";
  if (/\bdirect print\b/.test(source)) return "Direct";
  if (/\bcmyk\b|\bwhite ink\b|\bprinted\b/.test(source)) return "Print";
  return null;
}

function laminateName(card: ProductionBoardCardRecord): string | null {
  const raw = boardSearchText(card);
  const explicit = raw.match(/Laminate:\s*([^·,\n]+)/i)?.[1];
  if (explicit) return compactText(explicit);

  const lamCode = raw.match(/\b(LAM-[A-Za-z0-9 +\-]*?(?:Gloss|Matt|Matte|Anti Graffiti|Whiteboard)[A-Za-z0-9 +\-]*)\b/i)?.[1];
  if (lamCode) return compactText(lamCode);

  if (/gloss\s+lam/i.test(raw) || /laminate[^·,\n]*gloss/i.test(raw)) return "Gloss Laminate";
  if (/(matt|matte)\s+lam/i.test(raw) || /laminate[^·,\n]*(matt|matte)/i.test(raw)) return "Matt Laminate";
  if (/anti\s*graffiti/i.test(raw)) return "Anti Graffiti Laminate";
  if (/whiteboard/i.test(raw)) return "Whiteboard Laminate";
  return null;
}

function nextStepSummary(card: ProductionBoardCardRecord, laminate: string | null): string {
  const step = compactText(card.nextStepLabel);
  if (!step) return "Needs steps synced";
  if (!card.nextStepId && card.handoffColumn) {
    if (card.handoffColumn === "install") return "Ready for install";
    if (card.handoffColumn === "deliver") return "Ready for delivery";
    if (card.handoffColumn === "pickup") return "Ready for pickup";
  }
  if (laminate && /laminate|lamination|cello/i.test(step)) return `${step} (${laminate})`;
  return step;
}

function priorityTone(priority: string | null | undefined): { label: string; bg: string; fg: string; border: string } | null {
  const clean = compactText(priority).toLowerCase();
  if (!clean || clean === "normal") return null;
  if (clean.includes("urgent")) return { label: "Urgent", bg: "#fff1f3", fg: "#c01048", border: "#fecdd3" };
  return { label: priority ?? "Priority", bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
}

function emptyColumnMessage(key: ProductionBoardColumnKey): string {
  if (key === "printing") return "No active print tasks.";
  if (key === "finishing") return "No finishing tasks.";
  if (key === "install") return "No installs ready.";
  if (key === "deliver") return "No deliveries queued.";
  return "No pickups queued.";
}

const boardCardStyle = {
  border: "1px solid rgba(148,163,184,0.26)",
  borderRadius: 18,
  background: "rgba(30,41,59,0.92)",
  color: "#f8fafc",
  padding: 14,
  display: "grid",
  gap: 10,
  boxShadow: "0 18px 38px rgba(0,0,0,0.20)"
} as const;

export default async function ProductionBoardPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap");
    throw new Error("Active tenant is required");
  }

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const tenantId = activeTenant.tenantId;

  const [cards, quoteDrafts, clients, enquiries] = await Promise.all([
    listProductionBoardCardsForTenant(tenantId),
    listQuoteDraftsForTenant(tenantId, { includeDeleted: true }),
    listCustomersForTenant(tenantId),
    listEnquiriesForTenant(tenantId, { includeDeleted: true })
  ]);

  const customerById = new Map(clients.map((client) => [client.id, client]));
  const quoteById = new Map(quoteDrafts.map((quote) => [quote.id, quote]));
  const enquiryById = new Map(enquiries.map((item) => [item.id, item]));
  const logoForQuoteId = (quoteId: string | null | undefined) => {
    const quote = quoteId ? quoteById.get(quoteId) : null;
    const sourceEnquiry = quote?.enquiryId ? enquiryById.get(quote.enquiryId) : null;
    return sourceEnquiry?.clientLogoUrl || customerLogoUrl(quote?.linkedCustomerId ? customerById.get(quote.linkedCustomerId) : null);
  };

  const fullscreenRequested = readParam(params, "display") === "fullscreen";
  const grouped = new Map<ProductionBoardColumnKey, ProductionBoardCardRecord[]>(columns.map((column) => [column.key, []]));
  cards.forEach((card) => grouped.get(boardColumnForCard(card))?.push(card));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "#020617",
        color: "#f8fafc",
        overflow: "auto",
        padding: 18,
        boxSizing: "border-box",
        display: "grid",
        gap: 14,
        alignContent: "start"
      }}
    >
      <AutoRefreshBoard seconds={45} />
      <FullscreenBoardMode requested={fullscreenRequested} />
      <section
        style={{
          border: "1px solid rgba(148,163,184,0.22)",
          borderRadius: 20,
          padding: "14px 16px",
          background: "linear-gradient(135deg, rgba(15,23,42,0.98) 0%, rgba(17,24,39,0.98) 55%, rgba(30,41,59,0.96) 100%)",
          boxShadow: "0 18px 44px rgba(0,0,0,0.26)",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "grid", gap: 3 }}>
          <h1 style={{ margin: 0, fontSize: 32, letterSpacing: "-0.04em" }}>Production board</h1>
          <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.45 }}>Live large-screen view · auto-refreshes every 45 seconds</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ borderRadius: 999, background: "rgba(37,99,235,0.2)", border: "1px solid rgba(147,197,253,0.35)", color: "#dbeafe", padding: "9px 13px", fontSize: 12, fontWeight: 950 }}>{cards.length} active card{cards.length === 1 ? "" : "s"}</span>
          <span style={{ borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", color: "#e2e8f0", padding: "9px 13px", fontSize: 12, fontWeight: 900 }}>Updated {new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).format(new Date())}</span>
          <a href="/production" style={{ borderRadius: 999, background: "#ffffff", color: "#0f172a", padding: "10px 14px", fontSize: 13, fontWeight: 950, textDecoration: "none" }}>Exit board</a>
        </div>
      </section>
      {message ? <div style={{ border: "1px solid rgba(171,239,198,0.45)", background: "rgba(6,118,71,0.24)", color: "#dcfae6", borderRadius: 16, padding: 12 }}>{message}</div> : null}
      {error ? <div style={{ border: "1px solid rgba(253,162,155,0.45)", background: "rgba(192,16,72,0.22)", color: "#ffe4e8", borderRadius: 16, padding: 12 }}>{error}</div> : null}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(250px, 1fr))", gap: 14, alignItems: "start", overflowX: "auto", paddingBottom: 8, minHeight: "calc(100vh - 118px)" }}>
        {columns.map((column) => {
          const columnCards = grouped.get(column.key) ?? [];
          return (
            <div key={column.key} style={{ minWidth: 230, border: "1px solid rgba(148,163,184,0.24)", borderRadius: 24, background: "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,23,42,0.88) 100%)", padding: 12, display: "grid", gap: 12, boxShadow: "0 18px 48px rgba(15,23,42,0.18)" }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 10, borderBottom: "1px solid rgba(148,163,184,0.18)", paddingBottom: 10 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 19 }}>{column.title} <span style={{ color: "#94a3b8", fontSize: 13 }}>{columnCards.length}</span></h2>
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, lineHeight: 1.35 }}>{column.hint}</p>
                </div>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: column.accent, boxShadow: `0 0 0 5px ${column.accent}22`, marginTop: 6 }} />
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {columnCards.map((card) => {
                  const tone = priorityTone(card.priority);
                  const logoUrl = logoForQuoteId(card.quoteId);
                  const progress = Number(card.stepsTotal) > 0 ? `${card.stepsDone}/${card.stepsTotal}` : "No steps";
                  const print = printMethod(card);
                  const laminate = laminateName(card);
                  const substrate = substrateDetail(card);
                  const finishings = finishingDetails(card, laminate);
                  const nextStep = nextStepSummary(card, laminate);
                  return (
                    <article key={card.id} style={boardCardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                          <ClientLogoBadge logoUrl={logoUrl} name={card.clientName} size={42} radius={12} padding={3} />
                          <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
                            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.clientName}</strong>
                            <span style={{ color: "#cbd5e1", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.quoteNumber ?? "Production"}</span>
                          </div>
                        </div>
                        {tone ? <span style={{ borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, padding: "4px 8px", fontSize: 11, fontWeight: 950 }}>{tone.label}</span> : null}
                      </div>

                      <div style={{ display: "grid", gap: 5, fontSize: 13, lineHeight: 1.45 }}>
                        <p style={{ margin: 0, color: "#e2e8f0", fontWeight: 950 }}>Signage details:</p>
                        <p style={{ margin: 0, color: "#f8fafc", fontWeight: 900 }}>{boardItemSummary(card)}</p>
                        {substrate ? <p style={{ margin: 0, color: "#cbd5e1" }}><strong style={{ color: "#f8fafc" }}>Substrate:</strong> {substrate}</p> : null}
                        {print ? <p style={{ margin: 0, color: "#cbd5e1" }}><strong style={{ color: "#f8fafc" }}>Print:</strong> {print}</p> : null}
                        {laminate ? <p style={{ margin: 0, color: "#cbd5e1" }}><strong style={{ color: "#f8fafc" }}>Laminate:</strong> {laminate}</p> : null}
                        {finishings.map((detail) => <p key={detail} style={{ margin: 0, color: "#cbd5e1" }}><strong style={{ color: "#f8fafc" }}>{/eyelet/i.test(detail) ? "Eyelets:" : "Finishing:"}</strong> {detail.replace(/^Eyelets?:\s*/i, "")}</p>)}
                        <div
                          style={{
                            marginTop: 8,
                            borderRadius: 14,
                            padding: "10px 12px",
                            background: "linear-gradient(135deg, rgba(250,204,21,0.98) 0%, rgba(245,158,11,0.95) 100%)",
                            color: "#111827",
                            border: "1px solid rgba(254,240,138,0.85)",
                            boxShadow: "0 12px 24px rgba(245,158,11,0.22)",
                            display: "grid",
                            gap: 2
                          }}
                        >
                          <span style={{ fontSize: 10, fontWeight: 1000, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.78 }}>Next step</span>
                          <strong style={{ fontSize: 15, lineHeight: 1.2 }}>{nextStep}</strong>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", color: "#94a3b8", fontSize: 12 }}>
                        <span>Due {formatDate(card.dueDate)}</span>
                        <span>{card.assignedTo || "Unassigned"}</span>
                        <span>{progress}</span>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                        <a href={`/production?selected=${card.jobId}`} style={{ color: "#93c5fd", fontWeight: 950, textDecoration: "none", fontSize: 12 }}>Open job</a>
                        <span style={{ color: "#64748b", fontSize: 11 }}>Updated {formatUpdated(card.updatedAt)}</span>
                        {card.nextStepId ? (
                          <form action={toggleProductionBoardStepAction}>
                            <input type="hidden" name="stepId" value={card.nextStepId} />
                            <input type="hidden" name="currentStatus" value="pending" />
                            <button type="submit" style={{ border: "1px solid rgba(147,197,253,0.42)", borderRadius: 999, background: "rgba(37,99,235,0.22)", color: "#dbeafe", cursor: "pointer", padding: "7px 10px", fontSize: 12, fontWeight: 950 }}>Mark done</button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {columnCards.length === 0 ? <div style={{ border: "1px dashed rgba(148,163,184,0.28)", borderRadius: 18, padding: 16, color: "#94a3b8", textAlign: "center", fontSize: 13 }}>{emptyColumnMessage(column.key)}</div> : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
