export type CorrespondencePreviewFields = {
  previewKind: string;
  emailSubject: string;
  emailFrom: string;
  emailTo: string;
  emailDate: string;
  bodyPreview: string;
};

const EMPTY_PREVIEW: CorrespondencePreviewFields = {
  previewKind: "",
  emailSubject: "",
  emailFrom: "",
  emailTo: "",
  emailDate: "",
  bodyPreview: ""
};

const MAX_EMAIL_PREVIEW_READ_BYTES = 2 * 1024 * 1024;
const MAX_BODY_PREVIEW_CHARS = 3200;

const CFB_FREE_SECTOR = 0xffffffff;
const CFB_END_OF_CHAIN = 0xfffffffe;
const CFB_FAT_SECTOR = 0xfffffffd;
const CFB_DIFAT_SECTOR = 0xfffffffc;
const CFB_NO_STREAM = 0xffffffff;

const MSG_PROP_SUBJECT = "0037";
const MSG_PROP_TRANSPORT_HEADERS = "007d";
const MSG_PROP_SENDER_NAME = "0c1a";
const MSG_PROP_SENDER_EMAIL = "0c1f";
const MSG_PROP_SENDER_SMTP = "5d01";
const MSG_PROP_DISPLAY_TO = "0e04";
const MSG_PROP_BODY = "1000";
const MSG_PROP_HTML = "1013";

const MSG_PROP_CLIENT_SUBMIT_TIME = 0x0039;
const MSG_PROP_DELIVERY_TIME = 0x0e06;
const MSG_PROP_CREATION_TIME = 0x3007;

const MSG_RECIPIENT_DISPLAY_NAME = "3001";
const MSG_RECIPIENT_EMAIL = "3003";
const MSG_RECIPIENT_SMTP = "39fe";

type ParsedHeaders = Record<string, string>;

type ParsedEmail = {
  subject: string;
  from: string;
  to: string;
  date: string;
  bodyPreview: string;
};

type CompoundDirectoryEntry = {
  id: number;
  name: string;
  type: number;
  leftSiblingId: number;
  rightSiblingId: number;
  childId: number;
  startSector: number;
  streamSize: number;
};

function isOutlookMsgFile(fileName: string, mimeType?: string | null): boolean {
  const lowerName = fileName.toLowerCase();
  const lowerType = String(mimeType ?? "").toLowerCase();
  return lowerName.endsWith(".msg") || lowerType.includes("vnd.ms-outlook") || lowerType.includes("x-msg");
}

function isEmlFile(fileName: string, mimeType?: string | null): boolean {
  const lowerName = fileName.toLowerCase();
  const lowerType = String(mimeType ?? "").toLowerCase();
  return lowerName.endsWith(".eml") || lowerType.includes("message/rfc822");
}

function isEmailLikeFile(fileName: string, mimeType?: string | null): boolean {
  return isEmlFile(fileName, mimeType) || isOutlookMsgFile(fileName, mimeType);
}

function isTextLikeFile(fileName: string, mimeType?: string | null): boolean {
  const lowerName = fileName.toLowerCase();
  const lowerType = String(mimeType ?? "").toLowerCase();
  return lowerName.endsWith(".txt") || lowerType.startsWith("text/plain");
}

function splitHeadersAndBody(raw: string): { headers: ParsedHeaders; body: string } {
  const normalised = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const splitIndex = normalised.search(/\n\s*\n/);
  const headerBlock = splitIndex >= 0 ? normalised.slice(0, splitIndex) : "";
  const body = splitIndex >= 0 ? normalised.slice(splitIndex).replace(/^\n\s*\n?/, "") : normalised;
  const unfolded = headerBlock.replace(/\n[\t ]+/g, " ");
  const headers: ParsedHeaders = {};

  for (const line of unfolded.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) continue;
    headers[key] = headers[key] ? `${headers[key]} ${value}` : value;
  }

  return { headers, body };
}

