import "server-only";

import { inflateSync, deflateSync } from "node:zlib";
import type { CompanySettingsRecord } from "@/server/company";
import type { InvoiceLineRecord, InvoiceRecord } from "@/server/invoicing";
import type { QuoteDraftRecord, QuoteLineRecord } from "@/server/quotes";
import { quoteLineClientTitle } from "@/server/quote-pdf";

const A4: [number, number] = [595.28, 841.89];
const MAX_FETCH_BYTES = 5 * 1024 * 1024;

type PdfObject = Buffer | null;
type EmbeddedImage = { objectId: number; width: number; height: number };
type Rgb = readonly [number, number, number];

type InvoicePdfJob = {
  jobNumber: string;
  title: string;
  clientName: string;
  myobOrderNumber?: string | null;
};

export type InvoicePdfResult = { fileName: string; bytes: Uint8Array };

class PdfBuilder {
  private objects: PdfObject[] = [];
  reserve(): number { this.objects.push(null); return this.objects.length; }
  add(content: string | Buffer): number { this.objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii")); return this.objects.length; }
  set(id: number, content: string | Buffer): void { this.objects[id - 1] = Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii"); }
  stream(dictionary: string, bytes: Uint8Array): number {
    const data = Buffer.from(bytes);
    return this.add(Buffer.concat([Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, "ascii"), data, Buffer.from("\nendstream", "ascii")]));
  }
  serialize(rootId: number): Uint8Array {
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%PMINVOICE\n", "ascii")];
    const offsets = [0];
    let cursor = chunks[0].length;
    this.objects.forEach((object, index) => {
      if (!object) throw new Error(`Invoice PDF object ${index + 1} was not initialised.`);
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

const C = {
  page: [0.973, 0.982, 0.994] as Rgb,
  white: [1, 1, 1] as Rgb,
  ink: [0.063, 0.094, 0.153] as Rgb,
  body: [0.278, 0.337, 0.404] as Rgb,
  muted: [0.400, 0.439, 0.522] as Rgb,
  line: [0.878, 0.906, 0.941] as Rgb,
  soft: [0.984, 0.992, 1] as Rgb,
  softBlue: [0.941, 0.965, 1] as Rgb,
  blue: [0.082, 0.373, 0.937] as Rgb,
  teal: [0.059, 0.463, 0.431] as Rgb,
  green: [0.024, 0.467, 0.278] as Rgb,
  softGreen: [0.925, 0.984, 0.953] as Rgb,
};

function safeText(value: unknown): string {
  return String(value ?? "")
    .replace(/×/g, "x").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, " ").replace(/[\t ]+/g, " ").trim();
}
function pdfEscape(value: unknown): string { return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function textOp(text: string, x: number, y: number, size = 10, bold = false, color: Rgb = C.ink): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(text)}) Tj ET\n`;
}
function lineOp(x1: number, y1: number, x2: number, y2: number, width = 0.7, color: Rgb = C.line): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG ${width.toFixed(2)} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
}
function fillRect(x: number, y: number, width: number, height: number, color: Rgb): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f\n`;
}
function roundedRect(x: number, y: number, width: number, height: number, radius: number, fill: Rgb, stroke: Rgb = C.line, strokeWidth = 0.8): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const k = 0.5522847498, c = r * k, x2 = x + width, y2 = y + height;
  const path = [
    `${(x + r).toFixed(1)} ${y.toFixed(1)} m`, `${(x2 - r).toFixed(1)} ${y.toFixed(1)} l`,
    `${(x2 - r + c).toFixed(1)} ${y.toFixed(1)} ${x2.toFixed(1)} ${(y + r - c).toFixed(1)} ${x2.toFixed(1)} ${(y + r).toFixed(1)} c`,
    `${x2.toFixed(1)} ${(y2 - r).toFixed(1)} l`, `${x2.toFixed(1)} ${(y2 - r + c).toFixed(1)} ${(x2 - r + c).toFixed(1)} ${y2.toFixed(1)} ${(x2 - r).toFixed(1)} ${y2.toFixed(1)} c`,
    `${(x + r).toFixed(1)} ${y2.toFixed(1)} l`, `${(x + r - c).toFixed(1)} ${y2.toFixed(1)} ${x.toFixed(1)} ${(y2 - r + c).toFixed(1)} ${x.toFixed(1)} ${(y2 - r).toFixed(1)} c`,
    `${x.toFixed(1)} ${(y + r).toFixed(1)} l`, `${x.toFixed(1)} ${(y + r - c).toFixed(1)} ${(x + r - c).toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)} c`, "h"
  ].join("\n");
  return `${fill[0].toFixed(3)} ${fill[1].toFixed(3)} ${fill[2].toFixed(3)} rg ${stroke[0].toFixed(3)} ${stroke[1].toFixed(3)} ${stroke[2].toFixed(3)} RG ${strokeWidth.toFixed(2)} w\n${path}\nB\n`;
}
function wrapText(value: string, maxChars: number): string[] {
  const words = safeText(value).split(/\s+/).filter(Boolean); const lines: string[] = []; let current = "";
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (next.length > maxChars && current) { lines.push(current); current = word; } else current = next; }
  if (current) lines.push(current); return lines;
}
function safeFilePart(value: unknown, fallback: string): string {
  const cleaned = safeText(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80); return cleaned || fallback;
}
function money(value: number): string { return `$${value.toFixed(2)}`; }
function numberValue(value: string | number | null | undefined): number { const parsed = Number(String(value ?? "0").replace(/[$,]/g, "")); return Number.isFinite(parsed) ? parsed : 0; }
function qty(value: string | number | null | undefined): string { const n = numberValue(value); return n.toFixed(4).replace(/\.0000$/, "").replace(/(\.\d*?)0+$/, "$1"); }
function dateAu(value: string | null | undefined): string {
  if (!value) return "-"; const date = new Date(value); if (Number.isNaN(date.getTime())) return safeText(value);
  return date.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "2-digit", month: "short", year: "numeric" });
}
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function textValue(value: unknown): string | null { const s = String(value ?? "").trim(); return s || null; }
function addressLines(value: string | null | undefined, max = 3): string[] { return String(value ?? "").split(/\r?\n|,\s*(?=\d|[A-Za-z])/).map((v) => v.trim()).filter(Boolean).slice(0, max); }

