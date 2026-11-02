"use client";

import { deleteStaffCertificateAction } from "./actions";

export function DeleteCertificateForm({ membershipId, certificateId, title }: { membershipId: string; certificateId: string; title: string }) {
  return <form action={deleteStaffCertificateAction} onSubmit={(event) => {
    if (!window.confirm(`Permanently delete ${title} and its attached file?`)) event.preventDefault();
  }} style={{ display: "flex", justifyContent: "flex-end" }}>
    <input type="hidden" name="membershipId" value={membershipId}/>
    <input type="hidden" name="certificateId" value={certificateId}/>
    <button type="submit" style={{ border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", padding: "8px 12px", borderRadius: 10, cursor: "pointer" }}>Delete certificate</button>
  </form>;
}
