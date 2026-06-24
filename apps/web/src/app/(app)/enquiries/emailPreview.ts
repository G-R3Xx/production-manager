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

type ParsedHeaders = Record<string, string>;

type ParsedEmail = {
  subject: string;
  from: string;
  to: string;
  date: string;
  bodyPreview: string;
};

function isEmailLikeFile(fileName: string, mimeType?: string | null): boolean {
  const lowerName = fileName.toLowerCase();
  const lowerType = String(mimeType ?? "").toLowerCase();
  return lowerName.endsWith(".eml") || lowerType.includes("message/rfc822");
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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
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

export async function buildCorrespondencePreviewForFile(file: File): Promise<CorrespondencePreviewFields> {
  try {
    if (isEmailLikeFile(file.name, file.type)) {
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

export function looksLikeTextAttachment(fileName: string, mimeType?: string | null): boolean {
  return isTextLikeFile(fileName, mimeType);
}
