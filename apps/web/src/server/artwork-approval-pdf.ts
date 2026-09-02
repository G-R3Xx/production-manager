import "server-only";

import { inflateSync, deflateSync } from "node:zlib";
import type { ArtworkApprovalPageRecord, ArtworkApprovalRecord, QuoteDraftRecord } from "@/server/quotes";

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MAX_FETCH_BYTES = 50 * 1024 * 1024;

type PdfObject = Buffer | null;

type EmbeddedImage = {
  objectId: number;
  width: number;
  height: number;
};

type ProofAttachment = {
  fileName: string;
  content: Uint8Array;
};

export type ArtworkProofPdfResult = {
  fileName: string;
  bytes: Uint8Array;
  extraPdfAttachments: ProofAttachment[];
  notes: string[];
};

class PdfBuilder {
  private objects: PdfObject[] = [];

  reserve(): number {
    this.objects.push(null);
    return this.objects.length;
  }

  add(content: string | Buffer): number {
    this.objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii"));
    return this.objects.length;
  }

  set(id: number, content: string | Buffer): void {
    this.objects[id - 1] = Buffer.isBuffer(content) ? content : Buffer.from(content, "ascii");
  }

  stream(dictionary: string, bytes: Uint8Array): number {
    const data = Buffer.from(bytes);
    return this.add(Buffer.concat([
      Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, "ascii"),
      data,
      Buffer.from("\nendstream", "ascii"),
    ]));
  }

  serialize(rootId: number): Uint8Array {
    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%PMART\n", "ascii")];
    const offsets = [0];
    let cursor = chunks[0].length;

    this.objects.forEach((object, index) => {
      if (!object) throw new Error(`Artwork PDF object ${index + 1} was not initialised.`);
      offsets.push(cursor);
      const head = Buffer.from(`${index + 1} 0 obj\n`, "ascii");
      const tail = Buffer.from("\nendobj\n", "ascii");
      chunks.push(head, object, tail);
      cursor += head.length + object.length + tail.length;
    });

    const xrefOffset = cursor;
    const xref: string[] = [`xref\n0 ${this.objects.length + 1}\n`, "0000000000 65535 f \n"];
    for (let i = 1; i <= this.objects.length; i += 1) {
      xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    xref.push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    chunks.push(Buffer.from(xref.join(""), "ascii"));
    return new Uint8Array(Buffer.concat(chunks));
  }
}

