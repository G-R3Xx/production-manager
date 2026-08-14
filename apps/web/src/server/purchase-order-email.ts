import "server-only";

import { getCompanySettingsByTenantId } from "@/server/company";
import { getSupplierById } from "@/server/suppliers";
import { sendOutboundEmail } from "@/server/outbound-email";
import {
  archivePurchaseOrderPdf,
  getPurchaseOrder,
  getPurchasingDefaults,
  listPurchaseOrderLines,
  markPurchaseOrderEmailFailed,
  markPurchaseOrderEmailPending,
  markPurchaseOrderEmailSent
} from "@/server/purchasing";

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/×/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(value: unknown): string {
  return pdfSafe(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function money(value: number): string {
  return value.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function numberText(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

function auDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parts = value.slice(0, 10).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

function wrapText(value: string, maxChars: number): string[] {
  const clean = pdfSafe(value);
  if (!clean) return [""];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class PdfBuilder {
  private objects: Array<Buffer | null> = [];
  reserve(): number { this.objects.push(null); return this.objects.length; }
  add(content: string | Buffer): number { this.objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii")); return this.objects.length; }
  set(id: number, content: string | Buffer): void { this.objects[id - 1] = Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii"); }
  serialize(rootId: number): Uint8Array {
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%PMPO\n", "ascii")];
    const offsets = [0];
    let cursor = chunks[0].length;
    this.objects.forEach((object, index) => {
      if (!object) throw new Error(`PDF object ${index + 1} was not initialised.`);
      offsets.push(cursor);
      const head = Buffer.from(`${index + 1} 0 obj\n`, "ascii");
      const tail = Buffer.from("\nendobj\n", "ascii");
      chunks.push(head, object, tail);
      cursor += head.length + object.length + tail.length;
    });
    const xrefOffset = cursor;
    const xref: string[] = [`xref\n0 ${this.objects.length + 1}\n`, "0000000000 65535 f \n"];
    for (let i = 1; i <= this.objects.length; i += 1) xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    chunks.push(Buffer.from(xref.join(""), "ascii"));
    return new Uint8Array(Buffer.concat(chunks));
  }
}

type PdfLine = { sku: string; description: string; quantity: string; unitCost: number; amount: number };

type PdfData = {
  companyName: string;
  companyLegalName: string;
  companyAbn: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  supplierName: string;
  supplierContact: string;
  supplierEmail: string;
  poNumber: string;
  orderDate: string;
  promisedDate: string;
  shipTo: string;
  notes: string;
  taxInclusive: boolean;
  taxCode: string;
  lines: PdfLine[];
};

function textOp(text: string, x: number, y: number, size = 10, bold = false): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(text)}) Tj ET\n`;
}

function lineOp(x1: number, y1: number, x2: number, y2: number, width = 0.7): string {
  return `${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
}

function buildPurchaseOrderPdf(data: PdfData): Uint8Array {
  const subtotal = data.lines.reduce((sum, line) => sum + line.amount, 0);
  const gstApplies = data.taxCode.trim().toUpperCase() === "GST";
  const tax = gstApplies ? (data.taxInclusive ? subtotal - subtotal / 1.1 : subtotal * 0.1) : 0;
  const total = data.taxInclusive ? subtotal : subtotal + tax;
  const pages: string[] = [];
  const perPage = 20;
  const lineGroups = data.lines.length ? Array.from({ length: Math.ceil(data.lines.length / perPage) }, (_, i) => data.lines.slice(i * perPage, (i + 1) * perPage)) : [[]];

  lineGroups.forEach((pageLines, pageIndex) => {
    let c = "0 G 0 g\n";
    c += textOp(data.companyName, 42, 800, 19, true);
    if (data.companyLegalName && data.companyLegalName !== data.companyName) c += textOp(data.companyLegalName, 42, 784, 8);
    const companyMeta = [data.companyAbn ? `ABN ${data.companyAbn}` : "", data.companyPhone, data.companyEmail].filter(Boolean).join("  |  ");
    if (companyMeta) c += textOp(companyMeta, 42, 770, 8);
    if (data.companyAddress) c += textOp(data.companyAddress, 42, 758, 8);
    c += textOp("PURCHASE ORDER", 390, 800, 20, true);
    c += textOp(data.poNumber, 430, 778, 13, true);
    if (lineGroups.length > 1) c += textOp(`Page ${pageIndex + 1} of ${lineGroups.length}`, 452, 760, 8);
    c += lineOp(42, 744, 553, 744, 1.2);

    if (pageIndex === 0) {
      c += textOp("SUPPLIER", 42, 724, 8, true);
      c += textOp(data.supplierName, 42, 708, 12, true);
      if (data.supplierContact) c += textOp(data.supplierContact, 42, 693, 9);
      if (data.supplierEmail) c += textOp(data.supplierEmail, 42, 679, 9);
      c += textOp("ORDER DATE", 355, 724, 8, true);
      c += textOp(data.orderDate, 445, 724, 9);
      c += textOp("PROMISED DATE", 355, 708, 8, true);
      c += textOp(data.promisedDate, 445, 708, 9);
      c += textOp("AMOUNTS", 355, 692, 8, true);
      c += textOp(data.taxInclusive ? "Tax inclusive" : "Tax exclusive", 445, 692, 9);
      c += textOp("SHIP TO", 42, 653, 8, true);
      const shipLines = wrapText(data.shipTo || data.companyName, 60).slice(0, 3);
      shipLines.forEach((text, i) => { c += textOp(text, 42, 638 - i * 13, 9); });
    }

    const tableTop = pageIndex === 0 ? 590 : 720;
    c += lineOp(42, tableTop, 553, tableTop, 1);
    c += textOp("ITEM", 46, tableTop - 16, 8, true);
    c += textOp("DESCRIPTION", 132, tableTop - 16, 8, true);
    c += textOp("QTY", 365, tableTop - 16, 8, true);
    c += textOp("UNIT COST", 421, tableTop - 16, 8, true);
    c += textOp("AMOUNT", 505, tableTop - 16, 8, true);
    c += lineOp(42, tableTop - 24, 553, tableTop - 24, 0.6);
    let y = tableTop - 43;
    pageLines.forEach((line) => {
      c += textOp(line.sku || "-", 46, y, 8.5);
      const desc = wrapText(line.description, 38).slice(0, 2);
      desc.forEach((text, i) => { c += textOp(text, 132, y - i * 11, 8.5); });
      c += textOp(numberText(line.quantity), 365, y, 8.5);
      c += textOp(money(line.unitCost), 421, y, 8.5);
      c += textOp(money(line.amount), 505, y, 8.5);
      y -= Math.max(28, desc.length * 11 + 10);
      c += lineOp(42, y + 11, 553, y + 11, 0.25);
    });

    if (pageIndex === lineGroups.length - 1) {
      const totalY = Math.max(130, y - 5);
      c += textOp("Subtotal", 421, totalY, 9, true);
      c += textOp(money(subtotal), 505, totalY, 9);
      c += textOp(data.taxCode || "Tax", 421, totalY - 18, 9, true);
      c += textOp(money(tax), 505, totalY - 18, 9);
      c += lineOp(418, totalY - 27, 553, totalY - 27, 0.8);
      c += textOp("TOTAL", 421, totalY - 45, 11, true);
      c += textOp(money(total), 505, totalY - 45, 11, true);
      if (data.notes) {
        c += textOp("NOTES", 42, totalY, 8, true);
        wrapText(data.notes, 62).slice(0, 5).forEach((text, i) => { c += textOp(text, 42, totalY - 16 - i * 12, 8.5); });
      }
      c += textOp(`Please quote ${data.poNumber} on all invoices and correspondence.`, 42, 56, 8, true);
    }
    pages.push(c);
  });

  const pdf = new PdfBuilder();
  const catalogId = pdf.reserve();
  const pagesId = pdf.reserve();
  const fontId = pdf.reserve();
  const boldFontId = pdf.reserve();
  pdf.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pdf.set(boldFontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];
  for (const content of pages) {
    const bytes = Buffer.from(content, "ascii");
    const streamId = pdf.add(Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`, "ascii"), bytes, Buffer.from("endstream", "ascii")]));
    const pageId = pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  }
  pdf.set(pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  pdf.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  return pdf.serialize(catalogId);
}

export async function buildPurchaseOrderDocumentForTenant(tenantId: string, purchaseOrderId: string) {
  const [order, company, defaults] = await Promise.all([
    getPurchaseOrder(tenantId, purchaseOrderId),
    getCompanySettingsByTenantId(tenantId),
    getPurchasingDefaults(tenantId)
  ]);
  if (!order) throw new Error("Purchase order could not be found.");
  const [supplier, lines] = await Promise.all([
    getSupplierById(tenantId, order.supplierId),
    listPurchaseOrderLines(tenantId, purchaseOrderId)
  ]);
  if (!supplier) throw new Error("Purchase order supplier could not be found.");
  if (!lines.length) throw new Error("Add at least one material before sending this purchase order.");

  const companyName = company?.tradingName || company?.companyLegalName || company?.tenantName || "Production Manager";
  const recipient = (supplier.purchaseOrderEmail || supplier.email || "").trim();
  const pdfData: PdfData = {
    companyName,
    companyLegalName: company?.companyLegalName || "",
    companyAbn: company?.abn || "",
    companyAddress: company?.address || "",
    companyPhone: company?.phone || "",
    companyEmail: company?.email || "",
    supplierName: supplier.displayName,
    supplierContact: supplier.contactName || "",
    supplierEmail: recipient,
    poNumber: order.poNumber,
    orderDate: auDate(order.orderDate),
    promisedDate: auDate(order.promisedDate),
    shipTo: order.shipToAddress || company?.address || companyName,
    notes: order.notes || "",
    taxInclusive: order.isTaxInclusive,
    taxCode: defaults.taxCode || "GST",
    lines: lines.map((line) => ({
      sku: line.materialSku || "",
      description: line.description || line.materialName,
      quantity: line.quantity,
      unitCost: Number(line.unitCost || 0),
      amount: Number(line.lineTotal || 0)
    }))
  };
  const bytes = buildPurchaseOrderPdf(pdfData);
  const fileName = `${order.poNumber}-${supplier.displayName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "Supplier"}.pdf`;
  const subtotal = pdfData.lines.reduce((sum, line) => sum + line.amount, 0);
  const gstApplies = pdfData.taxCode.trim().toUpperCase() === "GST";
  const tax = gstApplies ? (order.isTaxInclusive ? subtotal - subtotal / 1.1 : subtotal * 0.1) : 0;
  const total = order.isTaxInclusive ? subtotal : subtotal + tax;
  const subject = `Purchase Order ${order.poNumber} - ${companyName}`;
  const logo = company?.companyLogoUrl ? `<img src="${htmlEscape(company.companyLogoUrl)}" alt="${htmlEscape(companyName)}" style="max-height:72px;max-width:260px;margin-bottom:16px" />` : "";
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><div style="max-width:680px;margin:auto">${logo}<h2 style="margin:0 0 8px">Purchase Order ${htmlEscape(order.poNumber)}</h2><p>Hi ${htmlEscape(supplier.contactName || supplier.displayName)},</p><p>Please find attached our purchase order <strong>${htmlEscape(order.poNumber)}</strong>.</p><table style="border-collapse:collapse;width:100%;margin:18px 0"><tr><td style="padding:7px 0;color:#667085">Supplier</td><td style="padding:7px 0;text-align:right"><strong>${htmlEscape(supplier.displayName)}</strong></td></tr><tr><td style="padding:7px 0;color:#667085">Order date</td><td style="padding:7px 0;text-align:right">${htmlEscape(auDate(order.orderDate))}</td></tr><tr><td style="padding:7px 0;color:#667085">Promised date</td><td style="padding:7px 0;text-align:right">${htmlEscape(auDate(order.promisedDate))}</td></tr><tr><td style="padding:7px 0;color:#667085">Total</td><td style="padding:7px 0;text-align:right"><strong>${htmlEscape(money(total))}</strong></td></tr></table>${order.notes ? `<p><strong>Notes:</strong><br>${htmlEscape(order.notes).replace(/\n/g, "<br>")}</p>` : ""}<p>Please quote <strong>${htmlEscape(order.poNumber)}</strong> on your invoice and correspondence.</p><p>Regards,<br><strong>${htmlEscape(companyName)}</strong>${company?.phone ? `<br>${htmlEscape(company.phone)}` : ""}${company?.email ? `<br>${htmlEscape(company.email)}` : ""}</p></div></body></html>`;
  return { order, supplier, company, recipient, bytes, fileName, subject, html, total };
}

export async function sendPurchaseOrderEmailForTenant(tenantId: string, purchaseOrderId: string): Promise<{ recipient: string; messageId: string | null; fileName: string }> {
  const document = await buildPurchaseOrderDocumentForTenant(tenantId, purchaseOrderId);
  const recipient = document.recipient;
  if (!recipient) {
    const message = "Supplier has no Purchase Order Email. Add one on the Supplier record (or a general email as fallback).";
    await markPurchaseOrderEmailFailed(tenantId, purchaseOrderId, { errorMessage: message });
    throw new Error(message);
  }

  await markPurchaseOrderEmailPending(tenantId, purchaseOrderId, recipient);
  if (!process.env.GMAIL_USER?.trim() || !process.env.GMAIL_APP_PASSWORD?.trim()) {
    const message = "Purchase-order email is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the Production Manager deployment. MYOB sync can still run independently.";
    await markPurchaseOrderEmailFailed(tenantId, purchaseOrderId, { emailTo: recipient, errorMessage: message });
    throw new Error(message);
  }

  const fromName = "Tender Edge Purchasing";
  const replyTo = process.env.PURCHASE_ORDER_REPLY_TO?.trim() || process.env.GMAIL_USER?.trim() || document.company?.email?.trim() || undefined;
  let messageId: string | null = null;
  try {
    const sent = await sendOutboundEmail({
      fromName,
      to: recipient,
      subject: document.subject,
      html: document.html,
      replyTo,
      attachments: [{ fileName: document.fileName, content: document.bytes }],
      tags: [{ name: "purchase_order", value: document.order.poNumber.replace(/[^a-zA-Z0-9_-]/g, "_") }]
    });
    messageId = sent.messageId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markPurchaseOrderEmailFailed(tenantId, purchaseOrderId, { emailTo: recipient, errorMessage: message });
    throw error instanceof Error ? error : new Error(message);
  }

  await archivePurchaseOrderPdf(tenantId, purchaseOrderId, {
    fileName: document.fileName,
    bytes: document.bytes,
    recipientEmail: recipient,
    messageId,
    metadata: { subject: document.subject, total: document.total, provider: "gmail-smtp" }
  });
  await markPurchaseOrderEmailSent(tenantId, purchaseOrderId, { emailTo: recipient, messageId });
  return { recipient, messageId, fileName: document.fileName };
}
