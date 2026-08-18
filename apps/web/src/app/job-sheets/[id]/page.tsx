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
          .job-sheet-item { break-inside: auto; page-break-inside: auto; }
          .job-sheet-item + .job-sheet-item { break-before: page; page-break-before: always; }
          .job-sheet-artwork { break-inside: avoid; page-break-inside: avoid; }
          .job-sheet-signoff { break-inside: avoid; page-break-inside: avoid; }
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
              <div style={{ padding: "14px 16px", background: "#f4f8ff", borderBottom: "1px solid #cfd9e8", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#2563eb", fontSize: 11, fontWeight: 950 }}>ITEM {itemIndex + 1}{item.itemCode ? ` · ${item.itemCode}` : ""}</div>
                  <h2 style={{ margin: "3px 0 0", fontSize: 21 }}>{line?.productName || item.quoteProductName || item.title}</h2>
                </div>
                <div style={{ minWidth: 86, textAlign: "center", border: "1px solid #bfdbfe", borderRadius: 12, background: "#fff", padding: "8px 12px" }}>
                  <div style={{ color: "#667085", fontSize: 9, fontWeight: 950, textTransform: "uppercase" }}>Quantity</div>
                  <div style={{ fontWeight: 950, fontSize: 22 }}>{item.quantity}</div>
                </div>
              </div>

              <div style={{ padding: 16, display: "grid", gap: 14 }}>
                <section style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
                    {[
                      ["Finished size", finishedSize],
                      ["Primary stock", materialDisplayName(snapshot, "main", "smallStock") || materials.find((material) => material.role === "Primary stock")?.name || "—"],
                      ["Print", [human(snapshot.printMethod), human(snapshot.ink), human(snapshot.sides), human(snapshot.printDirection)].filter(Boolean).join(" · ") || item.colourSummary || "—"],
                      ["Laminate / finish", [materialDisplayName(snapshot, "laminate", "smallCoating") || human(snapshot.laminate), Array.isArray(snapshot.finishings) ? snapshot.finishings.map(human).join(", ") : item.finishingSummary].filter(Boolean).join(" · ") || "—"]
                    ].map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 9, background: "#fff" }}><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>{label}</div><strong style={{ display: "block", marginTop: 4, fontSize: 12, whiteSpace: "pre-wrap" }}>{String(value)}</strong></div>)}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
                    {[
                      ["Bleed / spacing", bleedSpacing],
                      ["Artwork", human(snapshot.artworkChoice) || "—"],
                      ["Drop layout", dropInstruction || "—"]
                    ].map(([label, value]) => <div key={String(label)} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 8, background: "#fafcff" }}><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>{label}</div><strong style={{ display: "block", marginTop: 3, fontSize: 11, whiteSpace: "pre-wrap" }}>{String(value)}</strong></div>)}
                  </div>

                  {dropInstruction ? <div style={{ border: "2px solid #fb923c", background: "#fff7ed", color: "#9a3412", borderRadius: 10, padding: 10, fontSize: 12 }}><strong>INSTALL LAYOUT:</strong> {dropInstruction}</div> : null}
                  {line?.notes || item.quoteLineNotes ? <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 10, padding: 9, fontSize: 11, whiteSpace: "pre-wrap" }}><strong>Production / quote notes:</strong> {line?.notes || item.quoteLineNotes}</div> : null}
                </section>

                {artwork ? (
                  <section className="job-sheet-artwork" style={{ border: "2px solid #86efac", borderRadius: 14, padding: 12, background: "#f0fdf4" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 9 }}>
                      <strong style={{ color: "#067647", fontSize: 13 }}>APPROVED ARTWORK</strong>
                      <span style={{ fontSize: 11, fontWeight: 900 }}>Revision {artwork.proofRevision || approval?.revision || "Approved"}</span>
                    </div>
                    {!proofIsPlaceholder(artwork) ? (
                      <JobSheetArtworkPreview url={artwork.imageUrl} title={artwork.title} isPdf={proofIsPdf(artwork)} />
                    ) : (
                      <div style={{ border: "1px dashed #f59e0b", borderRadius: 10, background: "#fff7ed", padding: 18, color: "#9a3412" }}>Artwork placeholder only — approved proof image is not available.</div>
                    )}
                    <div style={{ fontSize: 10, color: "#475467", marginTop: 7, textAlign: "center" }}><strong>{artwork.title}</strong>{artwork.fileName ? ` · ${artwork.fileName}` : ""}{!proofIsPlaceholder(artwork) ? <><br /><a className="job-sheet-screen-only" href={artwork.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 800 }}>Open approved artwork ↗</a></> : null}</div>
                  </section>
                ) : null}

                {(materials.length || requirements.length || labour.length) ? (
                  <section style={{ border: "1px solid #d9e2ef", borderRadius: 12, overflow: "hidden", background: "#fbfcfe" }}>
                    <div style={{ padding: "8px 11px", borderBottom: "1px solid #d9e2ef", fontSize: 11, fontWeight: 950, color: "#344054" }}>PRODUCTION REQUIREMENTS / ALLOWANCES</div>
                    {materials.length ? <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}><tbody>{materials.map((material) => <tr key={`${material.role}-${material.name}`}><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 8px", width: "20%", fontWeight: 900 }}>{material.role}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 8px" }}>{material.name}{material.sku ? ` · SKU ${material.sku}` : ""}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 8px", width: "24%", textAlign: "right", color: "#475467" }}>{material.detail}</td></tr>)}</tbody></table> : null}
                    {requirements.length ? <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}><tbody>{requirements.map((row, index) => <tr key={`${row.label}-${index}`}><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 8px", width: "20%", fontWeight: 900 }}>{row.label}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 8px" }}>{row.detail}{row.note ? <div style={{ color: "#667085" }}>{row.note}</div> : null}</td><td style={{ borderTop: "1px solid #e4e7ec", padding: "5px 8px", width: "15%", textAlign: "right", fontWeight: 900 }}>{row.usage}</td></tr>)}</tbody></table> : null}
                    {labour.length ? <div style={{ borderTop: "1px solid #e4e7ec", padding: "7px 8px", fontSize: 10 }}><strong>Labour:</strong> {labour.join(" · ")}</div> : null}
                  </section>
                ) : null}
              </div>

              <section className="job-sheet-signoff" style={{ borderTop: "2px solid #cfd9e8", padding: "12px 16px 14px", display: "grid", gap: 11, background: "#fff" }}>
                <div><strong style={{ fontSize: 12 }}>Production procedure</strong><div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "7px 12px", marginTop: 7 }}>{itemSteps.map((step) => <span key={step.id} style={{ fontSize: 11 }}>{step.checkedAt ? "☑" : "☐"} {step.label}</span>)}</div></div>
                <div style={{ border: "2px solid #111827", borderRadius: 12, padding: 11, display: "grid", gridTemplateColumns: "170px 1fr 1fr 150px", gap: 12, alignItems: "end" }}>
                  <div style={{ fontSize: 14, fontWeight: 950 }}>☐ LINE COMPLETE</div>
                  <div><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>Completed by</div><div style={{ borderBottom: "1px solid #111827", minHeight: 22 }} /></div>
                  <div><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>Signature</div><div style={{ borderBottom: "1px solid #111827", minHeight: 22 }} /></div>
                  <div><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>Date</div><div style={{ borderBottom: "1px solid #111827", minHeight: 22 }} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 14 }}>
                  <div><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>Production / completion notes</div><div style={{ borderBottom: "1px solid #98a2b3", minHeight: 24 }} /><div style={{ borderBottom: "1px solid #98a2b3", minHeight: 24 }} /></div>
                  <div><div style={{ fontSize: 9, fontWeight: 950, color: "#667085", textTransform: "uppercase" }}>QC checked by / date</div><div style={{ borderBottom: "1px solid #98a2b3", minHeight: 24 }} /></div>
                </div>
              </section>
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
