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

export function NewEnquiryForm({ clients }: { clients: ClientOption[] }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("Drag an email, .eml/.msg file, PDF or screenshot here before creating the enquiry.");
  const [pendingUploads, setPendingUploads] = useState<PendingCorrespondenceUpload[]>([]);

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
      setUploadStatus("That file is over 50MB. Save a smaller email/PDF, or attach the important correspondence as a smaller file.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      setUploadStatus("Uploading correspondence…");
      window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message: "Uploading enquiry correspondence…" } }));
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
      setUploadStatus("Correspondence uploaded. It will attach when you create the enquiry.");
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Correspondence upload failed.");
    } finally {
      window.dispatchEvent(new CustomEvent("pm:loading-done"));
    }
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
    <form action={createEnquiryAction} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 22, display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>New enquiry</h2>
      <select name="linkedCustomerId" value={selectedClientId} onChange={(event) => applySelectedClient(event.currentTarget.value)} style={inputStyle}>
        <option value="">New / unlinked client</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>{client.displayName}</option>
        ))}
      </select>
      <input name="clientName" value={clientName} onChange={(event) => setClientName(event.currentTarget.value)} placeholder="Client / business name (or choose existing above)" style={inputStyle} />
      <input name="contactName" value={contactName} onChange={(event) => setContactName(event.currentTarget.value)} placeholder="Contact name" style={inputStyle} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input name="phone" value={phone} onChange={(event) => setPhone(event.currentTarget.value)} placeholder="Phone" style={inputStyle} />
        <input name="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="Email" style={inputStyle} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input name="source" placeholder="Source (call / email / walk-in)" style={inputStyle} />
        <select name="urgency" defaultValue="Normal" style={inputStyle}>
          {urgencyOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <input name="siteAddress" value={siteAddress} onChange={(event) => setSiteAddress(event.currentTarget.value)} placeholder="Site address if relevant" style={inputStyle} />
      <input name="clientPurchaseOrderNumber" placeholder="Client purchase order number (optional)" style={inputStyle} />
      <textarea name="requestSummary" placeholder="Rough idea of what they require" style={textareaStyle} />
      <textarea name="notes" placeholder="Internal notes" style={textareaStyle} />

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
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <button type="submit" style={buttonStyle}>Create enquiry</button>
    </form>
  );
}
