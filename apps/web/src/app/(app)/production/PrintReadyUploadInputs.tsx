"use client";

import { type ChangeEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type SignedPrintReadyUpload = {
  bucket: string;
  storagePath: string;
  token: string;
  publicUrl: string;
  fileName: string;
  fileType: string;
};

type PrintReadyUploadInputsProps = {
  itemId: string;
};

const MAX_PRINT_READY_FILE_SIZE_BYTES = 250 * 1024 * 1024;

const inputStyle = {
  minHeight: 38,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "8px 12px",
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
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

async function preparePrintReadyUpload(itemId: string, file: File): Promise<SignedPrintReadyUpload> {
  const response = await fetch("/api/production/print-ready-upload-sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      fileSize: file.size
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<SignedPrintReadyUpload> & { error?: string };
  if (!response.ok || !payload.bucket || !payload.storagePath || !payload.token || !payload.publicUrl) {
    throw new Error(payload.error || "Could not prepare print-ready upload.");
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
    fileName: payload.fileName || file.name,
    fileType: payload.fileType || file.type || "application/octet-stream"
  };
}

export function PrintReadyUploadInputs({ itemId }: PrintReadyUploadInputsProps) {
  const [status, setStatus] = useState("Select a print-ready file and it will attach to this production item automatically.");

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        type="file"
        name="printReadyFile"
        accept=".pdf,.ai,.eps,.svg,.png,.jpg,.jpeg,.tif,.tiff,.zip,.rar,.7z,application/pdf,image/*"
        style={inputStyle}
        onChange={async (event: ChangeEvent<HTMLInputElement>) => {
          const input = event.currentTarget;
          if (!input.files || input.files.length === 0) return;
          const file = input.files[0];
          if (!file) return;
          if (file.size > MAX_PRINT_READY_FILE_SIZE_BYTES) {
            input.value = "";
            setStatus("That file is over 250MB. Please upload a smaller package or paste a hosted file link.");
            return;
          }

          try {
            const form = input.form;
            if (!form) return;
            setStatus("Uploading print-ready artwork…");
            window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message: "Uploading print-ready artwork…" } }));
            const upload = await preparePrintReadyUpload(itemId, file);
            setOrCreateHiddenInput(form, "fileUrl", upload.publicUrl);
            setOrCreateHiddenInput(form, "storagePath", upload.storagePath);
            setOrCreateHiddenInput(form, "fileName", upload.fileName);
            setOrCreateHiddenInput(form, "fileType", upload.fileType);
            input.value = "";
            setStatus("File uploaded. Saving production item…");
            form.requestSubmit();
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "Print-ready upload failed.");
            window.dispatchEvent(new CustomEvent("pm:loading-done"));
          }
        }}
      />
      <input name="fileUrl" placeholder="Or paste hosted print-ready file URL" style={inputStyle} />
      <input type="hidden" name="itemId" value={itemId} />
      <span style={{ color: "#64748b", fontSize: 11, lineHeight: 1.35 }}>{status}</span>
    </div>
  );
}
