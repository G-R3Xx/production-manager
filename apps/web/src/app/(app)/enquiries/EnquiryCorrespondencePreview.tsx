"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { looksLikeEmailAttachment, looksLikeOutlookMsgAttachment, looksLikeTextAttachment, parseEmailPreview, parseOutlookMsgPreview, type CorrespondencePreviewFields } from "./emailPreview";

type EnquiryCorrespondencePreviewItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  previewKind: string | null;
  emailSubject: string | null;
  emailFrom: string | null;
  emailTo: string | null;
  emailDate: string | null;
  bodyPreview: string | null;
  createdAt: string;
};

type EnquiryCorrespondencePreviewProps = {
  item: EnquiryCorrespondencePreviewItem;
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe6f5",
  background: "#fbfdff",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 8
};

const labelStyle: CSSProperties = {
  color: "#667085",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase"
};

const valueStyle: CSSProperties = {
  color: "#101828",
  fontSize: 13,
  overflowWrap: "anywhere"
};

function formatFileSize(sizeBytes: number | null | undefined): string {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return "";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function normaliseEmailDate(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function previewFromItem(item: EnquiryCorrespondencePreviewItem): CorrespondencePreviewFields {
  return {
    previewKind: item.previewKind ?? "",
    emailSubject: item.emailSubject ?? "",
    emailFrom: item.emailFrom ?? "",
    emailTo: item.emailTo ?? "",
    emailDate: item.emailDate ?? "",
    bodyPreview: item.bodyPreview ?? ""
  };
}

function hasUsefulPreview(preview: CorrespondencePreviewFields): boolean {
  return Boolean(preview.previewKind || preview.emailSubject || preview.emailFrom || preview.emailTo || preview.emailDate || preview.bodyPreview);
}

function isImageAttachment(item: EnquiryCorrespondencePreviewItem): boolean {
  const mimeType = String(item.mimeType ?? "").toLowerCase();
  const fileName = item.fileName.toLowerCase();
  return mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(fileName);
}

function isPdfAttachment(item: EnquiryCorrespondencePreviewItem): boolean {
  const mimeType = String(item.mimeType ?? "").toLowerCase();
  return mimeType.includes("application/pdf") || item.fileName.toLowerCase().endsWith(".pdf");
}

async function fetchInlinePreview(item: EnquiryCorrespondencePreviewItem): Promise<CorrespondencePreviewFields | null> {
  if (!looksLikeEmailAttachment(item.fileName, item.mimeType) && !looksLikeTextAttachment(item.fileName, item.mimeType)) return null;

  const response = await fetch(item.fileUrl);
  if (!response.ok) return null;

  if (looksLikeOutlookMsgAttachment(item.fileName, item.mimeType)) {
    const parsed = parseOutlookMsgPreview(await response.arrayBuffer());
    if (!parsed) return null;
    return {
      previewKind: "email",
      emailSubject: parsed.subject,
      emailFrom: parsed.from,
      emailTo: parsed.to,
      emailDate: parsed.date,
      bodyPreview: parsed.bodyPreview
    };
  }

  const text = await response.text();
  if (looksLikeEmailAttachment(item.fileName, item.mimeType)) {
    const parsed = parseEmailPreview(text);
    if (!parsed) return null;
    return {
      previewKind: "email",
      emailSubject: parsed.subject,
      emailFrom: parsed.from,
      emailTo: parsed.to,
      emailDate: parsed.date,
      bodyPreview: parsed.bodyPreview
    };
  }

  return {
    previewKind: "text",
    emailSubject: "",
    emailFrom: "",
    emailTo: "",
    emailDate: "",
    bodyPreview: text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, 3200)
  };
}

export function EnquiryCorrespondencePreview({ item }: EnquiryCorrespondencePreviewProps) {
  const savedPreview = useMemo(() => previewFromItem(item), [item.previewKind, item.emailSubject, item.emailFrom, item.emailTo, item.emailDate, item.bodyPreview]);
  const [loadedPreview, setLoadedPreview] = useState<CorrespondencePreviewFields | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const preview = hasUsefulPreview(savedPreview) ? savedPreview : loadedPreview;
  const isRecognisedEmail = looksLikeEmailAttachment(item.fileName, item.mimeType);
  const isEmail = isRecognisedEmail || preview?.previewKind === "email" || Boolean(preview?.emailSubject || preview?.emailFrom || preview?.emailTo);
  const isText = preview?.previewKind === "text";

  useEffect(() => {
    let cancelled = false;
    if (hasUsefulPreview(savedPreview)) return;
    if (!looksLikeEmailAttachment(item.fileName, item.mimeType) && !looksLikeTextAttachment(item.fileName, item.mimeType)) return;

    setLoadingPreview(true);
    fetchInlinePreview(item)
      .then((nextPreview) => {
        if (!cancelled) setLoadedPreview(nextPreview);
      })
      .catch(() => {
        if (!cancelled) setLoadedPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item.fileName, item.fileUrl, item.mimeType, savedPreview]);

  return (
    <article style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ borderRadius: 999, background: isEmail ? "#eef4ff" : "#f2f4f7", color: isEmail ? "#155eef" : "#344054", padding: "3px 8px", fontSize: 11, fontWeight: 900 }}>
              {isEmail ? "Email" : isImageAttachment(item) ? "Image" : isPdfAttachment(item) ? "PDF" : "File"}
            </span>
            <strong style={{ fontSize: 13, overflowWrap: "anywhere" }}>{item.fileName}</strong>
          </div>
          <div style={{ marginTop: 4, color: "#667085", fontSize: 12 }}>
            {[formatFileSize(item.sizeBytes), item.uploadedBy ? `uploaded by ${item.uploadedBy}` : "", formatDateTime(item.createdAt)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <a href={item.fileUrl} target="_blank" rel="noreferrer" style={{ flex: "0 0 auto", border: "1px solid #d0d5dd", background: "#fff", color: "#111827", textDecoration: "none", borderRadius: 999, padding: "6px 9px", fontSize: 12, fontWeight: 900 }}>
          Open original
        </a>
      </div>

      {loadingPreview ? <div style={{ color: "#667085", fontSize: 12 }}>Loading email preview…</div> : null}
      {isRecognisedEmail && !loadingPreview && !preview ? (
        <div style={{ border: "1px solid #f2d39a", borderRadius: 12, background: "#fffbeb", padding: 10, color: "#7a4e00", fontSize: 12 }}>
          This email is attached, but its inline preview could not be read. Use Open original to view it.
        </div>
      ) : null}

      {isEmail && preview ? (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, display: "grid", gap: 8 }}>
          <div>
            <div style={labelStyle}>Subject</div>
            <div style={{ ...valueStyle, fontWeight: 900 }}>{preview.emailSubject || item.fileName}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <div>
              <div style={labelStyle}>From</div>
              <div style={valueStyle}>{preview.emailFrom || "Not captured"}</div>
            </div>
            <div>
              <div style={labelStyle}>To</div>
              <div style={valueStyle}>{preview.emailTo || "Not captured"}</div>
            </div>
            <div>
              <div style={labelStyle}>Date</div>
              <div style={valueStyle}>{normaliseEmailDate(preview.emailDate) || "Not captured"}</div>
            </div>
          </div>
          {preview.bodyPreview ? (
            <div style={{ borderTop: "1px solid #eef2f7", paddingTop: 8 }}>
              <div style={labelStyle}>Email body preview</div>
              <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontFamily: "inherit", color: "#344054", fontSize: 13, lineHeight: 1.5 }}>{preview.bodyPreview}</pre>
            </div>
          ) : (
            <div style={{ color: "#98a2b3", fontSize: 12 }}>No readable email body was captured. The original file is still attached.</div>
          )}
        </section>
      ) : null}

      {isText && preview?.bodyPreview ? (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 }}>
          <div style={labelStyle}>Text preview</div>
          <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontFamily: "inherit", color: "#344054", fontSize: 13, lineHeight: 1.5 }}>{preview.bodyPreview}</pre>
        </section>
      ) : null}

      {isImageAttachment(item) ? (
        <a
          href={item.fileUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            background: "#f8fafc",
            boxSizing: "border-box"
          }}
        >
          <img
            src={item.fileUrl}
            alt={item.fileName}
            style={{
              display: "block",
              width: "auto",
              height: "auto",
              maxWidth: "100%",
              maxHeight: 360,
              objectFit: "contain",
              objectPosition: "center center"
            }}
          />
        </a>
      ) : null}

      {isPdfAttachment(item) ? (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10, color: "#475467", fontSize: 12 }}>
          PDF attached. Use Open original to view the full document.
        </div>
      ) : null}
    </article>
  );
}
