"use client";

import { DragEvent, useRef, useState } from "react";
import { createEnquiryAction } from "./actions";
import { buildCorrespondencePreviewForFile, type CorrespondencePreviewFields } from "./emailPreview";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type ClientOption = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  payloadJson: {
    defaultSiteAddress?: unknown;
    billingAddress?: unknown;
    [key: string]: unknown;
  };
};

type PendingCorrespondenceUpload = {
  id: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  preview: CorrespondencePreviewFields;
};

type SignedIntakeUpload = {
  bucket: string;
  storagePath: string;
  token: string;
  publicUrl: string;
  fileName: string;
};

const urgencyOptions = ["Low", "Normal", "High", "Urgent", "Critical"];
const sourceOptions = ["Email", "Phone call", "Walk-in", "Website", "Referral", "Repeat client", "Tender", "Social media", "Other"];
const MAX_CORRESPONDENCE_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #d0d5dd", padding: "0 14px", width: "100%", boxSizing: "border-box" } as const;
const textareaStyle = { minHeight: 110, borderRadius: 12, border: "1px solid #d0d5dd", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 12, border: "none", background: "#111827", color: "#fff", fontWeight: 800, cursor: "pointer", padding: "0 16px" } as const;
const dropStyle = { border: "1px dashed #b7c7e6", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 8 } as const;

function contactNameForClient(client: ClientOption): string {
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim();
}

function defaultSiteAddressForClient(client: ClientOption): string {
  const siteAddress = client.payloadJson?.defaultSiteAddress;
  const billingAddress = client.payloadJson?.billingAddress;
  if (typeof siteAddress === "string" && siteAddress.trim()) return siteAddress.trim();
  if (typeof billingAddress === "string" && billingAddress.trim()) return billingAddress.trim();
  return "";
}

function firstUsefulFile(files: FileList | File[]): File | null {
  const list = Array.from(files);
  return list.find((file) => file.size > 0) ?? null;
}

function formatFileSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

