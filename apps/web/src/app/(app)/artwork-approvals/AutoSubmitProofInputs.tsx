"use client";

import { useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AutoSubmitProofInputsProps = {
  fileName?: string;
  urlName?: string;
  autoSubmit?: boolean;
};

type SignedProofUpload = {
  bucket: string;
  storagePath: string;
  token: string;
  publicUrl: string;
  fileName: string;
};

const MAX_PROOF_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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

function submitClosestForm(input: HTMLInputElement, message: string) {
  const form = input.form;
  if (!form) return;
  window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message } }));
  form.requestSubmit();
}

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

async function uploadProofFileDirectly(input: HTMLInputElement, file: File): Promise<SignedProofUpload> {
  const form = input.form;
  if (!form) throw new Error("Proof upload form was not found.");

  const formData = new FormData(form);
  const approvalId = String(formData.get("approvalId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();

  if (!approvalId) throw new Error("Select an artwork approval first.");

  const response = await fetch("/api/artwork-approvals/proof-upload-sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      approvalId,
      pageId,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<SignedProofUpload> & { error?: string };
  if (!response.ok || !payload.bucket || !payload.storagePath || !payload.token || !payload.publicUrl) {
    throw new Error(payload.error || "Could not prepare proof upload.");
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

export function AutoSubmitProofInputs({ fileName = "proofFile", urlName = "imageUrl", autoSubmit = true }: AutoSubmitProofInputsProps) {
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState(autoSubmit ? "Select a file and it will upload into this proof page automatically." : "Select a file and it will upload ready for this proof page.");

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        name={fileName}
        type="file"
        accept="image/*,.pdf"
        style={inputStyle}
        onChange={async (event) => {
          const input = event.currentTarget;
          if (!input.files || input.files.length === 0) return;
          const file = input.files[0];
          if (!file) return;
          if (file.size > MAX_PROOF_FILE_SIZE_BYTES) {
            input.value = "";
            setStatus("That file is over 50MB. Please export a smaller proof image/PDF or paste a hosted proof URL.");
            return;
          }

          try {
            setStatus("Uploading proof artwork…");
            window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message: "Uploading proof artwork…" } }));
            const upload = await uploadProofFileDirectly(input, file);
            const form = input.form;
            if (!form) return;
            setOrCreateHiddenInput(form, urlName, upload.publicUrl);
            setOrCreateHiddenInput(form, "imageStoragePath", upload.storagePath);
            setOrCreateHiddenInput(form, "fileName", upload.fileName);
            input.value = "";
            setStatus(autoSubmit ? "Proof uploaded. Saving proof page…" : "Proof uploaded. Complete the details and press Add proof page.");
            if (autoSubmit) {
              window.dispatchEvent(new CustomEvent("pm:loading", { detail: { message: "Saving proof page…" } }));
              form.requestSubmit();
            } else {
              window.dispatchEvent(new CustomEvent("pm:loading-done"));
            }
          } catch (error) {
            setStatus(error instanceof Error ? error.message : "Proof upload failed.");
            window.dispatchEvent(new CustomEvent("pm:loading-done"));
          }
        }}
      />
      <input
        name={urlName}
        placeholder="Or paste proof image URL"
        style={inputStyle}
        onPaste={(event) => {
          if (!autoSubmit) return;
          const input = event.currentTarget;
          if (urlTimer.current) clearTimeout(urlTimer.current);
          urlTimer.current = setTimeout(() => {
            if (!input.value.trim()) return;
            setStatus("Loading proof artwork URL…");
            submitClosestForm(input, "Loading proof artwork URL…");
          }, 120);
        }}
        onKeyDown={(event) => {
          if (!autoSubmit || event.key !== "Enter") return;
          event.preventDefault();
          const input = event.currentTarget;
          if (!input.value.trim()) return;
          setStatus("Loading proof artwork URL…");
          submitClosestForm(input, "Loading proof artwork URL…");
        }}
      />
      <span style={{ color: "#64748b", fontSize: 11, lineHeight: 1.35 }}>{status}</span>
    </div>
  );
}