function decodeBase64ToText(value: string): string {
  try {
    const cleaned = value.replace(/\s+/g, "");
    if (!cleaned) return "";
    if (typeof atob === "function") {
      const binary = atob(cleaned);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
  } catch {
    return value;
  }
  return value;
}

function decodeQuotedPrintable(value: string): string {
  try {
    const withoutSoftBreaks = value.replace(/=\r?\n/g, "");
    const bytes: number[] = [];
    for (let index = 0; index < withoutSoftBreaks.length; index += 1) {
      const character = withoutSoftBreaks[index];
      if (character === "=" && /^[0-9A-Fa-f]{2}$/.test(withoutSoftBreaks.slice(index + 1, index + 3))) {
        bytes.push(parseInt(withoutSoftBreaks.slice(index + 1, index + 3), 16));
        index += 2;
      } else {
        bytes.push(character.charCodeAt(0));
      }
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(bytes));
  } catch {
    return value;
  }
}

function decodeMimeWord(match: string, charset: string, encoding: string, encodedText: string): string {
  const normalisedEncoding = encoding.toUpperCase();
  try {
    if (normalisedEncoding === "B") {
      return decodeBase64ToText(encodedText);
    }
    if (normalisedEncoding === "Q") {
      return decodeQuotedPrintable(encodedText.replace(/_/g, " "));
    }
  } catch {
    return match;
  }
  void charset;
  return match;
}

function decodeMimeWords(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, decodeMimeWord)
    .replace(/\s+/g, " ")
    .trim();
}

function contentTypeHeaderValue(headers: ParsedHeaders): string {
  return headers["content-type"] ?? "";
}

function transferEncodingHeaderValue(headers: ParsedHeaders): string {
  return (headers["content-transfer-encoding"] ?? "").toLowerCase();
}

function boundaryFromContentType(contentType: string): string | null {
  const quoted = contentType.match(/boundary="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = contentType.match(/boundary=([^;\s]+)/i);
  return plain?.[1]?.trim() || null;
}

function decodeBodyByEncoding(body: string, encoding: string): string {
  if (encoding.includes("base64")) return decodeBase64ToText(body);
  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(body);
  return body;
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCodePoint(value) : "";
    });
}

function cleanPreviewText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
    .slice(0, MAX_BODY_PREVIEW_CHARS);
}

function multipartParts(body: string, boundary: string): Array<{ headers: ParsedHeaders; body: string }> {
  const marker = `--${boundary}`;
  const sections = body.split(marker);
  const parts: Array<{ headers: ParsedHeaders; body: string }> = [];

  for (const section of sections) {
    const trimmed = section.replace(/^\s+|\s+$/g, "");
    if (!trimmed || trimmed === "--" || trimmed.startsWith("--")) continue;
    parts.push(splitHeadersAndBody(trimmed));
  }

  return parts;
}

function bodyPreviewFromPart(headers: ParsedHeaders, body: string): { plain: string; html: string } {
  const contentType = contentTypeHeaderValue(headers).toLowerCase();
  const encoding = transferEncodingHeaderValue(headers);
  const decoded = decodeBodyByEncoding(body, encoding);

  if (contentType.includes("multipart/")) {
    const boundary = boundaryFromContentType(contentType);
    if (!boundary) return { plain: "", html: "" };
    const nestedParts = multipartParts(decoded, boundary).map((part) => bodyPreviewFromPart(part.headers, part.body));
    return {
      plain: nestedParts.map((part) => part.plain).find(Boolean) ?? "",
      html: nestedParts.map((part) => part.html).find(Boolean) ?? ""
    };
  }

  if (contentType.includes("text/html")) return { plain: "", html: stripHtml(decoded) };
  if (contentType.includes("text/plain") || !contentType) return { plain: decoded, html: "" };
  return { plain: "", html: "" };
}

function extractEmailBodyPreview(headers: ParsedHeaders, body: string): string {
  const contentType = contentTypeHeaderValue(headers).toLowerCase();
  const encoding = transferEncodingHeaderValue(headers);

  if (contentType.includes("multipart/")) {
    const boundary = boundaryFromContentType(contentType);
    if (!boundary) return "";
    const decodedBody = decodeBodyByEncoding(body, encoding);
    const previews = multipartParts(decodedBody, boundary).map((part) => bodyPreviewFromPart(part.headers, part.body));
    const plain = previews.map((preview) => preview.plain).find(Boolean) ?? "";
    const html = previews.map((preview) => preview.html).find(Boolean) ?? "";
    return cleanPreviewText(plain || html);
  }

  const decodedBody = decodeBodyByEncoding(body, encoding);
  if (contentType.includes("text/html")) return cleanPreviewText(stripHtml(decodedBody));
  return cleanPreviewText(decodedBody);
}