function readUint32(bytes: Uint8Array, offset: number): number { return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0; }
function concatUint8(chunks: Uint8Array[]): Uint8Array { const total = chunks.reduce((sum, c) => sum + c.length, 0); const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out; }
function paeth(a: number, b: number, c: number): number { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); if (pa <= pb && pa <= pc) return a; return pb <= pc ? b : c; }
function unfilterPng(data: Uint8Array, width: number, height: number, bpp: number, rowBytes: number): Uint8Array {
  const out = new Uint8Array(height * rowBytes); let src = 0;
  for (let y = 0; y < height; y += 1) { const filter = data[src++]!, ro = y * rowBytes, po = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) { const raw = data[src++]!, left = x >= bpp ? out[ro + x - bpp]! : 0, up = y > 0 ? out[po + x]! : 0, ul = y > 0 && x >= bpp ? out[po + x - bpp]! : 0; let v = raw;
      if (filter === 1) v = (raw + left) & 255; else if (filter === 2) v = (raw + up) & 255; else if (filter === 3) v = (raw + Math.floor((left + up) / 2)) & 255; else if (filter === 4) v = (raw + paeth(left, up, ul)) & 255; else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`); out[ro + x] = v; }
  } return out;
}
function embedJpeg(pdf: PdfBuilder, bytes: Uint8Array): EmbeddedImage {
  let offset = 2, width = 0, height = 0, components = 3;
  while (offset + 8 < bytes.length) { if (bytes[offset] !== 0xff) { offset += 1; continue; } while (bytes[offset] === 0xff) offset += 1; const marker = bytes[offset++]!; if (marker === 0xd8 || marker === 0xd9) continue; if (offset + 2 > bytes.length) break; const length = (bytes[offset]! << 8) | bytes[offset + 1]!; if (length < 2 || offset + length > bytes.length) break; const sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf); if (sof && length >= 8) { height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!; width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!; components = bytes[offset + 7] || 3; break; } offset += length; }
  if (!width || !height) throw new Error("Invoice logo JPEG dimensions could not be read."); const cs = components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
  return { objectId: pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode`, bytes), width, height };
}
function embedPng(pdf: PdfBuilder, bytes: Uint8Array): EmbeddedImage {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]; if (!sig.every((v, i) => bytes[i] === v)) throw new Error("Invalid invoice logo PNG.");
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = -1; const idat: Uint8Array[] = []; let palette: Uint8Array | null = null, transparency: Uint8Array | null = null;
  while (offset + 12 <= bytes.length) { const length = readUint32(bytes, offset), type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!); const ds = offset + 8, de = ds + length; if (de + 4 > bytes.length) break; const chunk = bytes.slice(ds, de); if (type === "IHDR") { width = readUint32(chunk, 0); height = readUint32(chunk, 4); bitDepth = chunk[8]!; colorType = chunk[9]!; } else if (type === "IDAT") idat.push(chunk); else if (type === "PLTE") palette = chunk; else if (type === "tRNS") transparency = chunk; else if (type === "IEND") break; offset = de + 4; }
  if (!width || !height || !idat.length || bitDepth !== 8) throw new Error("Invoice logo PNG is unsupported."); const compressed = concatUint8(idat);
  if (colorType === 0 || colorType === 2) { const colors = colorType === 0 ? 1 : 3, cs = colorType === 0 ? "/DeviceGray" : "/DeviceRGB"; return { objectId: pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${width} >>`, compressed), width, height }; }
  if (colorType === 3) { if (!palette?.length) throw new Error("Invoice logo PNG palette missing."); const max = Math.max(0, Math.floor(palette.length / 3) - 1); let smask: number | null = null; if (transparency?.length) { const raw = unfilterPng(new Uint8Array(inflateSync(compressed)), width, height, 1, width), alpha = new Uint8Array(width * height); for (let i = 0; i < raw.length; i += 1) alpha[i] = transparency[raw[i]!] ?? 255; smask = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, new Uint8Array(deflateSync(alpha))); } const sm = smask ? ` /SMask ${smask} 0 R` : ""; return { objectId: pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace [/Indexed /DeviceRGB ${max} <${Buffer.from(palette).toString("hex").toUpperCase()}>] /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${width} >>${sm}`, compressed), width, height }; }
  if (colorType === 4 || colorType === 6) { const channels = colorType === 4 ? 2 : 4, raw = unfilterPng(new Uint8Array(inflateSync(compressed)), width, height, channels, width * channels), cc = colorType === 4 ? 1 : 3, colour = new Uint8Array(width * height * cc), alpha = new Uint8Array(width * height); for (let p = 0; p < width * height; p += 1) { if (colorType === 4) { colour[p] = raw[p * 2]!; alpha[p] = raw[p * 2 + 1]!; } else { colour[p * 3] = raw[p * 4]!; colour[p * 3 + 1] = raw[p * 4 + 1]!; colour[p * 3 + 2] = raw[p * 4 + 2]!; alpha[p] = raw[p * 4 + 3]!; } } const sm = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, new Uint8Array(deflateSync(alpha))); const cs = colorType === 4 ? "/DeviceGray" : "/DeviceRGB"; return { objectId: pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /FlateDecode /SMask ${sm} 0 R`, new Uint8Array(deflateSync(colour))), width, height }; }
  throw new Error("Invoice logo PNG colour type is unsupported.");
}
async function fetchImage(url: string): Promise<Uint8Array> { const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(`Could not download invoice logo (${r.status}).`); const ab = await r.arrayBuffer(); if (ab.byteLength > MAX_FETCH_BYTES) throw new Error("Invoice logo is over 5MB."); return new Uint8Array(ab); }
async function maybeEmbedImage(pdf: PdfBuilder, url: string | null | undefined): Promise<EmbeddedImage | null> { const value = String(url ?? "").trim(); if (!value) return null; try { const bytes = await fetchImage(value); if (bytes[0] === 0x89) return embedPng(pdf, bytes); if (bytes[0] === 0xff) return embedJpeg(pdf, bytes); } catch { return null; } return null; }
function imageOp(name: string, image: EmbeddedImage, x: number, y: number, maxW: number, maxH: number): string { const scale = Math.min(maxW / image.width, maxH / image.height); const w = image.width * scale, h = image.height * scale; return `q ${w.toFixed(1)} 0 0 ${h.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} cm /${name} Do Q\n`; }

function responseFor(invoice: InvoiceRecord): Record<string, unknown> | null { return record(invoice.payloadJson?.response); }
function invoiceDate(invoice: InvoiceRecord): string | null { return textValue(responseFor(invoice)?.Date) || invoice.issueDate; }
function dueDate(invoice: InvoiceRecord): string | null {
  const response = responseFor(invoice); const terms = record(response?.Terms);
  return textValue(terms?.BalanceDueDate) || textValue(response?.DueDate) || invoice.dueDate;
}
function invoiceStatusLabel(invoice: InvoiceRecord): string {
  if (invoice.status === "paid") return "PAID";
  if (invoice.status === "part_paid") return "PART PAID";
  return String(invoice.myobStatus || invoice.status || "INVOICE").replace(/_/g, " ").toUpperCase();
}
function lineTitle(line: InvoiceLineRecord, quoteLineById: Map<string, QuoteLineRecord>): string {
  const quoteLine = line.quoteLineId ? quoteLineById.get(line.quoteLineId) ?? null : null;
  return quoteLine ? quoteLineClientTitle(quoteLine) : safeText(line.displayTitle);
}

function pageContent(input: {
  pageIndex: number;
  pageCount: number;
  invoice: InvoiceRecord;
  lines: InvoiceLineRecord[];
  quote: QuoteDraftRecord;
  quoteLineById: Map<string, QuoteLineRecord>;
  job: InvoicePdfJob;
  company: CompanySettingsRecord | null;
  logo: EmbeddedImage | null;
  clientAddress?: string | null;
  lineStart: number;
  lineEnd: number;
}): string {
  const [pageW, pageH] = A4, cardX = 24, cardW = pageW - 48, innerX = 40, innerRight = pageW - 40, innerW = innerRight - innerX;
  const firstPage = input.pageIndex === 0, finalPage = input.lineEnd === input.lines.length;
  let out = fillRect(0, 0, pageW, pageH, C.page);
  out += roundedRect(cardX, 26, cardW, pageH - 48, 16, C.white, C.line, 0.9);

  const top = pageH - 38;
  if (input.logo) out += imageOp("Logo", input.logo, innerX, top - 84, 155, 62);
  else out += textOp(input.company?.tradingName || input.company?.companyLegalName || "Production Manager", innerX, top - 42, 16, true, C.blue);

  const companyX = 214;
  const legal = input.company?.companyLegalName || input.company?.tradingName || "";
  if (legal) out += textOp(legal, companyX, top - 18, 10.2, true);
  let cy = top - 36;
  if (input.company?.abn) { out += textOp(`ABN ${input.company.abn}`, companyX, cy, 8.2, false, C.body); cy -= 14; }
  const contact = [input.company?.phone, input.company?.email].filter(Boolean).join(" · ");
  if (contact) { out += textOp(contact, companyX, cy, 8.2, false, C.body); cy -= 14; }
  addressLines(input.company?.address, 2).forEach((line, i) => { out += textOp(line, companyX, cy - i * 13, 8.2, false, C.body); });

  const number = input.invoice.myobNumber || input.invoice.invoiceNumber;
  const metaX = 421;
  out += lineOp(metaX - 13, top - 89, metaX - 13, top + 1, 0.7, C.line);
  out += textOp("INVOICE", metaX, top - 17, 7.5, true, C.teal);
  out += textOp(number, metaX, top - 43, 17, true);
  out += textOp(`Issued ${dateAu(invoiceDate(input.invoice))}`, metaX, top - 63, 8, false, C.muted);
  const dd = dueDate(input.invoice); if (dd) out += textOp(`Due ${dateAu(dd)}`, metaX, top - 77, 8, false, C.muted);
  out += lineOp(innerX, top - 100, innerRight, top - 100, 0.7, C.line);

  let y = top - 120;
  if (firstPage) {
    out += textOp("BILL TO", innerX, y, 7.3, true, C.muted);
    out += textOp(input.quote.clientName || input.job.clientName, innerX, y - 20, 11, true);
    let by = y - 37;
    if (input.quote.contactName) { out += textOp(`Attention: ${input.quote.contactName}`, innerX, by, 8.5, false, C.body); by -= 14; }
    if (input.quote.email) { out += textOp(input.quote.email, innerX, by, 8.5, false, C.body); by -= 14; }
    addressLines(input.clientAddress, 2).forEach((line, i) => { out += textOp(line, innerX, by - i * 13, 8.3, false, C.body); });

    const jobX = 318;
    out += lineOp(jobX - 16, y - 73, jobX - 16, y + 3, 0.7, C.line);
    out += textOp("JOB / REFERENCE", jobX, y, 7.3, true, C.muted);
    out += textOp(input.job.title, jobX, y - 20, 11, true);
    out += textOp(`Job: ${input.job.jobNumber}`, jobX, y - 38, 8.5, false, C.body);
    out += textOp(`Quote: ${input.quote.quoteNumber || "-"}`, jobX, y - 53, 8.5, false, C.body);
    let ry = y - 68;
    if (input.quote.clientPurchaseOrderNumber) { out += textOp(`Client PO: ${input.quote.clientPurchaseOrderNumber}`, jobX, ry, 8.5, false, C.body); ry -= 15; }
    if (input.job.myobOrderNumber) out += textOp(`MYOB Order: ${input.job.myobOrderNumber}`, jobX, ry, 8.5, false, C.body);
    y -= 98;
  } else {
    out += textOp(`${input.job.title} · ${number}`, innerX, y - 4, 9.5, true);
    y -= 28;
  }

  const badgeText = invoiceStatusLabel(input.invoice);
  const badgePaid = input.invoice.status === "paid";
  out += roundedRect(innerRight - 82, y - 3, 82, 24, 12, badgePaid ? C.softGreen : C.softBlue, badgePaid ? C.green : C.blue, 0.7);
  out += textOp(badgeText.slice(0, 18), innerRight - 72, y + 5, 7.3, true, badgePaid ? C.green : C.blue);
  out += textOp("Invoice details", innerX, y + 4, 15, true);
  y -= 26;

  // table header
  out += roundedRect(innerX, y - 27, innerW, 27, 8, C.softBlue, C.line, 0.6);
  out += textOp("DESCRIPTION", innerX + 10, y - 18, 7.2, true, C.muted);
  out += textOp("QTY", 365, y - 18, 7.2, true, C.muted);
  out += textOp("PRICE P/U", 411, y - 18, 7.2, true, C.muted);
  out += textOp("TOTAL", 500, y - 18, 7.2, true, C.muted);
  y -= 37;

  const rowH = 54;
  for (let i = input.lineStart; i < input.lineEnd; i += 1) {
    const line = input.lines[i]!;
    const title = lineTitle(line, input.quoteLineById);
    const titleLines = wrapText(title, 52).slice(0, 2);
    out += lineOp(innerX, y - rowH + 5, innerRight, y - rowH + 5, 0.55, C.line);
    titleLines.forEach((part, idx) => { out += textOp(part, innerX + 5, y - 16 - idx * 12, 8.8, idx === 0, idx === 0 ? C.ink : C.body); });
    out += textOp(qty(line.qty), 365, y - 18, 8.6, false, C.body);
    out += textOp(money(numberValue(line.unitPrice)), 411, y - 18, 8.6, false, C.body);
    out += textOp(money(numberValue(line.lineTotal)), 490, y - 18, 9.1, true);
    y -= rowH;
  }

  if (finalPage) {
    const subtotal = numberValue(input.invoice.subtotal), gst = numberValue(input.invoice.taxTotal), total = numberValue(input.invoice.grandTotal);
    const balance = input.invoice.myobBalanceDue != null ? numberValue(input.invoice.myobBalanceDue) : total;
    const paid = Math.max(0, total - balance);
    y -= 2;
    out += lineOp(355, y, innerRight, y, 0.7, C.line); y -= 20;
    out += textOp("Subtotal", 382, y, 9, false, C.body); out += textOp(money(subtotal), 493, y, 9.5, true); y -= 19;
    out += textOp("GST", 382, y, 9, false, C.body); out += textOp(money(gst), 493, y, 9.5, true); y -= 22;
    out += textOp("Invoice total", 382, y, 11, true); out += textOp(money(total), 482, y, 13.5, true); y -= 21;
    if (paid > 0.01) { out += textOp("Paid", 382, y, 9, false, C.green); out += textOp(`-${money(paid)}`, 493, y, 9.5, true, C.green); y -= 21; }
    out += roundedRect(365, y - 37, innerRight - 365, 36, 9, balance <= 0.01 ? C.softGreen : C.softBlue, balance <= 0.01 ? C.green : C.blue, 0.7);
    out += textOp(balance <= 0.01 ? "PAID IN FULL" : "BALANCE DUE", 378, y - 16, 7.5, true, balance <= 0.01 ? C.green : C.blue);
    out += textOp(balance <= 0.01 ? money(0) : money(balance), 485, y - 20, 13, true, balance <= 0.01 ? C.green : C.blue);

    const footerY = 68;
    out += roundedRect(innerX, footerY, innerW, 54, 11, C.soft, C.line, 0.7);
    out += textOp("Thank you for your business.", innerX + 12, footerY + 34, 10, true);
    out += textOp(`Please use invoice ${number} as your payment reference.`, innerX + 12, footerY + 18, 8.1, false, C.body);
  }

  out += textOp(`Page ${input.pageIndex + 1} of ${input.pageCount}`, innerRight - 54, 12, 6.8, false, C.muted);
  return out;
}

export async function buildInvoicePdf(input: {
  invoice: InvoiceRecord;
  lines: InvoiceLineRecord[];
  quote: QuoteDraftRecord;
  quoteLines: QuoteLineRecord[];
  job: InvoicePdfJob;
  company: CompanySettingsRecord | null;
  companyLogoUrl?: string | null;
  fallbackLogoUrl?: string | null;
  clientAddress?: string | null;
}): Promise<InvoicePdfResult> {
  if (!input.lines.length) throw new Error("Invoice PDF has no line items.");
  const pdf = new PdfBuilder(), catalogId = pdf.reserve(), pagesId = pdf.reserve(), fontId = pdf.reserve(), boldFontId = pdf.reserve();
  pdf.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pdf.set(boldFontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const logo = await maybeEmbedImage(pdf, input.companyLogoUrl || input.fallbackLogoUrl || null);
  const quoteLineById = new Map(input.quoteLines.map((line) => [line.id, line]));

  const firstCapacity = 7, nextCapacity = 9, ranges: Array<[number, number]> = []; let start = 0;
  while (start < input.lines.length) { const cap = start === 0 ? firstCapacity : nextCapacity; ranges.push([start, Math.min(input.lines.length, start + cap)]); start += cap; }
  const pageIds: number[] = [];
  ranges.forEach(([lineStart, lineEnd], pageIndex) => {
    const xobjects = logo ? `/Logo ${logo.objectId} 0 R` : "";
    const resources = `/Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ""}`;
    const content = pageContent({ ...input, logo, quoteLineById, pageIndex, pageCount: ranges.length, lineStart, lineEnd });
    const stream = pdf.stream("", Buffer.from(content, "ascii"));
    pageIds.push(pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << ${resources} >> /Contents ${stream} 0 R >>`));
  });
  pdf.set(pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  pdf.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const invoiceNumber = input.invoice.myobNumber || input.invoice.invoiceNumber || "Invoice";
  const fileName = `${safeFilePart(invoiceNumber, "Invoice")}-${safeFilePart(input.job.title || input.quote.clientName || "Invoice", "Invoice")}.pdf`;
  return { fileName, bytes: pdf.serialize(catalogId) };
}
