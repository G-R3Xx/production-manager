import "server-only";

import { inflateSync, deflateSync } from "node:zlib";
import type { ArtworkApprovalPageRecord, ArtworkApprovalRecord, QuoteDraftRecord, QuoteLineRecord } from "@/server/quotes";
import { applyPmsColoursToArtworkSpecification, buildArtworkSpecificationSnapshot, pmsColoursForRevision, specificationForRevision, type ArtworkSpecificationItem } from "@/lib/artworkSpecification";
import { pmsScreenSwatches } from "@/lib/pmsColour";

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

function rectStrokeOp(x: number, y: number, width: number, height: number, lineWidth = 0.7, grey = 0.82): string {
  const g = Math.max(0, Math.min(1, grey));
  return `${g.toFixed(3)} G ${lineWidth} w ${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re S\n`;
}

function circleStrokeOp(cx: number, cy: number, radius: number, width = 0.8, grey = 0.1): string {
  const k = radius * 0.5522847498;
  const g = Math.max(0, Math.min(1, grey));
  return `${g.toFixed(3)} G ${width} w ${(cx + radius).toFixed(1)} ${cy.toFixed(1)} m ${(cx + radius).toFixed(1)} ${(cy + k).toFixed(1)} ${(cx + k).toFixed(1)} ${(cy + radius).toFixed(1)} ${cx.toFixed(1)} ${(cy + radius).toFixed(1)} c ${(cx - k).toFixed(1)} ${(cy + radius).toFixed(1)} ${(cx - radius).toFixed(1)} ${(cy + k).toFixed(1)} ${(cx - radius).toFixed(1)} ${cy.toFixed(1)} c ${(cx - radius).toFixed(1)} ${(cy - k).toFixed(1)} ${(cx - k).toFixed(1)} ${(cy - radius).toFixed(1)} ${cx.toFixed(1)} ${(cy - radius).toFixed(1)} c ${(cx + k).toFixed(1)} ${(cy - radius).toFixed(1)} ${(cx + radius).toFixed(1)} ${(cy - k).toFixed(1)} ${(cx + radius).toFixed(1)} ${cy.toFixed(1)} c S\n`;
}

function hexRgb(value: string | null | undefined): [number, number, number] | null {
  const match = String(value ?? "").trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1]!;
  return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
}

function wrappedTextOps(value: string, x: number, y: number, maxChars: number, options?: { size?: number; bold?: boolean; grey?: number; leading?: number; maxLines?: number }): { content: string; endY: number; lines: number } {
  const size = options?.size ?? 8;
  const bold = options?.bold ?? false;
  const grey = options?.grey ?? 0.15;
  const leading = options?.leading ?? size * 1.28;
  const maxLines = options?.maxLines ?? 6;
  const lines = wrapText(value, maxChars).slice(0, maxLines);
  let content = "";
  lines.forEach((line, index) => { content += textOp(line, x, y - index * leading, size, bold, grey); });
  return { content, endY: y - lines.length * leading, lines: lines.length };
}

function specificationForPdf(page: ArtworkApprovalPageRecord, line: QuoteLineRecord | null | undefined, approval: ArtworkApprovalRecord): ArtworkSpecificationItem[] {
  const revision = page.proofRevision || approval.revision || "A";
  const refreshFromSource = approval.status === "draft";
  const base = line && refreshFromSource
    ? buildArtworkSpecificationSnapshot(line)
    : specificationForRevision(page.payloadJson, revision) ?? (line ? buildArtworkSpecificationSnapshot(line) : null);
  const pms = pmsColoursForRevision(page.payloadJson, revision, refreshFromSource);
  const snapshot = applyPmsColoursToArtworkSpecification(base, pms);
  if (snapshot?.items.length) return snapshot.items;

  const fallback: ArtworkSpecificationItem[] = [];
  if (safeText(page.substrateSummary)) fallback.push({ key: "substrate", label: "Substrate", value: safeText(page.substrateSummary), icon: "substrate" });
  if (safeText(page.colourSummary)) fallback.push({ key: "colour-fallback", label: "Colour / print", value: safeText(page.colourSummary), icon: "colour" });
  if (safeText(page.installSummary)) fallback.push({ key: "dispatch-fallback", label: "Pickup / delivery / install", value: safeText(page.installSummary), icon: "install" });
  if (safeText(page.sizeSummary)) fallback.push({ key: "size", label: "Finished size", value: safeText(page.sizeSummary), icon: "size" });
  fallback.push({ key: "quantity", label: "Quantity", value: safeText(page.quantity || "1") || "1", icon: "quantity" });
  return fallback;
}

