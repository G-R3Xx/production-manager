export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCompanySettingsByTenantId } from "@/server/company";
import { customerLogoUrl, getCustomerById } from "@/server/customers";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { getQuoteDraftByPublicToken, listQuoteLines, markQuoteViewedByToken, type QuoteDraftRecord, type QuoteLineRecord } from "@/server/quotes";
import { acceptQuoteAction, declineQuoteAction, requestQuoteChangesAction } from "./actions";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ClientQuoteLine = {
  title: string;
  detail: string | null;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet sent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium" }).format(date);
}

function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleCaseLabel(value: string | null | undefined): string {
  return compactText(value)
    .split(/\s+/g)
    .map((word) => {
      const lower = word.toLowerCase();
      if (["acm", "pvc", "cmyk", "ncr", "abn", "pms"].includes(lower)) return lower.toUpperCase();
      if (/^\d/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function summaryParts(line: Pick<QuoteLineRecord, "optionSummary">): string[] {
  return String(line.optionSummary ?? "")
    .split(/\s+·\s+/g)
    .map((part) => compactText(part))
    .filter(Boolean);
}

function cleanDimensionNumber(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toFixed(2).replace(/\.00$/g, "").replace(/(\.\d)0$/g, "$1");
}

function normaliseDimension(value: string | null | undefined): string {
  const source = compactText(value);
  const match = source.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)(?:\s*(mm|m))?/i);
  if (!match) return source.replace(/\s*[×x]\s*/i, "x").replace(/\s+mm$/i, "mm").replace(/x/i, "x");
  const unit = match[3] ? match[3].toLowerCase() : "mm";
  return `${cleanDimensionNumber(match[1])}x${cleanDimensionNumber(match[2])}${unit}`;
}

function dimensionFromText(value: string | null | undefined): string | null {
  const match = compactText(value).match(/\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*(?:mm|m)?/i);
  return match ? normaliseDimension(match[0]) : null;
}

function isStandaloneDimensionPart(value: string | null | undefined): boolean {
  return /^\d+(?:\.\d+)?\s*[×x]\s*\d+(?:\.\d+)?\s*(?:mm|m)?$/i.test(compactText(value));
}

function isLikelyStockOrMaterialDimension(value: string | null | undefined): boolean {
  const source = compactText(value).toLowerCase();
  return /\b(material|substrate|stock|sheet|parent sheet|roll|media|acm|aluminium|composite|acrylic|corflute|coreflute|pvc|foamboard|foam board|vinyl|banner|paper|card|gsm)\b/.test(source)
    && /\b\d+(?:\.\d+)?\s*mm\b/.test(source);
}

function findDimension(parts: string[], fallbackSource: string): string | null {
  const labelled = parts.find((part) => /^(?:finished\s*)?size\s*:/i.test(part));
  const labelledDimension = dimensionFromText(labelled);
  if (labelledDimension) return labelledDimension;

  // In quick quote summaries the parent sheet/substrate is listed before the finished
  // sign size. Prefer a standalone size entry so client quotes show the actual sign,
  // not the purchased stock sheet size.
  const standalone = parts.find(isStandaloneDimensionPart);
  const standaloneDimension = dimensionFromText(standalone);
  if (standaloneDimension) return standaloneDimension;

  const nonStock = parts.find((part) => dimensionFromText(part) && !isLikelyStockOrMaterialDimension(part));
  const nonStockDimension = dimensionFromText(nonStock);
  if (nonStockDimension) return nonStockDimension;

  return dimensionFromText(fallbackSource);
}

function findThickness(source: string): string | null {
  const match = source.match(/\b\d+(?:\.\d+)?\s*mm\b/i);
  return match ? compactText(match[0]).replace(/\s+/g, "") : null;
}

function cleanBaseMaterialName(value: string | null | undefined): string {
  const productName = compactText(value);
  const firstPart = compactText(productName.split(" - ")[0] ?? productName);
  return titleCaseLabel(firstPart || productName || "Quote item");
}

function cleanSelectedMaterialName(line: Pick<QuoteLineRecord, "productName" | "optionSummary">): string {
  const parts = summaryParts(line);
  const productBase = cleanBaseMaterialName(line.productName);
  const materialPart = parts.find((part) => {
    const lower = part.toLowerCase();
    return lower.includes(productBase.toLowerCase()) && /\b\d+(?:\.\d+)?\s*mm\b/i.test(part);
  });
  return titleCaseLabel(materialPart || line.productName.replace(/^.+?\s+-\s+/i, "") || productBase);
}

function friendlyLaminate(raw: string | null | undefined): string | null {
  const value = compactText(raw).replace(/^laminate:\s*/i, "").replace(/^coating:\s*/i, "");
  if (!value || /^none$/i.test(value)) return null;
  const lower = value.toLowerCase();
  if (lower.includes("gloss")) return "Gloss Laminate";
  if (lower.includes("matt") || lower.includes("matte")) return "Matt Laminate";
  if (lower.includes("anti graffiti")) return "Anti Graffiti Laminate";
  if (lower.includes("whiteboard")) return "Whiteboard Laminate";
  const cleaned = value
    .replace(/^lam[-_\s]*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(\d+yr|year|years)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return /laminate/i.test(cleaned) ? titleCaseLabel(cleaned) : `${titleCaseLabel(cleaned)} Laminate`;
}

function friendlyPrintMethod(value: string | null | undefined): string | null {
  const lower = compactText(value).toLowerCase();
  if (!lower || lower === "no print") return null;
  if (lower === "direct print") return "Direct Print";
  if (lower === "roll stock") return "Roll Stock";
  if (lower === "cut vinyl") return "Cut Vinyl";
  return titleCaseLabel(value);
}

function friendlySide(value: string | null | undefined): string | null {
  const lower = compactText(value).toLowerCase();
  if (lower.includes("double")) return "Double sided";
  if (lower.includes("single")) return "Single sided";
  return value ? titleCaseLabel(value) : null;
}

function isInstallLine(line: Pick<QuoteLineRecord, "productName" | "optionSummary">): boolean {
  const productName = compactText(line.productName).toLowerCase();
  // Dispatch notes on signage lines can legitimately contain "Install". Only treat a
  // quote line as an install line when the line title itself is the install/service item.
  return /^(sign install|installation|install)$/i.test(productName) || /\b(sign install|installation service)\b/i.test(productName);
}

function installLineForClient(line: Pick<QuoteLineRecord, "productName" | "optionSummary">): ClientQuoteLine {
  const parts = summaryParts(line);
  const fixings = parts.find((part) => /^fixings:/i.test(part));
  return {
    title: "Sign Install",
    detail: fixings ? fixings.replace(/^fixings:\s*/i, "Fixings: ") : null
  };
}

function signageLineForClient(line: Pick<QuoteLineRecord, "productName" | "optionSummary">): ClientQuoteLine {
  const parts = summaryParts(line);
  const combined = [line.productName, line.optionSummary].filter(Boolean).join(" · ");
  const base = cleanBaseMaterialName(line.productName);
  const selectedMaterial = cleanSelectedMaterialName(line);
  const dimension = findDimension(parts, combined);
  const thickness = findThickness(selectedMaterial);
  const printMethod = friendlyPrintMethod(parts.find((part) => /^(no print|direct print|roll stock|cut vinyl)$/i.test(part)));
  const ink = parts.find((part) => /^(cmyk|mono|cmyk \+ white|white ink|cmyk \+ special)$/i.test(part));
  const side = friendlySide(parts.find((part) => /\bsided\b/i.test(part)));
  const laminate = friendlyLaminate(parts.find((part) => /^laminate:/i.test(part)));
  const materialDescriptor = [base, thickness].filter(Boolean).join(" ");
  const title = [base, dimension, laminate].filter(Boolean).join(" ") || line.productName;
  const detailParts = [
    [materialDescriptor || selectedMaterial, dimension ? `- ${dimension}` : null].filter(Boolean).join(" "),
    printMethod,
    ink ? ink.toUpperCase().replace("CMYK + WHITE", "CMYK + White") : null,
    laminate,
    side
  ].filter(Boolean);

  return {
    title,
    detail: detailParts.length ? detailParts.join(", ").replace(/, (Single sided|Double sided)$/i, " $1") : null
  };
}

function smallFormatLineForClient(line: Pick<QuoteLineRecord, "productName" | "optionSummary">): ClientQuoteLine {
  const parts = summaryParts(line);
  const dimension = findDimension(parts, [line.productName, line.optionSummary].filter(Boolean).join(" · "));
  const coating = friendlyLaminate(parts.find((part) => /^coating:/i.test(part)));
  const side = friendlySide(parts.find((part) => /\bsided\b/i.test(part)));
  const colour = parts.find((part) => /^(cmyk|mono|cmyk \+ special)$/i.test(part));
  const stock = parts.find((part) => /\b(gsm|satin|gloss|bond|paper|card)\b/i.test(part));
  const firstName = compactText(line.productName.split(" - ")[0] ?? line.productName);
  const title = [titleCaseLabel(firstName), dimension, coating].filter(Boolean).join(" ") || line.productName;
  const detail = [stock, dimension, side, colour ? titleCaseLabel(colour) : null, coating].filter(Boolean).join(", ");
  return { title, detail: detail || null };
}

function quoteLineForClient(line: Pick<QuoteLineRecord, "productName" | "optionSummary">): ClientQuoteLine {
  if (isInstallLine(line)) return installLineForClient(line);
  const combined = `${line.productName} · ${line.optionSummary ?? ""}`.toLowerCase();
  if (/\b(card|flyer|brochure|book|booklet|ncr|duplicate|triplicate|gsm|cello)\b/.test(combined)) return smallFormatLineForClient(line);
  return signageLineForClient(line);
}

function deriveJobName(quote: Pick<QuoteDraftRecord, "notes" | "quoteNumber">, lines: QuoteLineRecord[], sourceSummary?: string | null): string {
  const sourceName = compactText(sourceSummary);
  if (sourceName) return sourceName.replace(/[,.\s]+$/g, "").slice(0, 90);

  const noteLines = String(quote.notes ?? "")
    .split(/\r?\n/g)
    .map((line) => compactText(line.replace(/^enquiry summary:\s*/i, "")))
    .filter((line) => line && !/^enquiry summary:?$/i.test(line));
  const firstUsefulNote = noteLines.find((line) => !/^survey|^photos?:|^brief:/i.test(line));
  if (firstUsefulNote) return firstUsefulNote.replace(/[,.\s]+$/g, "").slice(0, 90);
  const firstLine = lines[0] ? quoteLineForClient(lines[0]).title : "";
  return firstLine || quote.quoteNumber || "Quote";
}

const cardStyle = { background: "rgba(255,255,255,0.96)", border: "1px solid #dfe7f2", borderRadius: 26, padding: 22, boxShadow: "0 18px 48px rgba(15,23,42,0.06)" } as const;
const textareaStyle = { minHeight: 92, borderRadius: 14, border: "1px solid #cfd9e8", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 14, border: "none", background: "#0f172a", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 16px" } as const;

export default async function PublicQuotePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const message = readParam((await searchParams) ?? {}, "message");
  const quote = await getQuoteDraftByPublicToken(token);
  if (!quote) notFound();

  await markQuoteViewedByToken(token);

  const [lines, companySettings, linkedClient, sourceSurvey] = await Promise.all([
    listQuoteLines(quote.id),
    getCompanySettingsByTenantId(quote.tenantId),
    getCustomerById(quote.tenantId, quote.linkedCustomerId),
    quote.surveyRequestId ? getSurveyRequestById(quote.tenantId, quote.surveyRequestId) : Promise.resolve(null)
  ]);

  const sourceEnquiryId = quote.enquiryId || sourceSurvey?.enquiryId || null;
  const sourceEnquiry = sourceEnquiryId ? await getEnquiryById(quote.tenantId, sourceEnquiryId) : null;
  const subtotal = lines.reduce((sum, line) => sum + parseMoney(line.lineTotal), 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;
  const companyName = companySettings?.tradingName || companySettings?.companyLegalName || companySettings?.tenantName || "Production Manager";
  const companyLogoUrl = companySettings?.companyLogoUrl || "/brand/production-manager-logo.svg";
  const legalName = companySettings?.companyLegalName && companySettings.companyLegalName !== companyName ? companySettings.companyLegalName : null;
  const clientLogoUrl = sourceEnquiry?.clientLogoUrl || customerLogoUrl(linkedClient);
  const clientPurchaseOrderNumber = sourceEnquiry?.clientPurchaseOrderNumber || null;
  const clientEmail = quote.email || sourceEnquiry?.email || linkedClient?.email || null;
  const clientPhone = quote.phone || sourceSurvey?.phone || sourceEnquiry?.phone || linkedClient?.phone || null;
  const clientAddress = linkedClient?.payloadJson.billingAddress || null;
  const sourceSiteAddress = sourceSurvey?.siteAddress || sourceEnquiry?.siteAddress || linkedClient?.payloadJson.defaultSiteAddress || null;
  const siteAddress = sourceSiteAddress && sourceSiteAddress !== clientAddress ? sourceSiteAddress : null;
  const jobName = deriveJobName(quote, lines, sourceEnquiry?.requestSummary || sourceSurvey?.notes || sourceSurvey?.surveyDetails);
  const responseStatus = quote.acceptedAt || quote.status === "accepted" || quote.status === "approved"
    ? "accepted"
    : quote.declinedAt || quote.status === "declined"
      ? "declined"
      : quote.changesRequestedAt || quote.status === "changes_requested"
        ? "changes requested"
        : null;

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f8fbff,#eef2f7)", padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 18 }}>
        {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
        <section style={{ ...cardStyle, display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 28, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
              <img src={companyLogoUrl} alt={`${companyName} logo`} style={{ width: 230, maxWidth: "100%", maxHeight: 105, height: "auto", objectFit: "contain", objectPosition: "left center", borderRadius: 14, background: "#fff" }} />
              <div style={{ display: "grid", gap: 5, maxWidth: 420 }}>
                {legalName ? <strong style={{ color: "#111827", fontSize: 14 }}>{legalName}</strong> : null}
                {companySettings?.abn ? <span style={{ color: "#475467", fontSize: 13 }}>ABN {companySettings.abn}</span> : null}
                {[companySettings?.phone, companySettings?.email].filter(Boolean).length ? <span style={{ color: "#475467", fontSize: 13 }}>{[companySettings?.phone, companySettings?.email].filter(Boolean).join(" · ")}</span> : null}
                {companySettings?.address ? <span style={{ color: "#475467", fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{companySettings.address}</span> : null}
              </div>
            </div>
            <div style={{ textAlign: "right", display: "grid", justifyItems: "end", gap: 10, minWidth: 235 }}>
              <span style={{ borderRadius: 999, background: "#eef4ff", color: "#3538cd", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{quote.status.replace(/_/g, " ")}</span>
              <div style={{ display: "grid", gap: 5 }}>
                <span style={{ color: "#667085", fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>Quote number</span>
                <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.04em" }}>{quote.quoteNumber ?? "Quote"}</h1>
                <span style={{ color: "#667085", fontSize: 13 }}>Issued {formatDate(quote.sentAt ?? quote.createdAt)}</span>
              </div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
            <div style={{ border: "1px solid #e4e7ec", borderRadius: 18, padding: 14, background: "#fbfdff", display: "grid", gridTemplateColumns: clientLogoUrl ? "72px 1fr" : "1fr", gap: 12, alignItems: "start" }}>
              {clientLogoUrl ? <img src={clientLogoUrl} alt={`${quote.clientName} logo`} style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 14, border: "1px solid #e5e7eb", background: "#fff", padding: 4 }} /> : null}
              <div style={{ display: "grid", gap: 7 }}>
                <strong style={{ fontSize: 16 }}>Client details</strong>
                <span style={{ color: "#111827", fontWeight: 850 }}>{quote.clientName}</span>
                {quote.contactName ? <span style={{ color: "#475467" }}>Contact: {quote.contactName}</span> : null}
                {clientEmail ? <span style={{ color: "#475467" }}>Email: {clientEmail}</span> : null}
                {clientPhone ? <span style={{ color: "#475467" }}>Phone: {clientPhone}</span> : null}
                {clientAddress ? <span style={{ color: "#475467", whiteSpace: "pre-wrap" }}>Address: {String(clientAddress)}</span> : null}
              </div>
            </div>
            <div style={{ border: "1px solid #e4e7ec", borderRadius: 18, padding: 14, background: "#fbfdff", display: "grid", gap: 7 }}>
              <strong style={{ fontSize: 16 }}>Job / quote details</strong>
              <span style={{ color: "#111827", fontWeight: 850 }}>{jobName}</span>
              <span style={{ color: "#475467" }}>Reference: {quote.quoteNumber ?? "Quote"}</span>
              {clientPurchaseOrderNumber ? <span style={{ color: "#475467" }}>Client PO: <strong>{clientPurchaseOrderNumber}</strong></span> : null}
              {siteAddress ? <span style={{ color: "#475467", whiteSpace: "pre-wrap" }}>Site: {String(siteAddress)}</span> : null}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Quote details</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {lines.map((line) => {
              const clientLine = quoteLineForClient(line);
              return (
                <div key={line.id} style={{ border: "1px solid #e4e7ec", borderRadius: 18, padding: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, background: "#fbfdff" }}>
                  <div style={{ display: "grid", gap: 5 }}>
                    <strong>{clientLine.title}</strong>
                    {clientLine.detail ? <span style={{ color: "#667085", fontSize: 13 }}>{clientLine.detail}</span> : null}
                  </div>
                  <div style={{ textAlign: "right", display: "grid", gap: 4 }}>
                    <strong>{formatMoney(parseMoney(line.lineTotal))}</strong>
                    <span style={{ color: "#667085", fontSize: 13 }}>Qty {line.quantity} · {formatMoney(parseMoney(line.unitPrice))} ea</span>
                  </div>
                </div>
              );
            })}
            {lines.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>This quote has no saved line items yet.</p> : null}
          </div>
          <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 14, display: "grid", justifyContent: "end", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10 }}><span>Subtotal</span><strong style={{ textAlign: "right" }}>{formatMoney(subtotal)}</strong></div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10 }}><span>GST</span><strong style={{ textAlign: "right" }}>{formatMoney(gst)}</strong></div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10, fontSize: 22 }}><span>Total</span><strong style={{ textAlign: "right" }}>{formatMoney(total)}</strong></div>
          </div>
        </section>

        {quote.notes ? <section style={{ ...cardStyle, display: "grid", gap: 8 }}><h2 style={{ margin: 0 }}>Notes</h2><p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{quote.notes}</p></section> : null}

        {responseStatus ? (
          <section style={{ ...cardStyle, display: "grid", gap: 10, borderColor: quote.status === "accepted" ? "#abefc6" : "#fed7aa" }}>
            <h2 style={{ margin: 0 }}>Response received</h2>
            <p style={{ margin: 0, color: "#475467" }}>This quote has been marked as <strong>{responseStatus}</strong>. Tender Edge has received the response.</p>
            {quote.clientResponseNotes ? <p style={{ margin: 0, color: "#667085", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>Notes: {quote.clientResponseNotes}</p> : null}
          </section>
        ) : (
          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0 }}>Respond to quote</h2>
            <p style={{ margin: 0, color: "#667085" }}>Accept this quote, request changes, or decline. Your response goes straight back to Production Manager.</p>
            <form action={acceptQuoteAction} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="token" value={token} />
              <textarea name="notes" placeholder="Optional notes" style={textareaStyle} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" style={{ ...buttonStyle, background: "#067647" }}>Accept quote</button>
                <button formAction={requestQuoteChangesAction} type="submit" style={{ ...buttonStyle, background: "#c2410c" }}>Request changes</button>
                <button formAction={declineQuoteAction} type="submit" style={{ ...buttonStyle, background: "#b42318" }}>Decline</button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