function safeText(value: unknown): string {
  return String(value ?? "")
    .replace(/×/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function pdfEscape(value: unknown): string {
  return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textOp(text: string, x: number, y: number, size = 10, bold = false, grey = 0): string {
  const g = Math.max(0, Math.min(1, grey));
  return `${g.toFixed(3)} g BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(text)}) Tj ET\n`;
}

function lineOp(x1: number, y1: number, x2: number, y2: number, width = 0.7, grey = 0.85): string {
  const g = Math.max(0, Math.min(1, grey));
  return `${g.toFixed(3)} G ${width} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
}

function rectFillOp(x: number, y: number, width: number, height: number, r: number, g: number, b: number): string {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f\n`;
}

function wrapText(value: string, maxChars: number): string[] {
  const text = safeText(value);
  if (!text) return [];
  const words = text.split(/\s+/);
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
  return lines;
}

function safeFilePart(value: unknown, fallback: string): string {
  const cleaned = safeText(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || fallback;
}

function dateAu(value: Date = new Date()): string {
  return value.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function concatUint8(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterPng(data: Uint8Array, width: number, height: number, bytesPerPixel: number, rowBytes: number): Uint8Array {
  const expected = height * (rowBytes + 1);
  if (data.length < expected) throw new Error("PNG proof data is incomplete.");
  const out = new Uint8Array(height * rowBytes);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = data[src++]!;
    const rowOffset = y * rowBytes;
    const prevOffset = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = data[src++]!;
      const left = x >= bytesPerPixel ? out[rowOffset + x - bytesPerPixel]! : 0;
      const up = y > 0 ? out[prevOffset + x]! : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? out[prevOffset + x - bytesPerPixel]! : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`);
      out[rowOffset + x] = value;
    }
  }
  return out;
}

function embedJpeg(pdf: PdfBuilder, bytes: Uint8Array): EmbeddedImage {
  let offset = 2;
  let width = 0;
  let height = 0;
  let components = 3;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++]!;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) break;
    const sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (sof && length >= 8) {
      height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      components = bytes[offset + 7]! || 3;
      break;
    }
    offset += length;
  }
  if (!width || !height) throw new Error("JPEG proof dimensions could not be read.");
  const colorSpace = components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
  const id = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode`, bytes);
  return { objectId: id, width, height };
}

function embedPng(pdf: PdfBuilder, bytes: Uint8Array): EmbeddedImage {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error("Invalid PNG proof.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    const chunk = bytes.slice(dataStart, dataEnd);
    if (type === "IHDR") {
      width = readUint32(chunk, 0);
      height = readUint32(chunk, 4);
      bitDepth = chunk[8]!;
      colorType = chunk[9]!;
    } else if (type === "IDAT") idat.push(chunk);
    else if (type === "PLTE") palette = chunk;
    else if (type === "tRNS") transparency = chunk;
    else if (type === "IEND") break;
    offset = dataEnd + 4;
  }
  if (!width || !height || !idat.length) throw new Error("PNG proof is incomplete.");
  if (bitDepth !== 8) throw new Error(`PNG bit depth ${bitDepth} is not supported in emailed proof packs. Export the proof as an 8-bit PNG, JPG or PDF.`);

  const compressed = concatUint8(idat);
  if (colorType === 0 || colorType === 2) {
    const colors = colorType === 0 ? 1 : 3;
    const colorSpace = colorType === 0 ? "/DeviceGray" : "/DeviceRGB";
    const id = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${width} >>`, compressed);
    return { objectId: id, width, height };
  }

  if (colorType === 3) {
    if (!palette?.length) throw new Error("Indexed PNG proof has no palette.");
    const paletteMax = Math.max(0, Math.floor(palette.length / 3) - 1);
    let smaskId: number | null = null;
    if (transparency?.length) {
      const raw = unfilterPng(new Uint8Array(inflateSync(compressed)), width, height, 1, width);
      const alpha = new Uint8Array(width * height);
      for (let i = 0; i < raw.length; i += 1) alpha[i] = transparency[raw[i]!] ?? 255;
      smaskId = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, new Uint8Array(deflateSync(alpha)));
    }
    const paletteHex = Buffer.from(palette).toString("hex").toUpperCase();
    const smask = smaskId ? ` /SMask ${smaskId} 0 R` : "";
    const id = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace [/Indexed /DeviceRGB ${paletteMax} <${paletteHex}>] /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns ${width} >>${smask}`, compressed);
    return { objectId: id, width, height };
  }

  if (colorType === 4 || colorType === 6) {
    const channels = colorType === 4 ? 2 : 4;
    const raw = unfilterPng(new Uint8Array(inflateSync(compressed)), width, height, channels, width * channels);
    const colorChannels = colorType === 4 ? 1 : 3;
    const colour = new Uint8Array(width * height * colorChannels);
    const alpha = new Uint8Array(width * height);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      if (colorType === 4) {
        colour[pixel] = raw[pixel * 2]!;
        alpha[pixel] = raw[pixel * 2 + 1]!;
      } else {
        colour[pixel * 3] = raw[pixel * 4]!;
        colour[pixel * 3 + 1] = raw[pixel * 4 + 1]!;
        colour[pixel * 3 + 2] = raw[pixel * 4 + 2]!;
        alpha[pixel] = raw[pixel * 4 + 3]!;
      }
    }
    const smaskId = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, new Uint8Array(deflateSync(alpha)));
    const colorSpace = colorType === 4 ? "/DeviceGray" : "/DeviceRGB";
    const id = pdf.stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /FlateDecode /SMask ${smaskId} 0 R`, new Uint8Array(deflateSync(colour)));
    return { objectId: id, width, height };
  }

  throw new Error(`PNG colour type ${colorType} is not supported in emailed proof packs.`);
}

function imageKind(bytes: Uint8Array, contentType: string, fileName: string): "jpeg" | "png" | "pdf" | "other" {
  const name = fileName.toLowerCase();
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (/jpeg|jpg/i.test(contentType) || /\.jpe?g$/i.test(name)) return "jpeg";
  if (/png/i.test(contentType) || /\.png$/i.test(name)) return "png";
  if (/pdf/i.test(contentType) || /\.pdf$/i.test(name)) return "pdf";
  return "other";
}

async function fetchBinary(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (/^data:/i.test(url)) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (!match) throw new Error("Proof data URL could not be read.");
    const contentType = match[1] || "application/octet-stream";
    const bytes = match[2]
      ? new Uint8Array(Buffer.from(match[3] || "", "base64"))
      : new Uint8Array(Buffer.from(decodeURIComponent(match[3] || ""), "utf8"));
    return { bytes, contentType };
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`Could not download proof (${response.status}).`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_FETCH_BYTES) throw new Error("A proof file is over 50MB. Export a smaller proof before emailing it.");
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FETCH_BYTES) throw new Error("A proof file is over 50MB. Export a smaller proof before emailing it.");
  return { bytes: new Uint8Array(arrayBuffer), contentType: response.headers.get("content-type") || "application/octet-stream" };
}

function drawImagePageContent(image: EmbeddedImage, pageSize: [number, number], title: string, revision: string, proofIndex: number, proofCount: number): string {
  const [pageW, pageH] = pageSize;
  const margin = 34;
  const headerH = 62;
  const footerH = 32;
  const availableW = pageW - margin * 2;
  const availableH = pageH - margin * 2 - headerH - footerH;
  const scale = Math.min(availableW / image.width, availableH / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const x = (pageW - drawW) / 2;
  const y = margin + footerH + (availableH - drawH) / 2;
  let content = "";
  content += rectFillOp(0, 0, pageW, pageH, 1, 1, 1);
  content += textOp("ARTWORK PROOF", margin, pageH - 34, 8, true, 0.38);
  content += textOp(title || `Proof ${proofIndex}`, margin, pageH - 52, 14, true, 0.08);
  content += textOp(`Revision ${revision}  |  Proof ${proofIndex} of ${proofCount}`, pageW - 180, pageH - 34, 8, true, 0.38);
  content += lineOp(margin, pageH - headerH, pageW - margin, pageH - headerH, 0.7, 0.86);
  content += `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q\n`;
  content += lineOp(margin, margin + footerH - 3, pageW - margin, margin + footerH - 3, 0.5, 0.9);
  content += textOp("Please check artwork, spelling, colours, dimensions and supplied content carefully before approval.", margin, margin + 9, 7.4, false, 0.42);
  return content;
}

function buildCoverContent(input: {
  companyName: string;
  projectName: string;
  clientName: string;
  contactName: string;
  quoteNumber: string;
  revision: string;
  pageLabels: string[];
  logoImage: EmbeddedImage | null;
}): string {
  const [pageW, pageH] = A4_PORTRAIT;
  let content = "";
  content += rectFillOp(0, 0, pageW, pageH, 1, 1, 1);
  content += rectFillOp(0, pageH - 12, pageW, 12, 0.08, 0.66, 0.72);
  if (input.logoImage) {
    const maxW = 205;
    const maxH = 55;
    const scale = Math.min(maxW / input.logoImage.width, maxH / input.logoImage.height);
    const w = input.logoImage.width * scale;
    const h = input.logoImage.height * scale;
    content += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 42 ${(pageH - 55 - h / 2).toFixed(2)} cm /Logo Do Q\n`;
  } else {
    content += textOp(input.companyName, 42, pageH - 72, 18, true, 0.08);
  }
  content += textOp("ARTWORK PROOFS", 42, pageH - 142, 11, true, 0.38);
  content += textOp(input.projectName || "Artwork Approval", 42, pageH - 176, 25, true, 0.06);
  content += textOp(`Revision ${input.revision}`, 42, pageH - 205, 12, true, 0.2);
  content += lineOp(42, pageH - 228, pageW - 42, pageH - 228, 0.8, 0.84);

  const rows: Array<[string, string]> = [
    ["CLIENT", input.clientName],
    ["CONTACT", input.contactName || "-"],
    ["QUOTE", input.quoteNumber || "-"],
    ["ISSUED", dateAu()],
  ];
  let y = pageH - 268;
  for (const [label, value] of rows) {
    content += textOp(label, 42, y, 8, true, 0.45);
    content += textOp(value, 150, y, 10, true, 0.12);
    y -= 28;
  }

  y -= 18;
  content += textOp("PROOFS INCLUDED", 42, y, 9, true, 0.38);
  y -= 24;
  input.pageLabels.slice(0, 18).forEach((label, index) => {
    content += rectFillOp(42, y - 4, 18, 18, 0.93, 0.96, 1);
    content += textOp(String(index + 1), 48, y + 1, 8, true, 0.12);
    content += textOp(label, 72, y + 1, 9.5, index < 18, 0.15);
    y -= 25;
  });
  if (input.pageLabels.length > 18) content += textOp(`+ ${input.pageLabels.length - 18} additional proofs`, 72, y, 9, true, 0.35);

  content += rectFillOp(42, 74, pageW - 84, 72, 0.965, 0.977, 0.992);
  content += textOp("CLIENT REVIEW", 58, 124, 8, true, 0.1);
  const reviewLines = wrapText("Please review every proof carefully. If your security settings block the online approval page, reply to the artwork email with APPROVED or list the changes required. Tender Edge staff will record your email approval in Production Manager.", 88).slice(0, 4);
  reviewLines.forEach((line, index) => { content += textOp(line, 58, 106 - index * 12, 8.4, false, 0.3); });
  return content;
}

export async function buildArtworkProofPdf(input: {
  approval: ArtworkApprovalRecord;
  pages: ArtworkApprovalPageRecord[];
  sourceQuote: QuoteDraftRecord | null;
  companyName: string;
  companyLogoUrl?: string | null;
  fallbackLogoUrl?: string | null;
}): Promise<ArtworkProofPdfResult> {
  const pdf = new PdfBuilder();
  const catalogId = pdf.reserve();
  const pagesId = pdf.reserve();
  const fontId = pdf.reserve();
  const boldFontId = pdf.reserve();
  pdf.set(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pdf.set(boldFontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let logoImage: EmbeddedImage | null = null;
  const logoUrl = input.companyLogoUrl || input.fallbackLogoUrl || "";
  if (logoUrl) {
    try {
      const logo = await fetchBinary(logoUrl);
      const kind = imageKind(logo.bytes, logo.contentType, "logo");
      logoImage = kind === "png" ? embedPng(pdf, logo.bytes) : kind === "jpeg" ? embedJpeg(pdf, logo.bytes) : null;
    } catch {
      logoImage = null;
    }
  }

  const fetchedProofs: Array<{
    page: ArtworkApprovalPageRecord;
    kind: "jpeg" | "png" | "pdf" | "other";
    bytes: Uint8Array;
    contentType: string;
    fileName: string;
  }> = [];
  const notes: string[] = [];
  for (const page of input.pages) {
    try {
      const downloaded = await fetchBinary(page.imageUrl);
      const fileName = page.fileName || `${safeFilePart(page.signCode || page.title, "Proof")}.bin`;
      fetchedProofs.push({ page, kind: imageKind(downloaded.bytes, downloaded.contentType, fileName), bytes: downloaded.bytes, contentType: downloaded.contentType, fileName });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`${page.signCode || page.title}: ${message}`);
    }
  }

  const projectName = input.approval.projectName || input.sourceQuote?.jobName || input.approval.drawingTitle || "Artwork Approval";
  const quoteNumber = input.sourceQuote?.quoteNumber || "";
  const revision = input.approval.revision || "A";
  const pageLabels = input.pages.map((page) => [page.signCode, page.title].filter(Boolean).join(" - ") || "Artwork proof");
  const pageIds: number[] = [];

  // Cover page.
  const coverResources = `/Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>${logoImage ? ` /XObject << /Logo ${logoImage.objectId} 0 R >>` : ""}`;
  const coverContent = buildCoverContent({
    companyName: input.companyName,
    projectName,
    clientName: input.approval.clientName,
    contactName: input.approval.contactName || "",
    quoteNumber,
    revision,
    pageLabels,
    logoImage,
  });
  const coverStream = pdf.stream("", Buffer.from(coverContent, "ascii"));
  pageIds.push(pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_PORTRAIT[0]} ${A4_PORTRAIT[1]}] /Resources << ${coverResources} >> /Contents ${coverStream} 0 R >>`));

  const extraPdfAttachments: ProofAttachment[] = [];
  let imageProofIndex = 0;
  for (const proof of fetchedProofs) {
    if (proof.kind === "pdf") {
      const attachmentName = proof.fileName.toLowerCase().endsWith(".pdf") ? proof.fileName : `${safeFilePart(proof.page.signCode || proof.page.title, "Proof")}.pdf`;
      extraPdfAttachments.push({ fileName: attachmentName, content: proof.bytes });
      continue;
    }
    if (proof.kind !== "jpeg" && proof.kind !== "png") {
      notes.push(`${proof.page.signCode || proof.page.title}: ${proof.fileName} is not a PNG, JPG or PDF and could not be added to the PDF pack.`);
      continue;
    }
    try {
      const image = proof.kind === "jpeg" ? embedJpeg(pdf, proof.bytes) : embedPng(pdf, proof.bytes);
      imageProofIndex += 1;
      const pageSize = image.width > image.height * 1.08 ? A4_LANDSCAPE : A4_PORTRAIT;
      const title = [proof.page.signCode, proof.page.title].filter(Boolean).join(" - ") || `Artwork proof ${imageProofIndex}`;
      const content = drawImagePageContent(image, pageSize, title, revision, input.pages.indexOf(proof.page) + 1, input.pages.length);
      const contentStream = pdf.stream("", Buffer.from(content, "ascii"));
      pageIds.push(pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageSize[0]} ${pageSize[1]}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> /XObject << /Im0 ${image.objectId} 0 R >> >> /Contents ${contentStream} 0 R >>`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notes.push(`${proof.page.signCode || proof.page.title}: ${message}`);
    }
  }

  pdf.set(pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  pdf.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const fileName = `${safeFilePart(quoteNumber || projectName, "Artwork")}-${safeFilePart(projectName, "Proofs")}-Rev-${safeFilePart(revision, "A")}-Artwork-Proofs.pdf`;
  return { fileName, bytes: pdf.serialize(catalogId), extraPdfAttachments, notes };
}