function specIconOp(icon: ArtworkSpecificationItem["icon"], x: number, y: number): string {
  const g = "0.120 G 1.0 w ";
  if (icon === "substrate") return `${g}${x} ${y + 9} m ${x + 10} ${y + 14} l ${x + 20} ${y + 9} l ${x + 10} ${y + 4} l h S\n${g}${x + 2} ${y + 4} m ${x + 10} ${y} l ${x + 18} ${y + 4} l S\n`;
  if (icon === "colour") return circleStrokeOp(x + 6, y + 10, 5) + circleStrokeOp(x + 15, y + 10, 5) + circleStrokeOp(x + 10.5, y + 3, 5);
  if (icon === "print") return `${g}${x + 2} ${y + 5} ${18} ${10} re S\n${g}${x + 6} ${y + 12} ${10} ${6} re S\n${g}${x + 6} ${y} ${10} ${7} re S\n`;
  if (icon === "laminate") return circleStrokeOp(x + 6, y + 13, 5) + `${g}${x + 11} ${y + 13} m ${x + 20} ${y + 13} l ${x + 20} ${y + 3} l ${x + 4} ${y + 3} l S\n`;
  if (icon === "backing") return `${g}${x + 2} ${y + 2} ${17} ${15} re S\n${g}${x + 3} ${y + 3} m ${x + 18} ${y + 16} l S\n`;
  if (icon === "cut") return circleStrokeOp(x + 5, y + 5, 2.5) + circleStrokeOp(x + 11, y + 5, 2.5) + `${g}${x + 7} ${y + 7} m ${x + 18} ${y + 18} l ${x + 10} ${y + 7} m ${x + 18} ${y + 2} l S\n`;
  if (icon === "mounting") return circleStrokeOp(x + 10, y + 9, 5) + `${g}${x} ${y + 9} m ${x + 5} ${y + 9} l ${x + 15} ${y + 9} m ${x + 20} ${y + 9} l ${x + 10} ${y - 1} m ${x + 10} ${y + 4} l ${x + 10} ${y + 14} m ${x + 10} ${y + 19} l S\n`;
  if (icon === "delivery") return `${g}${x} ${y + 4} ${13} ${10} re S\n${g}${x + 13} ${y + 4} m ${x + 19} ${y + 4} l ${x + 19} ${y + 10} l ${x + 15} ${y + 14} l ${x + 13} ${y + 14} l S\n` + circleStrokeOp(x + 5, y + 2, 2) + circleStrokeOp(x + 16, y + 2, 2);
  if (icon === "pickup") return `${g}${x + 2} ${y + 7} ${12} ${10} re S\n${g}${x + 18} ${y + 18} m ${x + 18} ${y} l ${x + 14} ${y + 4} m ${x + 18} ${y} l ${x + 22} ${y + 4} l S\n`;
  if (icon === "install") return `${g}${x + 2} ${y + 2} m ${x + 19} ${y + 19} l ${x + 14} ${y + 19} m ${x + 19} ${y + 14} l ${x + 2} ${y + 18} m ${x + 18} ${y + 2} l S\n`;
  if (icon === "size") return `${g}${x + 2} ${y + 3} ${17} ${13} re S\n${g}${x + 2} ${y + 19} m ${x + 19} ${y + 19} l ${x + 2} ${y + 17} m ${x + 2} ${y + 21} l ${x + 19} ${y + 17} m ${x + 19} ${y + 21} l S\n`;
  if (icon === "quantity") return `${g}${x + 1} ${y + 7} ${14} ${11} re S\n${g}${x + 5} ${y + 3} ${14} ${11} re S\n`;
  return `${g}${x + 2} ${y + 2} ${17} ${16} re S\n`;
}

function specItemHeight(item: ArtworkSpecificationItem, panelTextChars = 28): number {
  if (item.key === "colour") {
    const count = Math.max(1, pmsScreenSwatches(item.value).length);
    return 31 + Math.ceil(count / 2) * 17 + (item.detail ? 13 : 0);
  }
  const valueLines = Math.min(3, Math.max(1, wrapText(item.value, panelTextChars).length));
  const detailLines = item.detail ? Math.min(2, wrapText(item.detail, panelTextChars + 5).length) : 0;
  return Math.max(39, 27 + valueLines * 9 + detailLines * 7);
}

