export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getCompanySettingsByTenantId } from "@/server/company";
import { getCustomerById } from "@/server/customers";
import { formatStructuredAddress, structuredAddressFromPayload } from "@/lib/contact-address";
import {
  getProductionJobById,
  listProductionItemsForJob,
  listProductionStepsForJob,
  type ProductionItemRecord
} from "@/server/production";
import {
  getArtworkApprovalById,
  getQuoteDraftById,
  listArtworkApprovalPages,
  listQuoteLines,
  type ArtworkApprovalPageRecord,
  type QuoteLineRecord
} from "@/server/quotes";
import { PrintJobSheetButton } from "./PrintJobSheetButton";
import { JobSheetArtworkPreview } from "./JobSheetArtworkPreview";

type JobSheetPageProps = { params: Promise<{ id: string }> };
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function numericText(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return text(value);
  return number.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" });
}

function human(value: unknown): string {
  return text(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function materialRows(snapshot: UnknownRecord): Array<{ role: string; name: string; sku: string; detail: string }> {
  const materialSnapshots = isRecord(snapshot.materialSnapshots) ? snapshot.materialSnapshots : {};
  const roles: Array<[string, string]> = [
    ["main", "Primary stock"],
    ["media", "Print media"],
    ["backing", "Backing media"],
    ["laminate", "Laminate"],
    ["smallStock", "Paper / small-format stock"],
    ["smallCoating", "Coating"]
  ];
  return roles.flatMap(([key, role]) => {
    const material = isRecord(materialSnapshots[key]) ? materialSnapshots[key] as UnknownRecord : null;
    if (!material) return [];
    const name = text(material.name) || text(material.customerFacingName);
    if (!name) return [];
    const dimensions = [
      text(material.widthMm) ? `${numericText(material.widthMm)}mm wide` : "",
      text(material.lengthMm) ? `${numericText(material.lengthMm)}mm long` : "",
      text(material.rollWidthMm) ? `${numericText(material.rollWidthMm)}mm roll` : "",
      text(material.gsm) ? `${numericText(material.gsm)}gsm` : ""
    ].filter(Boolean).join(" · ");
    return [{ role, name, sku: text(material.sku), detail: dimensions }];
  });
}


function materialDisplayName(snapshot: UnknownRecord, ...keys: string[]): string {
  const materialSnapshots = isRecord(snapshot.materialSnapshots) ? snapshot.materialSnapshots : {};
  for (const key of keys) {
    const material = isRecord(materialSnapshots[key]) ? materialSnapshots[key] as UnknownRecord : null;
    if (!material) continue;
    const name = text(material.name) || text(material.customerFacingName);
    if (name) return name;
  }
  return "";
}

function pricingRows(snapshot: UnknownRecord): Array<{ label: string; detail: string; usage: string; note: string }> {
  const pricingSnapshot = isRecord(snapshot.pricingSnapshot) ? snapshot.pricingSnapshot : {};
  const rows = Array.isArray(pricingSnapshot.pricingBreakdown) ? pricingSnapshot.pricingBreakdown : [];
  return rows.flatMap((row) => {
    if (!isRecord(row)) return [];
    const label = text(row.label);
    if (!label) return [];
    const amount = Number(row.amount);
    const unit = text(row.unit);
    const usage = Number.isFinite(amount) && amount > 0 ? `${numericText(amount)}${unit ? ` ${unit}` : ""}` : unit;
    return [{ label, detail: text(row.detail), usage, note: text(row.note) }];
  });
}

function artworkPageForItem(item: ProductionItemRecord, pages: ArtworkApprovalPageRecord[]): ArtworkApprovalPageRecord | null {
  if (item.artworkPageId) {
    const direct = pages.find((page) => page.id === item.artworkPageId);
    if (direct) return direct;
  }
  if (item.sourceQuoteLineId) {
    const byLine = pages.find((page) => page.sourceQuoteLineId === item.sourceQuoteLineId);
    if (byLine) return byLine;
  }
  return null;
}

function quoteLineForItem(item: ProductionItemRecord, lines: QuoteLineRecord[]): QuoteLineRecord | null {
  return item.sourceQuoteLineId ? lines.find((line) => line.id === item.sourceQuoteLineId) ?? null : null;
}

function proofIsPdf(page: ArtworkApprovalPageRecord): boolean {
  return /\.pdf(?:$|\?)/i.test(page.fileName || "") || /\.pdf(?:$|\?)/i.test(page.imageUrl || "");
}

function proofIsPlaceholder(page: ArtworkApprovalPageRecord): boolean {
  return page.imageUrl.startsWith("data:image/svg+xml") || (!page.fileName && !page.imageStoragePath && /auto-created from quote line/i.test(page.notes ?? ""));
}

export default async function JobSheetPage({ params }: JobSheetPageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const { id } = await params;
  const tenantId = activeTenant!.tenantId;

  const job = await getProductionJobById(tenantId, id);
  if (!job) redirect("/production?error=Production%20job%20not%20found");

  const [quote, items, steps, company, approval] = await Promise.all([
    getQuoteDraftById(tenantId, job.quoteId),
    listProductionItemsForJob(job.id),
    listProductionStepsForJob(job.id),
    getCompanySettingsByTenantId(tenantId),
    job.artworkApprovalId ? getArtworkApprovalById(tenantId, job.artworkApprovalId) : Promise.resolve(null)
  ]);
  const [quoteLines, artworkPages, customer] = await Promise.all([
    quote ? listQuoteLines(quote.id) : Promise.resolve([]),
    approval ? listArtworkApprovalPages(approval.id) : Promise.resolve([]),
    quote?.linkedCustomerId ? getCustomerById(tenantId, quote.linkedCustomerId) : Promise.resolve(null)
  ]);

  const billing = customer
    ? structuredAddressFromPayload(customer.payloadJson?.billingAddressStructured, customer.payloadJson?.billingAddress)
    : null;
  const clientAddress = billing ? formatStructuredAddress(billing, true) : "";
  const companyName = company?.tradingName || company?.companyLegalName || company?.tenantName || "Production Manager";
  const companyLogo = company?.companyLogoUrl || "/brand/tender-edge-horizontal-logo-2025.png";
  const activeQuoteLines = quoteLines.filter((line) => line.clientResponseStatus !== "cancelled" && !line.clientRevisionExcluded);
  const jobSheetName = job.projectName || quote?.jobName || job.clientName || "Production Job";
  const jobSheetNumber = job.quoteNumber || quote?.quoteNumber || `JOB-${job.id.slice(0, 8).toUpperCase()}`;
  const printTitle = `${jobSheetNumber} - ${jobSheetName}`;

  return (
    <main className="job-sheet-page" style={{ maxWidth: 1120, margin: "0 auto", padding: "24px", color: "#111827" }}>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          body { background: #fff !important; }
          .job-sheet-page { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .job-sheet-screen-only { display: none !important; }
          .job-sheet-item { break-inside: avoid; page-break-inside: avoid; }
          .job-sheet-artwork { break-inside: avoid; page-break-inside: avoid; }
          a { color: inherit !important; text-decoration: none !important; }
        }
      `}</style>

      <div className="job-sheet-screen-only" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <a href={`/production/${job.id}`} style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>← Back to production job</a>
        <PrintJobSheetButton printTitle={printTitle} />
      </div>

      <header style={{ border: "1px solid #d9e2ef", borderRadius: 18, padding: 18, background: "#fff", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 20 }}>
          <img src={companyLogo} alt={companyName} style={{ maxWidth: 300, maxHeight: 72, objectFit: "contain", objectPosition: "left center" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: "0.1em", color: "#2563eb" }}>PRODUCTION JOB SHEET</div>
            <div style={{ fontSize: 25, fontWeight: 950 }}>{job.projectName || quote?.jobName || job.clientName}</div>
            <div style={{ color: "#667085", fontWeight: 800 }}>{job.quoteNumber || quote?.quoteNumber || "Production job"}</div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #d9e2ef", paddingTop: 14, display: "grid", gridTemplateColumns: "1.15fr 1fr 1fr", gap: 16, fontSize: 13 }}>
          <div><strong>Client</strong><br />{job.clientName}{job.contactName ? <><br />{job.contactName}</> : null}{clientAddress ? <><br /><span style={{ whiteSpace: "pre-line" }}>{clientAddress}</span></> : null}</div>
          <div><strong>Job details</strong><br />Client PO: {quote?.clientPurchaseOrderNumber || "—"}<br />Due: {formatDate(job.dueDate)}<br />Dispatch: {human(job.dispatchType) || "—"}<br />Priority: {human(job.priority) || "Normal"}</div>
          <div><strong>Artwork approval</strong><br />Status: {approval?.status ? human(approval.status) : "Not linked"}<br />Revision: {approval?.revision || "—"}<br />Approved: {formatDateTime(approval?.approvedAt)}<br />Designer: {approval?.designerName || "—"}</div>
        </div>
        {job.internalNotes ? <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 12, padding: 10, whiteSpace: "pre-wrap", fontSize: 13 }}><strong>Internal production notes:</strong> {job.internalNotes}</div> : null}
      </header>

      <section style={{ marginTop: 18, display: "grid", gap: 16 }}>
        {items.map((item, itemIndex) => {
          const line = quoteLineForItem(item, activeQuoteLines);
          const snapshot = line && isRecord(line.configurationSnapshot) ? line.configurationSnapshot : {};
          const materials = materialRows(snapshot);
          const requirements = pricingRows(snapshot);
          const artwork = artworkPageForItem(item, artworkPages);
          const itemSteps = steps.filter((step) => step.itemId === item.id);
          const finishedSize = [text(snapshot.widthMm), text(snapshot.heightMm)].every(Boolean)
            ? `${numericText(snapshot.widthMm)} x ${numericText(snapshot.heightMm)} mm`
            : item.sizeSummary || "—";
          const bleedSpacing = text(snapshot.bleedSpacingMm) ? `${numericText(snapshot.bleedSpacingMm)} mm per side` : "—";
          const dropCount = Number(snapshot.dropCount);
          const dropDirection = text(snapshot.dropDirection).toLowerCase();
          const dropPanelWidthMm = Number(snapshot.dropPanelWidthMm);
          const dropLengthMm = Number(snapshot.dropLengthMm);
          const dropOverlap = Number(snapshot.dropOverlapMm);
          const dropInstruction = Number.isFinite(dropCount) && dropCount > 0 && (dropDirection === "vertical" || dropDirection === "horizontal")
            ? `${dropCount} ${dropDirection === "vertical" ? "VERTICAL DROPS" : "HORIZONTAL STRIPS"}${Number.isFinite(dropPanelWidthMm) && Number.isFinite(dropLengthMm) ? ` · approx ${numericText(dropPanelWidthMm)} × ${numericText(dropLengthMm)} mm each` : ""}${Number.isFinite(dropOverlap) && dropOverlap > 0 ? ` · ${numericText(dropOverlap)} mm overlap` : ""}`
            : "";
          const labour = [
            Number(snapshot.artworkMinutes) > 0 ? `Artwork ${numericText(snapshot.artworkMinutes)} min` : "",
            Number(snapshot.printSetupMinutes) > 0 ? `Print setup ${numericText(snapshot.printSetupMinutes)} min (${human(snapshot.printSetupLabourBasis)})` : "",
            Number(snapshot.laminateMinutes) > 0 ? `Laminate ${numericText(snapshot.laminateMinutes)} min (${human(snapshot.laminateLabourBasis)})` : "",
            Number(snapshot.finishingMinutes) > 0 ? `Finishing ${numericText(snapshot.finishingMinutes)} min (${human(snapshot.finishingLabourBasis)})` : ""
          ].filter(Boolean);

          return (
            <article key={item.id} className="job-sheet-item" style={{ border: "1px solid #cfd9e8", borderRadius: 18, background: "#fff", overflow: "hidden" }}>
              <div style={{ padding: "13px 16px", background: "#f4f8ff", borderBottom: "1px solid #cfd9e8", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <div style={{ color: "#2563eb", fontSize: 11, fontWeight: 950 }}>ITEM {itemIndex + 1}{item.itemCode ? ` · ${item.itemCode}` : ""}</div>
                  <h2 style={{ margin: "3px 0 0", fontSize: 20 }}>{line?.productName || item.quoteProductName || item.title}</h2>
                  {line?.optionSummary || item.quoteOptionSummary ? <div style={{ color: "#475467", fontSize: 12, marginTop: 4 }}>{line?.optionSummary || item.quoteOptionSummary}</div> : null}
                </div>
                <div style={{ textAlign: "right", fontWeight: 950, fontSize: 18 }}>Qty {item.quantity}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: artwork ? "0.95fr 1.35fr" : "1fr", gap: 16, padding: 16 }}>
                {artwork ? (
                  <section className="job-sheet-artwork" style={{ border: "2px solid #86efac", borderRadius: 14, padding: 10, background: "#f0fdf4" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <strong style={{ color: "#067647" }}>APPROVED ARTWORK</strong>
                      <span style={{ fontSize: 11, fontWeight: 900 }}>{artwork.proofRevision || approval?.revision || "Approved"}</span>
                    </div>
                    {!proofIsPlaceholder(artwork) ? (
                      <JobSheetArtworkPreview url={artwork.imageUrl} title={artwork.title} isPdf={proofIsPdf(artwork)} />
                    ) : (
                      <div style={{ border: "1px dashed #f59e0b", borderRadius: 10, background: "#fff7ed", padding: 18, color: "#9a3412" }}>Artwork placeholder only — approved proof image is not available.</div>
                    )}
                    <div style={{ fontSize: 11, color: "#475467", marginTop: 8 }}><strong>{artwork.title}</strong>{artwork.fileName ? ` · ${artwork.fileName}` : ""}{artwork.notes ? <><br />{artwork.notes}</> : null}{!proofIsPlaceholder(artwork) ? <><br /><a className="job-sheet-screen-only" href={artwork.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 800, overflowWrap: "anywhere" }}>Open approved artwork ↗</a></> : null}</div>
                  </section>
                ) : null}

                <section style={{ display: "grid", gap: 12, alignContent: "start" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
                    {[
                      ["Finished size", finishedSize],
                      ["Drop layout", dropInstruction || "—"],
                      ["Print", [human(snapshot.printMethod), human(snapshot.ink), human(snapshot.sides), human(snapshot.printDirection)].filter(Boolean).join(" · ") || item.colourSummary || "—"],
                      ["Bleed / spacing", bleedSpacing],
                      ["Laminate", materialDisplayName(snapshot, "laminate", "smallCoating") || human(snapshot.laminate) || item.finishingSummary || "—"],
                      ["Finishing", Array.isArray(snapshot.finishings) ? snapshot.finishings.map(human).join(", ") || "—" : item.finishingSummary || "—"],
                      ["Artwork choice", human(snapshot.artworkChoice) || "—"]
                    ].map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 8 }}><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>{label}</div><strong style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{String(value)}</strong></div>)}
                  </div>

                  {dropInstruction ? <div style={{ border: "2px solid #fb923c", background: "#fff7ed", color: "#9a3412", borderRadius: 10, padding: 9, fontSize: 12 }}><strong>INSTALL LAYOUT:</strong> {dropInstruction}</div> : null}

                  {materials.length ? <div><strong style={{ fontSize: 12 }}>Stock / materials</strong><table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5, fontSize: 11 }}><tbody>{materials.map((material) => <tr key={`${material.role}-${material.name}`}><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 4px", width: "24%", fontWeight: 900 }}>{material.role}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 4px" }}>{material.name}{material.sku ? ` · SKU ${material.sku}` : ""}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 4px", textAlign: "right" }}>{material.detail}</td></tr>)}</tbody></table></div> : null}

                  {requirements.length ? <div><strong style={{ fontSize: 12 }}>Production allowances / usage</strong><table style={{ width: "100%", borderCollapse: "collapse", marginTop: 5, fontSize: 11 }}><tbody>{requirements.map((row, index) => <tr key={`${row.label}-${index}`}><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 4px", width: "24%", fontWeight: 900 }}>{row.label}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 4px" }}>{row.detail}{row.note ? <div style={{ color: "#667085" }}>{row.note}</div> : null}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 4px", textAlign: "right", fontWeight: 900 }}>{row.usage}</td></tr>)}</tbody></table></div> : null}

                  {labour.length ? <div style={{ fontSize: 11 }}><strong>Labour allowances:</strong> {labour.join(" · ")}</div> : null}
                  {line?.notes || item.quoteLineNotes ? <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 10, padding: 8, fontSize: 11, whiteSpace: "pre-wrap" }}><strong>Production / quote notes:</strong> {line?.notes || item.quoteLineNotes}</div> : null}
                </section>
              </div>

              <div style={{ borderTop: "1px solid #cfd9e8", padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 11 }}>
                <div><strong>Production procedure</strong><div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 5 }}>{itemSteps.map((step) => <span key={step.id}>☐ {step.label}</span>)}</div></div>
                <div><strong>Production sign-off</strong><div style={{ marginTop: 8 }}>Completed by: ____________________ &nbsp;&nbsp; Date: ____________</div><div style={{ marginTop: 8 }}>Quality checked: __________________</div></div>
              </div>
            </article>
          );
        })}
        {!items.length ? <div style={{ border: "1px dashed #cfd9e8", borderRadius: 14, padding: 24, background: "#fff" }}>No production items have been generated yet. Sync the production job from its approved artwork pages first.</div> : null}
      </section>

      <footer style={{ marginTop: 18, paddingTop: 10, borderTop: "1px solid #d9e2ef", color: "#667085", fontSize: 10, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>{companyName} · Production Manager</span>
        <span>Generated {new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</span>
      </footer>
    </main>
  );
}