async function uploadIntakeCorrespondence(file: File): Promise<SignedIntakeUpload> {
  const response = await fetch("/api/enquiries/intake-correspondence-upload-sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<SignedIntakeUpload> & { error?: string };
  if (!response.ok || !payload.bucket || !payload.storagePath || !payload.token || !payload.publicUrl) {
    throw new Error(payload.error || "Could not prepare correspondence upload.");
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.storage.from(payload.bucket).uploadToSignedUrl(payload.storagePath, payload.token, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true
  });

  if (error) throw new Error(error.message);

  return {
    bucket: payload.bucket,
    storagePath: payload.storagePath,
    token: payload.token,
    publicUrl: payload.publicUrl,
    fileName: payload.fileName || file.name
  };
}

type NewEnquiryFormProps = {
  clients: ClientOption[];
  mode?: "standard" | "tablet";
  returnTo?: "/enquiries" | "/enquiries/tablet";
};

export function NewEnquiryForm({ clients, mode = "standard", returnTo = "/enquiries" }: NewEnquiryFormProps) {
  const isTablet = mode === "tablet";
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(
    isTablet
      ? "Take a photo of the supplied signage, site, sketch or reference material."
      : "Drag an email, .eml/.msg file, PDF or screenshot here before creating the enquiry."
  );
  const [pendingUploads, setPendingUploads] = useState<PendingCorrespondenceUpload[]>([]);
  const fieldStyle = isTablet
    ? { ...inputStyle, minHeight: 58, borderRadius: 16, padding: "0 16px", fontSize: 17 } as const
    : inputStyle;
  const tabletTextareaStyle = isTablet
    ? { ...textareaStyle, minHeight: 140, borderRadius: 16, padding: "14px 16px", fontSize: 17 } as const
    : textareaStyle;

  function applySelectedClient(nextClientId: string) {
    setSelectedClientId(nextClientId);
    const client = clients.find((item) => item.id === nextClientId) ?? null;
    if (!client) {
      setClientName("");
      setContactName("");
      setPhone("");
      setEmail("");
      setSiteAddress("");
      return;
    }

    setClientName(client.displayName || "");
    setContactName(contactNameForClient(client));
    setPhone(client.phone || "");
    setEmail(client.email || "");
    setSiteAddress(defaultSiteAddressForClient(client));
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_CORRESPONDENCE_FILE_SIZE_BYTES) {
      setUploadStatus(isTablet
        ? "That photo is over 50MB. Please take another photo at a lower resolution."
        : "That file is over 50MB. Save a smaller email/PDF, or attach the important correspondence as a smaller file.");
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      return;
    }

    try {
      setIsUploading(true);
      setUploadStatus(isTablet ? "Uploading photo…" : "Uploading correspondence…");
      window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message: isTablet ? "Uploading enquiry photo…" : "Uploading enquiry correspondence…" } }));
      const preview = await buildCorrespondencePreviewForFile(file);
      const upload = await uploadIntakeCorrespondence(file);
      setPendingUploads((current) => [
        ...current,
        {
          id: `${upload.storagePath}-${Date.now()}`,
          fileName: upload.fileName || file.name,
          fileUrl: upload.publicUrl,
          storagePath: upload.storagePath,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          preview
        }
      ]);
      setUploadStatus(isTablet
        ? "Photo ready. It will attach when you create the enquiry."
        : "Correspondence uploaded. It will attach when you create the enquiry.");
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : isTablet ? "Photo upload failed." : "Correspondence upload failed.");
    } finally {
      setIsUploading(false);
      window.dispatchEvent(new CustomEvent("pm:loading-done"));
    }
  }

  function pendingUploadFields(upload: PendingCorrespondenceUpload) {
    return (
      <>
        <input type="hidden" name="pendingCorrespondenceFileName" value={upload.fileName} />
        <input type="hidden" name="pendingCorrespondenceFileUrl" value={upload.fileUrl} />
        <input type="hidden" name="pendingCorrespondenceStoragePath" value={upload.storagePath} />
        <input type="hidden" name="pendingCorrespondenceMimeType" value={upload.mimeType} />
        <input type="hidden" name="pendingCorrespondenceSizeBytes" value={String(upload.sizeBytes)} />
        <input type="hidden" name="pendingCorrespondencePreviewKind" value={upload.preview.previewKind} />
        <input type="hidden" name="pendingCorrespondenceEmailSubject" value={upload.preview.emailSubject} />
        <input type="hidden" name="pendingCorrespondenceEmailFrom" value={upload.preview.emailFrom} />
        <input type="hidden" name="pendingCorrespondenceEmailTo" value={upload.preview.emailTo} />
        <input type="hidden" name="pendingCorrespondenceEmailDate" value={upload.preview.emailDate} />
        <input type="hidden" name="pendingCorrespondenceBodyPreview" value={upload.preview.bodyPreview} />
      </>
    );
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    await handleFile(firstUsefulFile(event.dataTransfer.files));
  }

  return (
    <form
      action={createEnquiryAction}
      encType="multipart/form-data"
      className={isTablet ? "tablet-enquiry-form" : undefined}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: isTablet ? 28 : 20,
        padding: isTablet ? 28 : 22,
        display: "grid",
        gap: isTablet ? 16 : 12,
        boxShadow: isTablet ? "0 24px 60px rgba(15, 23, 42, 0.10)" : undefined
      }}
    >
      <input type="hidden" name="returnTo" value={returnTo} />
      <h2 style={{ margin: 0, fontSize: isTablet ? 28 : undefined }}>New enquiry</h2>
      {isTablet ? <p style={{ margin: "-6px 0 2px", color: "#64748b", fontSize: 15 }}>Capture the essentials and attach reference photos now. Extra files and correspondence can still be added later.</p> : null}
      <select name="linkedCustomerId" value={selectedClientId} onChange={(event) => applySelectedClient(event.currentTarget.value)} style={fieldStyle}>
        <option value="">New / unlinked client</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>{client.displayName}</option>
        ))}
      </select>
      <input name="clientName" value={clientName} onChange={(event) => setClientName(event.currentTarget.value)} placeholder="Client / business name (or choose existing above)" required={isTablet} style={fieldStyle} />
      {!isTablet ? (
        <section style={{ border: "1px dashed #c7d7fe", borderRadius: 14, background: "#f8fbff", padding: 12, display: "grid", gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Client logo (optional)</strong>
          <span style={{ color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>Add a logo for a new/unlinked client. Existing linked clients already use their saved client logo.</span>
          <input type="file" name="clientLogoFile" accept="image/*" style={{ ...fieldStyle, minHeight: 38, paddingTop: 8, background: "#fff" }} />
          <input name="clientLogoUrl" placeholder="or paste client logo URL" style={{ ...fieldStyle, background: "#fff" }} />
        </section>
      ) : null}
      <input name="contactName" value={contactName} onChange={(event) => setContactName(event.currentTarget.value)} placeholder="Contact name" style={fieldStyle} />
      <div className={isTablet ? "tablet-enquiry-two-column" : undefined} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isTablet ? 14 : 10 }}>
        <input name="phone" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} placeholder="Phone" style={fieldStyle} />
        <input name="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="Email" style={fieldStyle} />
      </div>
      <div className={isTablet ? "tablet-enquiry-two-column" : undefined} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isTablet ? 14 : 10 }}>
        <select name="source" defaultValue={isTablet ? "Walk-in" : ""} style={fieldStyle}>
          <option value="">Source</option>
          {sourceOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select name="urgency" defaultValue="Normal" style={fieldStyle}>
          {urgencyOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <input name="siteAddress" value={siteAddress} onChange={(event) => setSiteAddress(event.currentTarget.value)} placeholder="Site address if relevant" style={fieldStyle} />
      <input name="clientPurchaseOrderNumber" placeholder="Client purchase order number (optional)" style={fieldStyle} />
      <textarea name="requestSummary" placeholder="Rough idea of what they require" required style={tabletTextareaStyle} />
      <textarea name="notes" placeholder="Internal notes" style={tabletTextareaStyle} />

      {isTablet ? (
        <section
          style={{
            border: "1px solid #bfdbfe",
            borderRadius: 20,
            background: "#eff6ff",
            padding: 16,
            display: "grid",
            gap: 13
          }}
        >
          <div className="tablet-photo-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ fontSize: 17, color: "#172554" }}>Reference photos</strong>
              <span style={{ color: "#475569", fontSize: 13, lineHeight: 1.4 }}>Use the rear camera to photograph supplied signage, a sketch, damage, measurements or the installation area.</span>
            </div>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => cameraInputRef.current?.click()}
              style={{
                minHeight: 56,
                flex: "0 0 auto",
                borderRadius: 16,
                border: "none",
                background: "#155eef",
                color: "#fff",
                padding: "0 18px",
                fontSize: 16,
                fontWeight: 900,
                cursor: isUploading ? "wait" : "pointer",
                opacity: isUploading ? 0.65 : 1,
                boxShadow: "0 10px 24px rgba(21, 94, 239, 0.22)"
              }}
            >
              {isUploading ? "Uploading…" : pendingUploads.length > 0 ? "📷 Take another photo" : "📷 Take photo"}
            </button>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Take an enquiry reference photo"
            style={{ display: "none" }}
            onChange={async (event) => {
              const file = event.currentTarget.files ? firstUsefulFile(event.currentTarget.files) : null;
              await handleFile(file);
            }}
          />

          <span style={{ color: uploadStatus.includes("failed") || uploadStatus.includes("over 50MB") ? "#b42318" : "#475569", fontSize: 13, fontWeight: 700 }}>
            {uploadStatus}
          </span>

          {pendingUploads.length > 0 ? (
            <div className="tablet-photo-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {pendingUploads.map((upload, index) => (
                <article key={upload.id} style={{ overflow: "hidden", border: "1px solid #bfdbfe", borderRadius: 16, background: "#fff", display: "grid" }}>
                  <img
                    src={upload.fileUrl}
                    alt={`Enquiry reference photo ${index + 1}`}
                    style={{ display: "block", width: "100%", height: 190, objectFit: "cover", background: "#e2e8f0" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "10px 12px" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155", fontSize: 12, fontWeight: 750 }}>
                      Photo {index + 1} {formatFileSize(upload.sizeBytes) ? `· ${formatFileSize(upload.sizeBytes)}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingUploads((current) => current.filter((item) => item.id !== upload.id))}
                      style={{ border: "none", background: "transparent", color: "#b42318", fontWeight: 900, cursor: "pointer", padding: 4 }}
                    >
                      Remove
                    </button>
                  </div>
                  {pendingUploadFields(upload)}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          ...dropStyle,
          borderColor: dragActive ? "#2563eb" : "#b7c7e6",
          background: dragActive ? "#eff6ff" : dropStyle.background
        }}
      >
        <strong style={{ fontSize: 13 }}>Email correspondence</strong>
        <span style={{ color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>{uploadStatus}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".eml,.msg,.pdf,.txt,.doc,.docx,.png,.jpg,.jpeg,.webp,message/rfc822,application/pdf,image/*"
          style={{ minHeight: 38, borderRadius: 12, border: "1px solid #d0d5dd", padding: "7px 10px", background: "#fff", width: "100%", boxSizing: "border-box", fontSize: 12 }}
          onChange={async (event) => {
            const file = event.currentTarget.files ? firstUsefulFile(event.currentTarget.files) : null;
            await handleFile(file);
          }}
        />
        {pendingUploads.length > 0 ? (
          <div style={{ display: "grid", gap: 6 }}>
            {pendingUploads.map((upload) => (
              <div key={upload.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 12, padding: "7px 9px", background: "#fff" }}>
                <span style={{ fontSize: 12, color: "#344054" }}>{upload.fileName} {formatFileSize(upload.sizeBytes) ? `· ${formatFileSize(upload.sizeBytes)}` : ""}</span>
                <button type="button" onClick={() => setPendingUploads((current) => current.filter((item) => item.id !== upload.id))} style={{ border: "none", background: "transparent", color: "#b42318", fontWeight: 800, cursor: "pointer" }}>Remove</button>
                {pendingUploadFields(upload)}
              </div>
            ))}
          </div>
        ) : null}
        </div>
      )}

      <button
        type="submit"
        disabled={isUploading}
        style={isTablet
          ? { ...buttonStyle, minHeight: 66, borderRadius: 18, fontSize: 20, background: "#155eef", boxShadow: "0 12px 28px rgba(21, 94, 239, 0.24)", opacity: isUploading ? 0.65 : 1, cursor: isUploading ? "wait" : "pointer" }
          : { ...buttonStyle, opacity: isUploading ? 0.65 : 1, cursor: isUploading ? "wait" : "pointer" }}
      >
        {isUploading ? (isTablet ? "Uploading photo…" : "Uploading attachment…") : "Create enquiry"}
      </button>
    </form>
  );
}