export function parseEmailPreview(raw: string): ParsedEmail | null {
  const { headers, body } = splitHeadersAndBody(raw);
  const subject = decodeMimeWords(headers.subject);
  const from = decodeMimeWords(headers.from);
  const to = decodeMimeWords(headers.to);
  const date = decodeMimeWords(headers.date);
  const bodyPreview = extractEmailBodyPreview(headers, body);

  if (!subject && !from && !to && !date && !bodyPreview) return null;

  return {
    subject,
    from,
    to,
    date,
    bodyPreview
  };
}

function readUnsigned64AsNumber(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 0x100000000 + low;
}

function decodeUtf16Le(bytes: Uint8Array): string {
  const evenLength = bytes.byteLength - (bytes.byteLength % 2);
  if (evenLength <= 0) return "";
  return new TextDecoder("utf-16le", { fatal: false }).decode(bytes.subarray(0, evenLength)).replace(/\u0000+$/g, "").trim();
}

function decodeAnsi(bytes: Uint8Array): string {
  const trimmed = bytes.byteLength > 0 && bytes[bytes.byteLength - 1] === 0 ? bytes.subarray(0, bytes.byteLength - 1) : bytes;
  try {
    return new TextDecoder("windows-1252", { fatal: false }).decode(trimmed).replace(/\u0000+$/g, "").trim();
  } catch {
    return Array.from(trimmed, (value) => String.fromCharCode(value)).join("").replace(/\u0000+$/g, "").trim();
  }
}

function decodeHtmlBytes(bytes: Uint8Array): string {
  if (!bytes.byteLength) return "";
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return decodeUtf16Le(bytes.subarray(2));

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000+$/g, "");
  const replacementCount = (utf8.match(/\ufffd/g) ?? []).length;
  if (replacementCount <= Math.max(1, Math.floor(utf8.length * 0.005))) return utf8;
  return decodeAnsi(bytes);
}

function safeStreamId(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 0xfffffffa;
}

class CompoundFileReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly sectorSize: number;
  private readonly miniSectorSize: number;
  private readonly miniStreamCutoff: number;
  private readonly fat: number[];
  private readonly miniFat: number[];
  private readonly entries: CompoundDirectoryEntry[];
  private readonly pathEntries = new Map<string, CompoundDirectoryEntry>();
  private readonly rootEntry: CompoundDirectoryEntry;
  private readonly rootMiniStream: Uint8Array;

  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);

    if (this.bytes.byteLength < 512) throw new Error("MSG file is too small");
    const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    if (!signature.every((value, index) => this.bytes[index] === value)) throw new Error("Not an Outlook MSG compound file");

    const byteOrder = this.view.getUint16(0x1c, true);
    if (byteOrder !== 0xfffe) throw new Error("Unsupported MSG byte order");

    const sectorShift = this.view.getUint16(0x1e, true);
    const miniSectorShift = this.view.getUint16(0x20, true);
    this.sectorSize = 2 ** sectorShift;
    this.miniSectorSize = 2 ** miniSectorShift;
    this.miniStreamCutoff = this.view.getUint32(0x38, true);

    if (![512, 4096].includes(this.sectorSize) || this.miniSectorSize !== 64) throw new Error("Unsupported MSG compound-file sector size");

    const fatSectorIds = this.readFatSectorIds();
    this.fat = this.readFat(fatSectorIds);

    const firstDirectorySector = this.view.getUint32(0x30, true);
    const directoryBytes = this.readNormalChain(firstDirectorySector);
    this.entries = this.parseDirectory(directoryBytes);
    const root = this.entries.find((entry) => entry.type === 5);
    if (!root) throw new Error("MSG root storage was not found");
    this.rootEntry = root;

    this.indexDirectoryTree();
    this.miniFat = this.readMiniFat();
    this.rootMiniStream = root.streamSize > 0 && safeStreamId(root.startSector)
      ? this.readNormalChain(root.startSector, root.streamSize)
      : new Uint8Array();
  }

  getRootStream(name: string): Uint8Array | null {
    const entry = this.pathEntries.get(name.toLowerCase());
    if (!entry || entry.type !== 2) return null;
    return this.readStream(entry);
  }

  getStorageStream(storageName: string, streamName: string): Uint8Array | null {
    const entry = this.pathEntries.get(`${storageName}/${streamName}`.toLowerCase());
    if (!entry || entry.type !== 2) return null;
    return this.readStream(entry);
  }

  storageNamesStartingWith(prefix: string): string[] {
    const normalisedPrefix = prefix.toLowerCase();
    const names = new Set<string>();
    for (const key of this.pathEntries.keys()) {
      const firstSegment = key.split("/")[0];
      if (firstSegment.startsWith(normalisedPrefix)) names.add(firstSegment);
    }
    return Array.from(names).sort();
  }

  private readSector(sectorId: number): Uint8Array {
    if (!safeStreamId(sectorId)) return new Uint8Array();
    const offset = (sectorId + 1) * this.sectorSize;
    if (offset < 0 || offset >= this.bytes.byteLength) return new Uint8Array();
    return this.bytes.subarray(offset, Math.min(offset + this.sectorSize, this.bytes.byteLength));
  }

  private readFatSectorIds(): number[] {
    const numberOfFatSectors = this.view.getUint32(0x2c, true);
    const ids: number[] = [];

    for (let index = 0; index < 109 && ids.length < numberOfFatSectors; index += 1) {
      const sectorId = this.view.getUint32(0x4c + index * 4, true);
      if (safeStreamId(sectorId)) ids.push(sectorId);
    }

    let difatSector = this.view.getUint32(0x44, true);
    const numberOfDifatSectors = this.view.getUint32(0x48, true);
    const entriesPerDifatSector = this.sectorSize / 4 - 1;
    const visited = new Set<number>();

    for (let sectorIndex = 0; sectorIndex < numberOfDifatSectors && ids.length < numberOfFatSectors; sectorIndex += 1) {
      if (!safeStreamId(difatSector) || visited.has(difatSector)) break;
      visited.add(difatSector);
      const sector = this.readSector(difatSector);
      if (sector.byteLength < this.sectorSize) break;
      const sectorView = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
      for (let index = 0; index < entriesPerDifatSector && ids.length < numberOfFatSectors; index += 1) {
        const fatSectorId = sectorView.getUint32(index * 4, true);
        if (safeStreamId(fatSectorId)) ids.push(fatSectorId);
      }
      difatSector = sectorView.getUint32(entriesPerDifatSector * 4, true);
    }

    return ids.slice(0, numberOfFatSectors);
  }

  private readFat(fatSectorIds: number[]): number[] {
    const fat: number[] = [];
    for (const sectorId of fatSectorIds) {
      const sector = this.readSector(sectorId);
      if (sector.byteLength < 4) continue;
      const sectorView = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
      for (let offset = 0; offset + 4 <= sector.byteLength; offset += 4) fat.push(sectorView.getUint32(offset, true));
    }
    return fat;
  }

  private readNormalChain(startSector: number, requestedSize?: number): Uint8Array {
    if (!safeStreamId(startSector)) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    let sectorId = startSector;
    const visited = new Set<number>();
    const maximumSectors = Math.max(1, Math.ceil(this.bytes.byteLength / Math.max(this.sectorSize, 1)) + 2);

    while (safeStreamId(sectorId) && !visited.has(sectorId) && visited.size < maximumSectors) {
      visited.add(sectorId);
      const sector = this.readSector(sectorId);
      if (!sector.byteLength) break;
      chunks.push(sector);
      totalLength += sector.byteLength;
      if (requestedSize != null && totalLength >= requestedSize) break;
      const nextSector = this.fat[sectorId];
      if (nextSector === CFB_END_OF_CHAIN || nextSector === CFB_FREE_SECTOR || nextSector === CFB_FAT_SECTOR || nextSector === CFB_DIFAT_SECTOR || nextSector == null) break;
      sectorId = nextSector;
    }

    const outputLength = requestedSize == null ? totalLength : Math.min(totalLength, Math.max(0, requestedSize));
    const output = new Uint8Array(outputLength);
    let outputOffset = 0;
    for (const chunk of chunks) {
      if (outputOffset >= outputLength) break;
      const copyLength = Math.min(chunk.byteLength, outputLength - outputOffset);
      output.set(chunk.subarray(0, copyLength), outputOffset);
      outputOffset += copyLength;
    }
    return output;
  }

  private readMiniFat(): number[] {
    const firstMiniFatSector = this.view.getUint32(0x3c, true);
    const numberOfMiniFatSectors = this.view.getUint32(0x40, true);
    if (!numberOfMiniFatSectors || !safeStreamId(firstMiniFatSector)) return [];
    const bytes = this.readNormalChain(firstMiniFatSector, numberOfMiniFatSectors * this.sectorSize);
    const miniFat: number[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 4) miniFat.push(view.getUint32(offset, true));
    return miniFat;
  }

  private parseDirectory(bytes: Uint8Array): CompoundDirectoryEntry[] {
    const entries: CompoundDirectoryEntry[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let offset = 0, id = 0; offset + 128 <= bytes.byteLength; offset += 128, id += 1) {
      const nameByteLengthIncludingNull = view.getUint16(offset + 64, true);
      const nameByteLength = Math.max(0, Math.min(64, nameByteLengthIncludingNull >= 2 ? nameByteLengthIncludingNull - 2 : 0));
      const name = nameByteLength > 0 ? decodeUtf16Le(bytes.subarray(offset, offset + nameByteLength)) : "";
      const type = view.getUint8(offset + 66);
      if (!name && type === 0) {
        entries.push({ id, name: "", type, leftSiblingId: CFB_NO_STREAM, rightSiblingId: CFB_NO_STREAM, childId: CFB_NO_STREAM, startSector: CFB_END_OF_CHAIN, streamSize: 0 });
        continue;
      }

      entries.push({
        id,
        name,
        type,
        leftSiblingId: view.getUint32(offset + 68, true),
        rightSiblingId: view.getUint32(offset + 72, true),
        childId: view.getUint32(offset + 76, true),
        startSector: view.getUint32(offset + 116, true),
        streamSize: readUnsigned64AsNumber(view, offset + 120)
      });
    }

    return entries;
  }

  private indexDirectoryTree() {
    const visited = new Set<number>();

    const walkSiblingTree = (entryId: number, parentPath: string) => {
      if (entryId === CFB_NO_STREAM || entryId < 0 || entryId >= this.entries.length) return;
      if (visited.has(entryId)) return;
      visited.add(entryId);

      const entry = this.entries[entryId];
      if (!entry) return;
      walkSiblingTree(entry.leftSiblingId, parentPath);

      if (entry.name) {
        const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
        this.pathEntries.set(path.toLowerCase(), entry);
        if ((entry.type === 1 || entry.type === 5) && entry.childId !== CFB_NO_STREAM) walkSiblingTree(entry.childId, path);
      }

      walkSiblingTree(entry.rightSiblingId, parentPath);
    };

    if (this.rootEntry.childId !== CFB_NO_STREAM) walkSiblingTree(this.rootEntry.childId, "");
  }

  private readMiniChain(startMiniSector: number, requestedSize: number): Uint8Array {
    if (!safeStreamId(startMiniSector) || !this.rootMiniStream.byteLength) return new Uint8Array();
    const output = new Uint8Array(Math.max(0, requestedSize));
    let written = 0;
    let miniSectorId = startMiniSector;
    const visited = new Set<number>();
    const maximumSectors = Math.max(1, Math.ceil(this.rootMiniStream.byteLength / this.miniSectorSize) + 2);

    while (safeStreamId(miniSectorId) && !visited.has(miniSectorId) && visited.size < maximumSectors && written < output.byteLength) {
      visited.add(miniSectorId);
      const offset = miniSectorId * this.miniSectorSize;
      if (offset < 0 || offset >= this.rootMiniStream.byteLength) break;
      const chunk = this.rootMiniStream.subarray(offset, Math.min(offset + this.miniSectorSize, this.rootMiniStream.byteLength));
      const copyLength = Math.min(chunk.byteLength, output.byteLength - written);
      output.set(chunk.subarray(0, copyLength), written);
      written += copyLength;
      const nextSector = this.miniFat[miniSectorId];
      if (nextSector === CFB_END_OF_CHAIN || nextSector === CFB_FREE_SECTOR || nextSector == null) break;
      miniSectorId = nextSector;
    }

    return written === output.byteLength ? output : output.subarray(0, written);
  }

  private readStream(entry: CompoundDirectoryEntry): Uint8Array {
    if (entry.streamSize <= 0 || !safeStreamId(entry.startSector)) return new Uint8Array();
    if (entry.type === 2 && entry.streamSize < this.miniStreamCutoff) return this.readMiniChain(entry.startSector, entry.streamSize);
    return this.readNormalChain(entry.startSector, entry.streamSize);
  }
}