function drawSpecificationPanel(items: ArtworkSpecificationItem[], x: number, y: number, width: number, height: number): string {
  let content = "";
  content += rectFillOp(x, y, width, height, 1, 1, 1);
  content += rectStrokeOp(x, y, width, height, 0.7, 0.78);
  const headerH = 27;
  content += textOp("SIGN SPECIFICATION", x + 10, y + height - 18, 7.2, true, 0.08);
  content += textOp("APPROVAL SPECIFICATION", x + width - 87, y + height - 18, 5.5, true, 0.52);
  content += lineOp(x, y + height - headerH, x + width, y + height - headerH, 0.6, 0.82);

  const preferred = items.map((item) => specItemHeight(item));
  const available = height - headerH;
  const totalPreferred = preferred.reduce((sum, value) => sum + value, 0);
  const factor = totalPreferred > available ? Math.max(0.72, available / totalPreferred) : 1;
  let top = y + height - headerH;

  items.forEach((item, index) => {
    const itemH = Math.max(30, preferred[index]! * factor);
    const bottom = top - itemH;
    if (index) content += lineOp(x, top, x + width, top, 0.5, 0.86);
    const iconW = 31;
    content += lineOp(x + iconW, bottom, x + iconW, top, 0.45, 0.88);
    content += specIconOp(item.icon, x + 5.5, bottom + itemH / 2 - 9);
    content += textOp(item.label.toUpperCase(), x + iconW + 7, top - 11, 5.7, true, 0.42);

    if (item.key === "colour") {
      const swatches = pmsScreenSwatches(item.value);
      const colW = (width - iconW - 15) / 2;
      swatches.slice(0, 8).forEach((swatch, swatchIndex) => {
        const col = swatchIndex % 2;
        const row = Math.floor(swatchIndex / 2);
        const swatchY = top - 28 - row * 17;
        const swatchX = x + iconW + 7 + col * colW;
        const rgb = hexRgb(swatch.hex);
        if (rgb) content += rectFillOp(swatchX, swatchY, 11, 11, rgb[0], rgb[1], rgb[2]);
        else content += rectFillOp(swatchX, swatchY, 11, 11, 0.92, 0.93, 0.95);
        content += rectStrokeOp(swatchX, swatchY, 11, 11, 0.5, 0.62);
        const label = safeText(swatch.label).slice(0, 18);
        content += textOp(label, swatchX + 15, swatchY + 2.5, 6.2, true, 0.08);
      });
      if (item.detail) {
        const detail = wrapText(item.detail, 50).slice(0, 2);
        detail.forEach((line, detailIndex) => { content += textOp(line, x + iconW + 7, bottom + 6 + detailIndex * 6.5, 5.1, false, 0.42); });
      }
    } else {
      const value = wrappedTextOps(item.value, x + iconW + 7, top - 23, 28, { size: 6.8, bold: true, grey: 0.07, leading: 8.2, maxLines: 3 });
      if (item.detail) {
        const detailY = Math.max(bottom + 5, value.endY - 1);
        content += wrappedTextOps(item.detail, x + iconW + 7, detailY, 34, { size: 5.4, grey: 0.42, leading: 6.5, maxLines: 2 }).content;
      }
    }
    top = bottom;
  });
  return content;
}

function approvalStatus(page: ArtworkApprovalPageRecord): string {
  if (page.clientResponseStatus === "approved") return "Approved";
  if (page.clientResponseStatus === "changes_requested") return "Changes requested";
  return "Awaiting decision";
}

function watermarkTextForPdf(companyName: string, quoteNumber: string): string {
  const company = safeText(companyName || "Tender Edge").toUpperCase();
  const quote = safeText(quoteNumber);
  return quote ? `PROOF ONLY - ${company} - ${quote}` : `PROOF ONLY - ${company}`;
}

function drawWatermarkOps(text: string, x: number, y: number, width: number, height: number): string {
  const fontSize = Math.min(26, Math.max(17, width / 23));
  const cx = x + width / 2;
  const cy = y + height / 2;
  const label = safeText(text).slice(0, 72);
  // Light diagonal text. The online client page uses a proof watermark as well.
  return `q 0.707 0.707 -0.707 0.707 ${cx.toFixed(1)} ${cy.toFixed(1)} cm 0.820 g BT /F2 ${fontSize.toFixed(1)} Tf 1 0 0 1 ${(-width * 0.31).toFixed(1)} 0 Tm (${pdfEscape(label)}) Tj ET Q\n`;
}

