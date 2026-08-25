"use client";

import { DragEvent, useRef, useState } from "react";
import { buildCorrespondencePreviewForFile } from "./emailPreview";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type EnquiryCorrespondenceDropzoneProps = {
  inputName?: string;
};

type SignedCorrespondenceUpload = {
  bucket: string;
  storagePath: string;
  token: string;
  publicUrl: string;
  fileName: string;
};

const MAX_CORRESPONDENCE_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const dropStyle = {
  border: "1px dashed #b7c7e6",
  borderRadius: 14,
  background: "#f8fbff",
  padding: 12,
  display: "grid",
  gap: 8
} as const;

const inputStyle = {
  minHeight: 38,
  borderRadius: 12,
  border: "1px solid #d0d5dd",
  padding: "7px 10px",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
  fontSize: 12
} as const;

function setOrCreateHiddenInput(form: HTMLFormElement, name: string, value: string) {
  let input = form.elements.namedItem(name) as HTMLInputElement | null;
  if (!input) {
    input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    form.appendChild(input);
  }
  input.value = value;
}

function firstUsefulFile(files: FileList | File[]): File | null {
  const list = Array.from(files);
  return list.find((file) => file.size > 0) ?? null;
}

async function uploadCorrespondenceFileDirectly(form: HTMLFormElement, file: File): Promise<SignedCorrespondenceUpload> {
  const formData = new FormData(form);
  const enquiryId = String(formData.get("enquiryId") ?? "").trim();
  if (!enquiryId) throw new Error("Choose an enquiry before attaching correspondence.");

  const response = await fetch("/api/enquiries/correspondence-upload-sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enquiryId,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<SignedCorrespondenceUpload> & { error?: string };
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

export function EnquiryCorrespondenceDropzone({ inputName = "correspondenceFile" }: EnquiryCorrespondenceDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState("Drag an Outlook .msg or .eml email, PDF or screenshot here, or choose a file. .msg and .eml emails show inline.");

  async function handleFile(file: File | null, form: HTMLFormElement | null) {
    if (!file || !form) return;
    if (file.size > MAX_CORRESPONDENCE_FILE_SIZE_BYTES) {
      setStatus("That file is over 50MB. Save a smaller email/PDF, or attach the important correspondence as a smaller file.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      setStatus("Uploading correspondence…");
      window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message: "Uploading enquiry correspondence…" } }));
      const preview = await buildCorrespondencePreviewForFile(file);
      const upload = await uploadCorrespondenceFileDirectly(form, file);
      setOrCreateHiddenInput(form, "fileName", upload.fileName || file.name);
      setOrCreateHiddenInput(form, "fileUrl", upload.publicUrl);
      setOrCreateHiddenInput(form, "storagePath", upload.storagePath);
      setOrCreateHiddenInput(form, "mimeType", file.type || "application/octet-stream");
      setOrCreateHiddenInput(form, "sizeBytes", String(file.size));
      setOrCreateHiddenInput(form, "previewKind", preview.previewKind);
      setOrCreateHiddenInput(form, "emailSubject", preview.emailSubject);
      setOrCreateHiddenInput(form, "emailFrom", preview.emailFrom);
      setOrCreateHiddenInput(form, "emailTo", preview.emailTo);
      setOrCreateHiddenInput(form, "emailDate", preview.emailDate);
      setOrCreateHiddenInput(form, "bodyPreview", preview.bodyPreview);
      if (inputRef.current) inputRef.current.value = "";
      setStatus("Correspondence uploaded. Saving to enquiry…");
      window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message: "Saving correspondence to enquiry…" } }));
      form.requestSubmit();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Correspondence upload failed.");
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
    const file = firstUsefulFile(event.dataTransfer.files);
    const form = event.currentTarget.closest("form") as HTMLFormElement | null;
    await handleFile(file, form);
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        ...dropStyle,
        borderColor: dragActive ? "#2563eb" : dropStyle.border.split(" ").pop(),
        background: dragActive ? "#eff6ff" : dropStyle.background
      }}
    >
      <strong style={{ fontSize: 13 }}>Email correspondence</strong>
      <span style={{ color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>{status}</span>
      <input
        ref={inputRef}
        name={inputName}
        type="file"
        accept=".eml,.msg,.pdf,.txt,.doc,.docx,.png,.jpg,.jpeg,.webp,message/rfc822,application/vnd.ms-outlook,application/pdf,image/*"
        style={inputStyle}
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files ? firstUsefulFile(input.files) : null;
          await handleFile(file, input.form);
        }}
      />
    </div>
  );
}