function readMsgString(reader: CompoundFileReader, propertyId: string, storageName?: string): string {
  const id = propertyId.toLowerCase().padStart(4, "0");
  const read = (streamName: string) => storageName ? reader.getStorageStream(storageName, streamName) : reader.getRootStream(streamName);
  const unicode = read(`__substg1.0_${id}001f`);
  if (unicode?.byteLength) return decodeUtf16Le(unicode);
  const ansi = read(`__substg1.0_${id}001e`);
  if (ansi?.byteLength) return decodeAnsi(ansi);
  return "";
}

function parseHeadersOnly(rawHeaders: string): ParsedHeaders {
  if (!rawHeaders.trim()) return {};
  const { headers } = splitHeadersAndBody(`${rawHeaders.replace(/\r?\n?$/, "")}\n\n`);
  return headers;
}

function formatAddress(name: string, email: string): string {
  const cleanName = name.trim().replace(/^['"]|['"]$/g, "");
  const cleanEmail = email.trim().replace(/^mailto:/i, "");
  if (!cleanName) return cleanEmail;
  if (!cleanEmail || cleanName.toLowerCase() === cleanEmail.toLowerCase()) return cleanName;
  return `${cleanName} <${cleanEmail}>`;
}

function readRecipientFallback(reader: CompoundFileReader): string {
  const recipients: string[] = [];
  for (const storageName of reader.storageNamesStartingWith("__recip_version1.0_#")) {
    const name = readMsgString(reader, MSG_RECIPIENT_DISPLAY_NAME, storageName);
    const smtp = readMsgString(reader, MSG_RECIPIENT_SMTP, storageName);
    const email = smtp || readMsgString(reader, MSG_RECIPIENT_EMAIL, storageName);
    const formatted = formatAddress(name, email);
    if (formatted && !recipients.some((item) => item.toLowerCase() === formatted.toLowerCase())) recipients.push(formatted);
  }
  return recipients.join("; ");
}

function fileTimeAt(bytes: Uint8Array, offset: number): string {
  if (offset < 0 || offset + 8 > bytes.byteLength) return "";
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  const low = BigInt(view.getUint32(0, true));
  const high = BigInt(view.getUint32(4, true));
  const fileTime = (high << 32n) | low;
  if (fileTime <= 0n) return "";
  const unixEpochOffset = 116444736000000000n;
  const milliseconds = (fileTime - unixEpochOffset) / 10000n;
  const numericMilliseconds = Number(milliseconds);
  if (!Number.isFinite(numericMilliseconds)) return "";
  const date = new Date(numericMilliseconds);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function readFixedMsgDate(reader: CompoundFileReader): string {
  const properties = reader.getRootStream("__properties_version1.0");
  if (!properties?.byteLength) return "";
  const view = new DataView(properties.buffer, properties.byteOffset, properties.byteLength);
  const wantedTags = [MSG_PROP_CLIENT_SUBMIT_TIME, MSG_PROP_DELIVERY_TIME, MSG_PROP_CREATION_TIME].map((id) => (((id << 16) >>> 0) | 0x0040) >>> 0);

  for (const wantedTag of wantedTags) {
    for (let offset = 0; offset + 16 <= properties.byteLength; offset += 8) {
      if (view.getUint32(offset, true) !== wantedTag) continue;
      const parsed = fileTimeAt(properties, offset + 8);
      if (parsed) return parsed;
    }
  }
  return "";
}

export function parseOutlookMsgPreview(buffer: ArrayBuffer): ParsedEmail | null {
  try {
    const reader = new CompoundFileReader(buffer);
    const transportHeadersRaw = readMsgString(reader, MSG_PROP_TRANSPORT_HEADERS);
    const transportHeaders = parseHeadersOnly(transportHeadersRaw);

    const subject = readMsgString(reader, MSG_PROP_SUBJECT) || decodeMimeWords(transportHeaders.subject);
    const senderName = readMsgString(reader, MSG_PROP_SENDER_NAME);
    const senderEmail = readMsgString(reader, MSG_PROP_SENDER_SMTP) || readMsgString(reader, MSG_PROP_SENDER_EMAIL);
    const from = formatAddress(senderName, senderEmail) || decodeMimeWords(transportHeaders.from);
    const to = readMsgString(reader, MSG_PROP_DISPLAY_TO) || decodeMimeWords(transportHeaders.to) || readRecipientFallback(reader);
    const date = readFixedMsgDate(reader) || decodeMimeWords(transportHeaders.date);

    const plainBody = readMsgString(reader, MSG_PROP_BODY);
    const htmlBytes = reader.getRootStream(`__substg1.0_${MSG_PROP_HTML}0102`);
    const htmlBody = htmlBytes?.byteLength ? decodeHtmlBytes(htmlBytes) : "";
    const bodyPreview = cleanPreviewText(plainBody || (htmlBody ? stripHtml(htmlBody) : ""));

    if (!subject && !from && !to && !date && !bodyPreview) return null;
    return { subject, from, to, date, bodyPreview };
  } catch {
    return null;
  }
}

export async function buildCorrespondencePreviewForFile(file: File): Promise<CorrespondencePreviewFields> {
  try {
    if (isOutlookMsgFile(file.name, file.type)) {
      const parsed = parseOutlookMsgPreview(await file.arrayBuffer());
      if (!parsed) return EMPTY_PREVIEW;
      return {
        previewKind: "email",
        emailSubject: parsed.subject,
        emailFrom: parsed.from,
        emailTo: parsed.to,
        emailDate: parsed.date,
        bodyPreview: parsed.bodyPreview
      };
    }

    if (isEmlFile(file.name, file.type)) {
      const raw = await file.slice(0, MAX_EMAIL_PREVIEW_READ_BYTES).text();
      const parsed = parseEmailPreview(raw);
      if (!parsed) return EMPTY_PREVIEW;
      return {
        previewKind: "email",
        emailSubject: parsed.subject,
        emailFrom: parsed.from,
        emailTo: parsed.to,
        emailDate: parsed.date,
        bodyPreview: parsed.bodyPreview
      };
    }

    if (isTextLikeFile(file.name, file.type)) {
      const raw = await file.slice(0, MAX_EMAIL_PREVIEW_READ_BYTES).text();
      return {
        ...EMPTY_PREVIEW,
        previewKind: "text",
        bodyPreview: cleanPreviewText(raw)
      };
    }
  } catch {
    return EMPTY_PREVIEW;
  }

  return EMPTY_PREVIEW;
}

export function looksLikeEmailAttachment(fileName: string, mimeType?: string | null): boolean {
  return isEmailLikeFile(fileName, mimeType);
}

export function looksLikeOutlookMsgAttachment(fileName: string, mimeType?: string | null): boolean {
  return isOutlookMsgFile(fileName, mimeType);
}

export function looksLikeTextAttachment(fileName: string, mimeType?: string | null): boolean {
  return isTextLikeFile(fileName, mimeType);
}
