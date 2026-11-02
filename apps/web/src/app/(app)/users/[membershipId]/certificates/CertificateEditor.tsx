"use client";

import { useRef, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { MAX_CERTIFICATE_FILE_SIZE, STAFF_CERTIFICATE_CATEGORIES, STAFF_CERTIFICATE_MIME_TYPES } from "@/lib/staff-certificate";
import type { StaffCertificate } from "@/server/staff-certificates";
import { saveStaffCertificateAction } from "./actions";

const inputStyle = { width: "100%", boxSizing: "border-box", minHeight: 42, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", color: "#0f172a" } as const;
const labelStyle = { display: "grid", gap: 5, color: "#475569", fontSize: 12, fontWeight: 800 } as const;

export function CertificateEditor({ membershipId, existing }: { membershipId: string; existing?: StaffCertificate }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !formRef.current) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData(formRef.current);
      const selectedFile = form.get("evidence");
      form.delete("evidence");
      if (selectedFile instanceof File && selectedFile.size > 0) {
        if (!STAFF_CERTIFICATE_MIME_TYPES.some((type) => type === selectedFile.type) || selectedFile.size > MAX_CERTIFICATE_FILE_SIZE) {
          throw new Error("Use a JPG, PNG, WebP or PDF file smaller than 15MB.");
        }
        const response = await fetch("/api/staff-certificates/upload-sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ membershipId, contentType: selectedFile.type, fileName: selectedFile.name, fileSize: selectedFile.size })
        });
        const payload = await response.json() as { bucket?: string; token?: string; storagePath?: string; fileName?: string; error?: string };
        if (!response.ok || !payload.bucket || !payload.token || !payload.storagePath) throw new Error(payload.error || "Upload could not start.");
        const { error: uploadError } = await getSupabaseBrowserClient().storage.from(payload.bucket).uploadToSignedUrl(
          payload.storagePath, payload.token, selectedFile, { contentType: selectedFile.type, upsert: false }
        );
        if (uploadError) throw new Error(uploadError.message);
        form.set("filePath", payload.storagePath);
        form.set("fileName", payload.fileName || selectedFile.name);
        form.set("fileType", selectedFile.type);
      }
      await saveStaffCertificateAction(form);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save certificate.");
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="certificateId" value={existing?.id ?? ""} />
      <input type="hidden" name="filePath" value="" />
      <input type="hidden" name="fileName" value="" />
      <input type="hidden" name="fileType" value="" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%,210px),1fr))", gap: 14 }}>
        <label style={labelStyle}>Training / certificate name *<input style={inputStyle} name="title" required maxLength={200} defaultValue={existing?.title ?? ""} placeholder="e.g. Working at Heights" /></label>
        <label style={labelStyle}>Type<select style={inputStyle} name="category" defaultValue={existing?.category ?? "training"}>{STAFF_CERTIFICATE_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label style={labelStyle}>Issued by<input style={inputStyle} name="issuingOrganisation" maxLength={200} defaultValue={existing?.issuingOrganisation ?? ""} placeholder="Provider or authority" /></label>
        <label style={labelStyle}>Certificate / licence number<input style={inputStyle} name="certificateNumber" maxLength={150} defaultValue={existing?.certificateNumber ?? ""} /></label>
        <label style={labelStyle}>Issue / completion date<input style={inputStyle} name="issuedDate" type="date" defaultValue={existing?.issuedDate ?? ""} /></label>
        <label style={labelStyle}>Expiry date (optional)<input style={inputStyle} name="expiryDate" type="date" defaultValue={existing?.expiryDate ?? ""} /></label>
        <label style={labelStyle}>Alert how many days before expiry?<input type="number" name="reminderDays" min={0} max={365} step={1} style={inputStyle} defaultValue={existing?.reminderDays ?? 30} /><span style={{ color: "#64748b", fontWeight: 500 }}>0 = no advance reminder. Expired records are still flagged.</span></label>
        <label style={labelStyle}>Photo / scan / PDF (max 15MB)<input type="file" name="evidence" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")} style={{ ...inputStyle, padding: "8px" }} />{existing?.fileName ? <span style={{ fontSize: 11, fontWeight: 500 }}>Existing: {existing.fileName} (kept unless replaced)</span> : null}{fileName ? <span style={{ fontSize: 11, fontWeight: 500 }}>Selected: {fileName}</span> : null}</label>
      </div>
      <label style={labelStyle}>Notes / details<textarea name="notes" rows={3} maxLength={3000} defaultValue={existing?.notes ?? ""} style={{ ...inputStyle, padding: 12, resize: "vertical" }} placeholder="Training outcome, licence class, restrictions, renewal instructions…" /></label>
      {error ? <div role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</div> : null}
      <div><button type="submit" disabled={busy} style={{ border: 0, borderRadius: 11, background: busy ? "#94a3b8" : "#2563eb", color: "#fff", minHeight: 42, padding: "0 20px", fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>{busy ? "Saving…" : existing ? "Update certificate" : "Add certificate"}</button></div>
    </form>
  );
}