function buildApprovalSheetContent(input: {
  image: EmbeddedImage | null;
  isSourcePdf: boolean;
  sourcePdfFileName: string;
  specification: ArtworkSpecificationItem[];
  page: ArtworkApprovalPageRecord;
  proofIndex: number;
  proofCount: number;
  approval: ArtworkApprovalRecord;
  companyName: string;
  quoteNumber: string;
  projectName: string;
  revision: string;
  logoImage: EmbeddedImage | null;
}): string {
  const [pageW, pageH] = A4_LANDSCAPE;
  const margin = 24;
  const headerY = pageH - 80;
  const headerH = 57;
  const articleBottom = 46;
  const articleTop = headerY - 31;
  const articleH = articleTop - articleBottom;
  const articleHeaderH = 35;
  const contentTop = articleTop - articleHeaderH;
  const contentBottom = articleBottom + 9;
  const contentH = contentTop - contentBottom;
  const specW = 196;
  const gap = 13;
  const proofX = margin + 10;
  const proofW = pageW - margin * 2 - specW - gap - 20;
  const specX = proofX + proofW + gap;
  const bodyPad = 10;
  let content = "";

  content += rectFillOp(0, 0, pageW, pageH, 0.975, 0.981, 0.989);
  // Header card.
  content += rectFillOp(margin, headerY, pageW - margin * 2, headerH, 1, 1, 1);
  content += rectStrokeOp(margin, headerY, pageW - margin * 2, headerH, 0.6, 0.82);
  if (input.logoImage) {
    const maxW = 107;
    const maxH = 35;
    const scale = Math.min(maxW / input.logoImage.width, maxH / input.logoImage.height);
    const logoW = input.logoImage.width * scale;
    const logoH = input.logoImage.height * scale;
    content += `q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${(margin + 13).toFixed(2)} ${(headerY + (headerH - logoH) / 2).toFixed(2)} cm /Logo Do Q\n`;
  } else content += textOp(input.companyName, margin + 13, headerY + 23, 13, true, 0.08);
  content += textOp("ARTWORK APPROVAL", margin + 134, headerY + 39, 6.2, true, 0.42);
  content += textOp(input.projectName, margin + 134, headerY + 20, 14.5, true, 0.06);
  const clientLine = [input.approval.clientName, input.approval.contactName].filter(Boolean).join(" - ");
  content += textOp(clientLine, margin + 134, headerY + 7, 7.2, false, 0.34);
  content += textOp(approvalStatus(input.page), pageW - margin - 94, headerY + 39, 6.4, true, input.page.clientResponseStatus === "approved" ? 0.28 : 0.42);
  content += textOp(input.quoteNumber || input.approval.drawingNumber || "Artwork proof", pageW - margin - 145, headerY + 21, 8.2, true, 0.08);
  content += textOp(`Revision ${input.revision}${input.approval.sentAt ? ` - sent ${dateAu(new Date(input.approval.sentAt))}` : ""}`, pageW - margin - 145, headerY + 7, 6.5, false, 0.42);

  // Client message strip.
  content += rectFillOp(margin, headerY - 24, pageW - margin * 2, 20, 0.985, 0.989, 0.995);
  content += rectStrokeOp(margin, headerY - 24, pageW - margin * 2, 20, 0.45, 0.88);
  const message = safeText(input.approval.clientMessage) || "Please review the proof and approval specification carefully. Reply APPROVED by email, or list the changes required.";
  content += textOp(message.slice(0, 130), margin + 10, headerY - 17, 6.7, false, 0.31);

  // Proof article.
  content += rectFillOp(margin, articleBottom, pageW - margin * 2, articleH, 1, 1, 1);
  content += rectStrokeOp(margin, articleBottom, pageW - margin * 2, articleH, 0.65, 0.80);
  content += rectFillOp(margin, articleTop - articleHeaderH, pageW - margin * 2, articleHeaderH, 0.988, 0.991, 0.996);
  content += lineOp(margin, articleTop - articleHeaderH, pageW - margin, articleTop - articleHeaderH, 0.55, 0.86);
  content += textOp(`${safeText(input.page.signCode || `S${input.proofIndex}`)} - PROOF ${input.proofIndex} OF ${input.proofCount}`, margin + 10, articleTop - 13, 6.2, true, 0.40);
  content += textOp(safeText(input.page.title || `Artwork proof ${input.proofIndex}`), margin + 10, articleTop - 28, 11.5, true, 0.07);
  content += textOp(approvalStatus(input.page), pageW - margin - 95, articleTop - 21, 6.4, true, 0.36);

  // Proof area.
  content += rectFillOp(proofX, contentBottom, proofW, contentH, 0.94, 0.953, 0.968);
  content += rectStrokeOp(proofX, contentBottom, proofW, contentH, 0.45, 0.88);
  if (input.image) {
    const maxW = proofW - bodyPad * 2;
    const maxH = contentH - bodyPad * 2;
    const scale = Math.min(maxW / input.image.width, maxH / input.image.height);
    const drawW = input.image.width * scale;
    const drawH = input.image.height * scale;
    const drawX = proofX + (proofW - drawW) / 2;
    const drawY = contentBottom + (contentH - drawH) / 2;
    content += `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm /Im0 Do Q\n`;
    if (input.page.clientResponseStatus !== "approved") content += drawWatermarkOps(watermarkTextForPdf(input.companyName, input.quoteNumber), drawX, drawY, drawW, drawH);
  } else if (input.isSourcePdf) {
    content += rectFillOp(proofX + 34, contentBottom + contentH / 2 - 50, proofW - 68, 100, 1, 1, 1);
    content += rectStrokeOp(proofX + 34, contentBottom + contentH / 2 - 50, proofW - 68, 100, 0.7, 0.78);
    content += textOp("PDF PROOF", proofX + 52, contentBottom + contentH / 2 + 18, 9, true, 0.10);
    content += textOp("Original proof attached separately", proofX + 52, contentBottom + contentH / 2 - 2, 13, true, 0.08);
    content += wrappedTextOps(input.sourcePdfFileName, proofX + 52, contentBottom + contentH / 2 - 22, 64, { size: 7.2, grey: 0.36, maxLines: 2 }).content;
  }

  // Specification panel mirrors the online artwork approval.
  content += drawSpecificationPanel(input.specification, specX, contentBottom, specW, contentH);

  // Decision / email approval strip.
  const decisionText = input.page.clientResponseStatus === "approved"
    ? "Decision for this page: Approved"
    : input.page.clientResponseStatus === "changes_requested"
      ? "Decision for this page: Changes requested"
      : "Email approval: reply APPROVED or list the changes required.";
  content += textOp(decisionText, margin + 10, 27, 6.8, true, 0.27);
  if (safeText(input.page.notes) && !/auto-created from quote line/i.test(safeText(input.page.notes))) {
    content += textOp(`Notes: ${safeText(input.page.notes).slice(0, 95)}`, pageW / 2, 27, 6.0, false, 0.42);
  }
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
  const [pageW, pageH] = A4_LANDSCAPE;
  let content = "";
  content += rectFillOp(0, 0, pageW, pageH, 1, 1, 1);
  // Minimal landscape cover: the company logo is deliberately the hero.
  content += rectFillOp(0, pageH - 7, pageW, 7, 0.08, 0.66, 0.72);
  content += textOp("ARTWORK APPROVAL PROOF PACK", 34, pageH - 38, 7.2, true, 0.40);
  content += textOp(`Revision ${input.revision}`, pageW - 104, pageH - 38, 7.2, true, 0.40);

  if (input.logoImage) {
    const maxW = 430;
    const maxH = 145;
    const scale = Math.min(maxW / input.logoImage.width, maxH / input.logoImage.height);
    const logoW = input.logoImage.width * scale;
    const logoH = input.logoImage.height * scale;
    content += `q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${((pageW - logoW) / 2).toFixed(2)} ${(pageH - 255 - logoH / 2).toFixed(2)} cm /Logo Do Q\n`;
  } else {
    const company = safeText(input.companyName);
    content += textOp(company, Math.max(34, pageW / 2 - company.length * 7), pageH - 240, 30, true, 0.07);
  }

  const titleLines = wrapText(input.projectName || "Artwork Approval", 46).slice(0, 2);
  titleLines.forEach((line, index) => {
    const approxX = Math.max(34, pageW / 2 - line.length * 5.4);
    content += textOp(line, approxX, 224 - index * 25, 20, true, 0.06);
  });
  const meta = [input.clientName, input.contactName, input.quoteNumber].filter(Boolean).join("  |  ");
  content += textOp(meta, Math.max(34, pageW / 2 - meta.length * 3.2), 172, 9, true, 0.28);
  content += textOp(`${input.pageLabels.length} proof${input.pageLabels.length === 1 ? "" : "s"} included  |  Issued ${dateAu()}`, pageW / 2 - 86, 151, 7.5, false, 0.42);

  content += rectFillOp(34, 42, pageW - 68, 74, 0.965, 0.977, 0.992);
  content += rectStrokeOp(34, 42, pageW - 68, 74, 0.5, 0.86);
  content += textOp("CLIENT REVIEW", 50, 93, 7.0, true, 0.10);
  const review = "Each following page is a PDF version of the Artwork Approval sheet, including the proof, PMS colour references and sign specification. If your organisation blocks the online link, review this PDF and reply to the email with APPROVED or the changes required.";
  wrapText(review, 118).slice(0, 3).forEach((line, index) => { content += textOp(line, 50, 77 - index * 12, 8.1, false, 0.29); });
  return content;
}

