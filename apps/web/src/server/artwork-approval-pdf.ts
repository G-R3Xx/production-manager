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

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function summaryKey(value: unknown): string {
  return compactText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function materialDisplayName(value: unknown): string {
  const material = recordValue(value);
  if (!material) return "";
  return compactText(material.customerFacingName) || compactText(material.name);
}

function friendlySnapshotValue(value: unknown): string {
  const raw = compactText(value);
  if (!raw) return "";
  const key = raw.toLowerCase();
  if (key === "direct_print") return "Direct print";
  if (key === "roll_stock") return "Roll-to-roll print";
  if (key === "cut_vinyl") return "Cut vinyl";
  if (key === "no_print") return "No print";
  if (key === "both") return "CMYK + White";
  if (key === "cmyk") return "CMYK";
  if (key === "white") return "White ink";
  if (key === "mono") return "Mono";
  if (key === "single") return "Single sided";
  if (key === "double") return "Double sided";
  if (key === "pickup") return "Pickup";
  if (key === "delivery") return "Delivery";
  if (key === "install") return "Install";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function optionSummaryValues(line: QuoteLineRecord | null | undefined, labels: RegExp): string[] {
  return String(line?.optionSummary ?? "")
    .split(/\s+[·•]\s+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const colon = part.indexOf(":");
      if (colon <= 0) return [];
      const label = part.slice(0, colon).trim();
      return labels.test(label) ? [part.slice(colon + 1).trim()] : [];
    })
    .filter(Boolean);
}

function uniqueText(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  return values.map(compactText).filter(Boolean).filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pdfEscape(value: unknown): string {
  return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textOp(text: string, x: number, y: number, size = 10, bold = false, grey = 0): string {
  const g = Math.max(0, Math.min(1, grey));
  return `${g.toFixed(3)} g BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(text)}) Tj ET\n`;
}

function rgbTextOp(text: string, x: number, y: number, size: number, bold: boolean, r: number, g: number, b: number): string {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${pdfEscape(text)}) Tj ET\n`;
}

function rgbLineOp(x1: number, y1: number, x2: number, y2: number, width: number, r: number, g: number, b: number): string {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${width.toFixed(2)} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`;
}

function centeredTextX(text: string, pageWidth: number, size: number, bold = false): number {
  // Good visual centring for Helvetica/Helvetica-Bold without bringing a font-metrics dependency into the PDF builder.
  const averageWidth = size * (bold ? 0.555 : 0.505);
  return Math.max(24, (pageWidth - safeText(text).length * averageWidth) / 2);
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

  // The PDF must mirror the online approval panel. Prefer the saved revision snapshot,
  // then fill any missing fields from the current quote line and the page summaries.
  // This is intentionally defensive because older approval revisions may pre-date some
  // of the structured specification fields even though the online page can still resolve
  // them from the linked quote line.
  const saved = specificationForRevision(page.payloadJson, revision);
  const fresh = line ? buildArtworkSpecificationSnapshot(line) : null;
  const merged = new Map<string, ArtworkSpecificationItem>();

  for (const snapshot of [saved, fresh]) {
    for (const item of snapshot?.items ?? []) {
      const value = compactText(item.value);
      if (!value || merged.has(item.key)) continue;
      merged.set(item.key, { ...item, value });
    }
  }

  const snapshot = recordValue(line?.configurationSnapshot);
  const materials = recordValue(snapshot?.materialSnapshots);
  const main = recordValue(materials?.main);
  const media = recordValue(materials?.media);
  const laminate = recordValue(materials?.laminate ?? materials?.smallCoating);
  const backing = recordValue(materials?.backing);
  const standoff = recordValue(materials?.standoff);

  const addMissing = (item: ArtworkSpecificationItem | null) => {
    if (!item || merged.has(item.key) || !compactText(item.value)) return;
    merged.set(item.key, { ...item, value: compactText(item.value) });
  };

  const printBits = uniqueText([
    friendlySnapshotValue(snapshot?.printMethod),
    materialDisplayName(media),
    friendlySnapshotValue(snapshot?.ink ?? snapshot?.smallPrintColour),
    friendlySnapshotValue(snapshot?.sides ?? snapshot?.smallSides),
    compactText(snapshot?.printDirection).toLowerCase() === "reverse" ? "Reverse print" : "",
    ...optionSummaryValues(line, /^(?:print|print method|print type|ink|colour|color|sides)$/i),
    page.colourSummary,
  ]).filter((value) => !/^no print$/i.test(value));
  addMissing(printBits.length ? { key: "print", label: "Imaging / print", value: printBits.join(" · "), icon: "print" } : null);

  addMissing(materialDisplayName(backing) ? { key: "backing", label: "Backing", value: materialDisplayName(backing), icon: "backing" } : null);

  const laminateValue = materialDisplayName(laminate)
    || optionSummaryValues(line, /^(?:laminate|lamination|coating)$/i)[0]
    || String(page.installSummary ?? "").split(/\n+/).map((part) => part.trim()).find((part) => /\b(laminate|lamination|coating)\b/i.test(part))
    || "";
  addMissing(laminateValue ? { key: "laminate", label: "Laminate / finish", value: laminateValue, icon: "laminate" } : null);

  const finishingLabels: Record<string, string> = {
    jingwei: "Jingwei cutting",
    eyelets: "Eyelets",
    vinyl_cutting: "Vinyl cutting",
    print_vinyl_application: "Print / vinyl application",
    tape_hem_banner: "Tape / hem banner",
  };
  const finishings = Array.isArray(snapshot?.finishings) ? snapshot!.finishings as unknown[] : [];
  const cutBits = uniqueText([
    ...finishings.map((value) => finishingLabels[compactText(value)] ?? friendlySnapshotValue(value)).filter((value) => value && !/^eyelets$/i.test(value)),
    ...optionSummaryValues(line, /^(?:finishing|finishings|cut|shape|corners?|corner finish|holes drilled|hole location)$/i),
    ...String(page.installSummary ?? "").split(/\n+/).filter((part) => part.trim() && !/\b(laminate|lamination|coating)\b/i.test(part)),
  ]);
  addMissing(cutBits.length ? { key: "cut", label: "Cut / shape", value: cutBits.join(" · "), icon: "cut" } : null);

  const mountingBits: string[] = [];
  const standoffName = materialDisplayName(standoff);
  const standoffQty = compactText(snapshot?.standoffQtyPerItem);
  if (standoffName && Number(standoffQty) > 0) mountingBits.push(`${standoffName} × ${standoffQty}`);
  mountingBits.push(...optionSummaryValues(line, /^(?:mounting|standoffs?|fixing method)$/i));
  if (mountingBits.length) addMissing({ key: "mounting", label: "Mounting", value: uniqueText(mountingBits).join(" · "), icon: "mounting" });

  const service = friendlySnapshotValue(snapshot?.serviceType) || optionSummaryValues(line, /^(?:dispatch|pickup \/ delivery \/ install|service)$/i)[0] || "";
  if (service) {
    const serviceKey = service.toLowerCase();
    const icon: ArtworkSpecificationItem["icon"] = serviceKey.includes("delivery") ? "delivery" : serviceKey.includes("install") ? "install" : "pickup";
    addMissing({ key: "dispatch", label: "Pickup / delivery / install", value: service, icon });
  }

  const width = Number(snapshot?.widthMm ?? 0);
  const height = Number(snapshot?.heightMm ?? 0);
  const size = compactText(page.sizeSummary) || (width > 0 && height > 0 ? `${width} × ${height}mm` : optionSummaryValues(line, /^(?:finished\s*)?size$/i)[0] || "");
  addMissing(size ? { key: "size", label: "Finished size", value: size, icon: "size" } : null);
  addMissing({ key: "quantity", label: "Quantity", value: compactText(page.quantity || line?.quantity || "1") || "1", icon: "quantity" });

  // PMS data is revision-specific when present. Fall back to the current PMS field for
  // legacy revisions so the email/PDF does not silently lose colour approvals.
  const pms = pmsColoursForRevision(page.payloadJson, revision, true);
  const baseSnapshot = {
    version: 1 as const,
    capturedAt: new Date().toISOString(),
    sourceQuoteLineId: line?.id ?? page.sourceQuoteLineId ?? null,
    sourceLineUpdatedAt: line?.updatedAt ?? null,
    items: [...merged.values()],
  };
  const withPms = applyPmsColoursToArtworkSpecification(baseSnapshot, pms);
  if (withPms?.items.length) return withPms.items.filter((item) => compactText(item.value));

  const fallback: ArtworkSpecificationItem[] = [];
  if (safeText(page.substrateSummary)) fallback.push({ key: "substrate", label: "Substrate", value: safeText(page.substrateSummary), icon: "substrate" });
  if (safeText(page.colourSummary)) fallback.push({ key: "print", label: "Imaging / print", value: safeText(page.colourSummary), icon: "print" });
  if (safeText(page.installSummary)) fallback.push({ key: "cut", label: "Cut / shape", value: safeText(page.installSummary), icon: "cut" });
  if (safeText(page.sizeSummary)) fallback.push({ key: "size", label: "Finished size", value: safeText(page.sizeSummary), icon: "size" });
  fallback.push({ key: "quantity", label: "Quantity", value: safeText(page.quantity || "1") || "1", icon: "quantity" });
  return fallback;
}

function specIconOp(icon: ArtworkSpecificationItem["icon"], x: number, y: number): string {
  // Match the same icon language used by ArtworkSpecificationPanel.tsx.
  // Source artwork is a 48x48 SVG; these helpers map that geometry into the PDF panel.
  const scale = 0.47;
  const ox = x - 1;
  const oy = y - 2;
  const px = (value: number) => ox + value * scale;
  const py = (value: number) => oy + (48 - value) * scale;
  const stroke = "0.063 0.094 0.153 RG 1.05 w 1 J 1 j ";
  const path = (points: Array<[number, number]>, close = false) => {
    if (!points.length) return "";
    let op = `${stroke}${px(points[0]![0]).toFixed(2)} ${py(points[0]![1]).toFixed(2)} m `;
    for (const [xx, yy] of points.slice(1)) op += `${px(xx).toFixed(2)} ${py(yy).toFixed(2)} l `;
    if (close) op += "h ";
    return `${op}S\n`;
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => path([[x1, y1], [x2, y2]]);
  const rect = (rx: number, ry: number, rw: number, rh: number) => `${stroke}${px(rx).toFixed(2)} ${py(ry + rh).toFixed(2)} ${(rw * scale).toFixed(2)} ${(rh * scale).toFixed(2)} re S\n`;
  const circle = (cx: number, cy: number, r: number) => circleStrokeOp(px(cx), py(cy), r * scale, 1.05, 0.09);

  if (icon === "substrate") return path([[7,18],[24,9],[41,18],[24,27]], true) + path([[10,24],[24,31],[38,24]]) + path([[10,30],[24,37],[38,30]]);
  if (icon === "colour") return circle(16,17,7) + circle(30,17,7) + circle(23,30,7) + line(10,40,37,40);
  if (icon === "print") return path([[8,15],[40,15],[42,20],[42,32],[6,32],[6,20],[8,15]], true)
    + line(13,20,35,20) + line(15,24,33,24) + path([[16,25],[16,38],[32,38],[32,25]])
    + line(10,32,10,39) + line(38,32,38,39) + rect(7,13,9,2) + rect(35,18,4,4) + circle(39,26,1);
  if (icon === "laminate") return circle(13,15,6) + path([[19,15],[36,15],[41,20],[41,23]]) + rect(8,26,29,12) + line(13,21,13,26);
  if (icon === "backing") return rect(8,12,27,20) + line(14,36,40,16) + path([[35,12],[40,12],[40,17]]) + path([[8,32],[8,37],[13,37]]);
  if (icon === "cut") return `${stroke}[2.2 2.2] 0 d ${px(8).toFixed(2)} ${py(31).toFixed(2)} m ${px(16).toFixed(2)} ${py(20).toFixed(2)} ${px(22).toFixed(2)} ${py(16).toFixed(2)} ${px(29).toFixed(2)} ${py(16).toFixed(2)} c ${px(34).toFixed(2)} ${py(16).toFixed(2)} ${px(38).toFixed(2)} ${py(18).toFixed(2)} ${px(40).toFixed(2)} ${py(21).toFixed(2)} c S [] 0 d\n`
    + line(30,10,18,37) + path([[25,11],[35,11],[30,19]], true);
  if (icon === "mounting") return line(6,24,18,24) + line(30,24,42,24) + circle(24,24,6)
    + line(18,20,12,15) + line(18,28,12,33) + line(30,20,36,15) + line(30,28,36,33);
  if (icon === "pickup") return rect(9,14,21,18) + path([[9,20],[19,26],[30,20]]) + line(35,12,35,35) + path([[30,30],[35,35],[40,30]]);
  if (icon === "delivery") return rect(5,14,23,19) + path([[28,20],[36,20],[43,27],[43,33],[28,33]])
    + circle(14,35,4) + circle(36,35,4) + line(31,24,38,24);
  if (icon === "install") return line(11,37,36,12) + line(30,9,39,18) + line(8,31,17,40)
    + path([[13,16],[24,16],[24,27]]) + line(9,20,13,20) + line(20,9,20,13);
  if (icon === "size") return rect(9,13,30,22) + line(9,7,9,11) + line(39,7,39,11) + line(13,8,35,8)
    + path([[16,5],[13,8],[16,11]]) + path([[32,5],[35,8],[32,11]])
    + line(43,15,40,15) + line(43,33,40,33) + line(42,18,42,30)
    + path([[39,21],[42,18],[45,21]]) + path([[39,27],[42,30],[45,27]]);
  if (icon === "quantity") return rect(10,12,24,18) + rect(15,17,24,18) + rect(20,22,18,14);
  return rect(9,10,30,28) + line(15,18,33,18) + line(15,24,33,24) + line(15,30,27,30);
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
        detail.forEach((line, detailIndex) => { content += textOp(line, x + iconW + 7, bottom + 6 + (detail.length - 1 - detailIndex) * 6.5, 5.1, false, 0.42); });
      }
    } else {
      const value = wrappedTextOps(item.value, x + iconW + 7, top - 23, 28, { size: 6.8, bold: true, grey: 0.07, leading: 8.2, maxLines: 3 });
      content += value.content;
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

function watermarkTextForPdf(brandName: string, quoteNumber: string): string[] {
  const brand = compactText(brandName || "Tender Edge").toUpperCase();
  const quote = compactText(quoteNumber);
  return quote ? ["PROOF ONLY", brand, quote] : ["PROOF ONLY", brand];
}

function drawWatermarkPhrase(parts: string[], tx: number, ty: number, angleDegrees: number, fontSize: number, grey = 0.855): string {
  const radians = angleDegrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let op = `q ${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${tx.toFixed(1)} ${ty.toFixed(1)} cm\n`;
  let cursor = 0;
  const gap = fontSize * 1.55;
  for (const [index, part] of parts.entries()) {
    const label = safeText(part).slice(0, 48);
    op += `${grey.toFixed(3)} g BT /F2 ${fontSize.toFixed(1)} Tf 1 0 0 1 ${cursor.toFixed(1)} 0 Tm (${pdfEscape(label)}) Tj ET\n`;
    cursor += Math.max(fontSize * 2.2, label.length * fontSize * 0.57);
    if (index < parts.length - 1) {
      const dotX = cursor + gap * 0.35;
      const radius = Math.max(1.3, fontSize * 0.075);
      const k = radius * 0.5522847498;
      op += `${grey.toFixed(3)} G ${grey.toFixed(3)} g 0.3 w ${dotX.toFixed(1)} ${(-radius).toFixed(1)} m ${(dotX+k).toFixed(1)} ${(-radius).toFixed(1)} ${(dotX+radius).toFixed(1)} ${(-k).toFixed(1)} ${(dotX+radius).toFixed(1)} 0 c ${(dotX+radius).toFixed(1)} ${k.toFixed(1)} ${(dotX+k).toFixed(1)} ${radius.toFixed(1)} ${dotX.toFixed(1)} ${radius.toFixed(1)} c ${(dotX-k).toFixed(1)} ${radius.toFixed(1)} ${(dotX-radius).toFixed(1)} ${k.toFixed(1)} ${(dotX-radius).toFixed(1)} 0 c ${(dotX-radius).toFixed(1)} ${(-k).toFixed(1)} ${(dotX-k).toFixed(1)} ${(-radius).toFixed(1)} ${dotX.toFixed(1)} ${(-radius).toFixed(1)} c f\n`;
      cursor += gap;
    }
  }
  return `${op}Q\n`;
}

function drawWatermarkOps(parts: string[], x: number, y: number, width: number, height: number): string {
  // Mirror the public approval preview: repeated, light navy watermark at roughly -28deg
  // in browser coordinates (equivalent to +28deg in PDF coordinates).
  const fontSize = Math.min(22, Math.max(15, width / 28));
  const phraseWidth = parts.join("   ").length * fontSize * 0.57;
  const starts = [
    [x + width * 0.04, y + height * 0.25],
    [x + width * 0.10, y + height * 0.67],
  ] as const;
  return starts.map(([sx, sy]) => drawWatermarkPhrase(parts, sx - phraseWidth * 0.12, sy, 28, fontSize)).join("");
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
  watermarkBrand: string;
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
    if (input.page.clientResponseStatus !== "approved") content += drawWatermarkOps(watermarkTextForPdf(input.watermarkBrand, input.quoteNumber), drawX, drawY, drawW, drawH);
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
  watermarkBrand?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  projectName: string;
  clientName: string;
  contactName: string;
  quoteNumber: string;
  revision: string;
  pageLabels: string[];
  logoImage: EmbeddedImage | null;
}): string {
  const [pageW, pageH] = A4_LANDSCAPE;
  const blue: [number, number, number] = [0.075, 0.62, 0.84];
  const navy: [number, number, number] = [0.055, 0.10, 0.17];
  const muted: [number, number, number] = [0.34, 0.38, 0.45];
  const paleBlue: [number, number, number] = [0.955, 0.978, 0.998];
  let content = "";
  content += rectFillOp(0, 0, pageW, pageH, 1, 1, 1);

  // Large stacked/main company logo: this is intentionally the focal point.
  if (input.logoImage) {
    const maxW = 335;
    const maxH = 135;
    const scale = Math.min(maxW / input.logoImage.width, maxH / input.logoImage.height);
    const logoW = input.logoImage.width * scale;
    const logoH = input.logoImage.height * scale;
    content += `q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${((pageW - logoW) / 2).toFixed(2)} ${(pageH - 190).toFixed(2)} cm /Logo Do Q\n`;
  } else {
    const company = safeText(input.companyName);
    content += rgbTextOp(company, centeredTextX(company, pageW, 31, true), pageH - 145, 31, true, ...navy);
  }

  // Deliberately centred title treatment from the approved cover concept.
  content += rgbLineOp(pageW / 2 - 164, 363, pageW / 2 - 124, 363, 1.5, ...blue);
  content += rgbLineOp(pageW / 2 + 124, 363, pageW / 2 + 164, 363, 1.5, ...blue);
  const approvalTitle = "ARTWORK APPROVAL";
  content += textOp(approvalTitle, centeredTextX(approvalTitle, pageW, 12, false), 357, 12, false, 0.28);
  const packTitle = "PROOF PACK";
  content += textOp(packTitle, centeredTextX(packTitle, pageW, 31, true), 314, 31, true, 0.10);
  content += rgbLineOp(pageW / 2 - 34, 294, pageW / 2 + 34, 294, 1.3, ...blue);

  const project = safeText(input.projectName || "Artwork Approval");
  content += rgbTextOp(project, centeredTextX(project, pageW, 18, true), 258, 18, true, ...blue);

  // Three-column metadata row, with the issue date deliberately centred below it.
  const leftX = 180;
  const middleX = 405;
  const rightX = 625;
  content += rgbTextOp("CLIENT / CONTACT", leftX, 222, 6.8, true, ...blue);
  const client = safeText(input.clientName || input.companyName);
  const contact = safeText(input.contactName || "");
  content += textOp(client, leftX, 204, 8.7, true, 0.13);
  if (contact) content += textOp(contact, leftX, 189, 8.7, false, 0.13);

  content += rgbLineOp(365, 184, 365, 226, 0.6, 0.86, 0.89, 0.93);
  content += rgbTextOp("QUOTE NUMBER", middleX, 222, 6.8, true, ...blue);
  content += textOp(safeText(input.quoteNumber || "-"), middleX, 199, 9.6, true, 0.10);

  content += rgbLineOp(585, 184, 585, 226, 0.6, 0.86, 0.89, 0.93);
  content += rgbTextOp("REVISION", rightX, 222, 6.8, true, ...blue);
  content += textOp(`Revision ${safeText(input.revision || "A")}`, rightX, 199, 9.6, true, 0.10);

  const issuedLabel = "ISSUED";
  const issued = dateAu();
  content += rgbTextOp(issuedLabel, centeredTextX(issuedLabel, pageW, 6.8, true), 163, 6.8, true, ...blue);
  content += textOp(issued, centeredTextX(issued, pageW, 9.8, true), 145, 9.8, true, 0.10);

  // Client-review message box: centred and visually anchored, but intentionally light.
  const reviewX = 144;
  const reviewY = 59;
  const reviewW = pageW - reviewX * 2;
  const reviewH = 66;
  content += rectFillOp(reviewX, reviewY, reviewW, reviewH, ...paleBlue);
  content += rectStrokeOp(reviewX, reviewY, reviewW, reviewH, 0.55, 0.86);
  content += rgbTextOp("CLIENT REVIEW", reviewX + 72, reviewY + 45, 8.4, true, ...blue);
  const review = "Each following page is a PDF version of the Artwork Approval sheet, including the proof, PMS colour references and sign specification. If your organisation blocks the online link, review this PDF and reply to the email with APPROVED or the changes required.";
  wrapText(review, 104).slice(0, 3).forEach((line, index) => {
    content += textOp(line, reviewX + 72, reviewY + 29 - index * 10.5, 7.5, false, 0.27);
  });
  // Simple info marker - no bitmap/icon dependency.
  content += circleStrokeOp(reviewX + 38, reviewY + 33, 18, 1.3, 0.30);
  content += rgbTextOp("i", reviewX + 36, reviewY + 25, 14, true, ...blue);

  // Contact footer replaces the proof thumbnails from the earlier concept.
  const footerItems = [input.companyAddress, input.companyPhone, input.companyEmail, input.companyWebsite]
    .map((value) => safeText(value))
    .filter(Boolean);
  if (footerItems.length) {
    content += lineOp(60, 31, pageW - 60, 31, 0.55, 0.88);
    const footerText = footerItems.join("   |   ");
    content += textOp(footerText, centeredTextX(footerText, pageW, 7.2, false), 16, 7.2, false, 0.36);
  }

  return content;
}

export async function buildArtworkProofPdf(input: {
  approval: ArtworkApprovalRecord;
  pages: ArtworkApprovalPageRecord[];
  sourceQuote: QuoteDraftRecord | null;
  sourceLines?: QuoteLineRecord[];
  companyName: string;
  watermarkBrand?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
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
    companyAddress: input.companyAddress,
    companyPhone: input.companyPhone,
    companyEmail: input.companyEmail,
    companyWebsite: input.companyWebsite,
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
      watermarkBrand: compactText(input.watermarkBrand) || input.companyName,
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