export async function buildArtworkProofPdf(input: {
  approval: ArtworkApprovalRecord;
  pages: ArtworkApprovalPageRecord[];
  sourceQuote: QuoteDraftRecord | null;
  sourceLines?: QuoteLineRecord[];
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
  pageIds.push(pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_LANDSCAPE[0]} ${A4_LANDSCAPE[1]}] /Resources << ${coverResources} >> /Contents ${coverStream} 0 R >>`));

  const extraPdfAttachments: ProofAttachment[] = [];
  const sourceLineById = new Map((input.sourceLines ?? []).map((line) => [line.id, line]));
  for (const proof of fetchedProofs) {
    const proofIndex = input.pages.indexOf(proof.page) + 1;
    const sourceLine = proof.page.sourceQuoteLineId ? sourceLineById.get(proof.page.sourceQuoteLineId) : null;
    const specification = specificationForPdf(proof.page, sourceLine, input.approval);
    let image: EmbeddedImage | null = null;
    let isSourcePdf = false;
    if (proof.kind === "pdf") {
      isSourcePdf = true;
      const attachmentName = proof.fileName.toLowerCase().endsWith(".pdf") ? proof.fileName : `${safeFilePart(proof.page.signCode || proof.page.title, "Proof")}.pdf`;
      extraPdfAttachments.push({ fileName: attachmentName, content: proof.bytes });
    } else if (proof.kind === "jpeg" || proof.kind === "png") {
      try {
        image = proof.kind === "jpeg" ? embedJpeg(pdf, proof.bytes) : embedPng(pdf, proof.bytes);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notes.push(`${proof.page.signCode || proof.page.title}: ${message}`);
        continue;
      }
    } else {
      notes.push(`${proof.page.signCode || proof.page.title}: ${proof.fileName} is not a PNG, JPG or PDF and could not be added to the PDF pack.`);
      continue;
    }

    const content = buildApprovalSheetContent({
      image,
      isSourcePdf,
      sourcePdfFileName: proof.fileName,
      specification,
      page: proof.page,
      proofIndex,
      proofCount: input.pages.length,
      approval: input.approval,
      companyName: input.companyName,
      quoteNumber,
      projectName,
      revision,
      logoImage,
    });
    const contentStream = pdf.stream("", Buffer.from(content, "ascii"));
    const xObjects = [logoImage ? `/Logo ${logoImage.objectId} 0 R` : "", image ? `/Im0 ${image.objectId} 0 R` : ""].filter(Boolean).join(" ");
    pageIds.push(pdf.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_LANDSCAPE[0]} ${A4_LANDSCAPE[1]}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>${xObjects ? ` /XObject << ${xObjects} >>` : ""} >> /Contents ${contentStream} 0 R >>`));
  }

  pdf.set(pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  pdf.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const fileName = `${safeFilePart(quoteNumber || projectName, "Artwork")}-${safeFilePart(projectName, "Proofs")}-Rev-${safeFilePart(revision, "A")}-Artwork-Proofs.pdf`;
  return { fileName, bytes: pdf.serialize(catalogId), extraPdfAttachments, notes };
}
