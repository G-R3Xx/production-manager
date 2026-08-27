"use client";

import { useFormStatus } from "react-dom";
import { SignaturePad } from "./SignaturePad";
import { approveArtworkAction, submitArtworkReviewAction } from "./actions";
import { useArtworkDecisions } from "./ArtworkDecisionContext";

const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #cfd9e8", padding: "0 12px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;

function FinalSubmitButton({ label, pendingLabel, background }: { label: string; pendingLabel: string; background: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} style={{ minHeight: 48, borderRadius: 13, border: "none", background: pending ? "#98a2b3" : background, color: "#fff", fontWeight: 950, cursor: pending ? "wait" : "pointer", fontSize: 15 }}>{pending ? pendingLabel : label}</button>;
}

export function ArtworkResponsePanel({ token }: { token: string; pageCount?: number; approvedPageCount?: number }) {
  const {
    pageCount,
    approvedPageCount,
    changesPageCount,
    pendingPageCount,
    allPagesApproved,
    allPagesDecided,
    hasChanges,
    payloadJson,
    dirty
  } = useArtworkDecisions();

  return (
    <section id="respond" style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", boxShadow: "0 14px 40px rgba(15,23,42,0.07)", overflow: "hidden" }}>
      <div style={{ padding: 18, borderBottom: "1px solid #e4e7ec", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Final artwork review</h2>
          <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Make page decisions above first. Nothing is saved or sent until you submit the complete review here.</p>
        </div>
        <span style={{ borderRadius: 999, border: `1px solid ${allPagesApproved ? "#abefc6" : hasChanges && allPagesDecided ? "#fed7aa" : "#d0d5dd"}`, background: allPagesApproved ? "#ecfdf3" : hasChanges && allPagesDecided ? "#fff7ed" : "#f8fafc", color: allPagesApproved ? "#067647" : hasChanges && allPagesDecided ? "#c2410c" : "#475467", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>
          {approvedPageCount}/{pageCount} approved{changesPageCount ? ` · ${changesPageCount} changes` : ""}
        </span>
      </div>

      {allPagesApproved ? (
        <form action={approveArtworkAction} style={{ padding: 18, display: "grid", gap: 13 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="pageDecisionsJson" value={payloadJson} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" }}>Your name<input name="signatoryName" placeholder="Name of person approving" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" }}>Optional approval note<input name="notes" placeholder="Optional note" style={inputStyle} /></label>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid #abefc6", background: "#ecfdf3", borderRadius: 12, padding: 12, color: "#344054", fontWeight: 800, lineHeight: 1.45 }}>
            <input name="confirmed" type="checkbox" style={{ width: 18, height: 18, marginTop: 2, flex: "0 0 auto" }} />
            <span>I have checked all proof pages, spelling, layout, required PMS colour matching, sizes, quantities, materials, laminate/finish, mounting and pickup / delivery / install details and approve this artwork for production.</span>
          </label>
          <div style={{ display: "grid", gap: 7 }}><strong style={{ fontSize: 12 }}>Signature</strong><SignaturePad /></div>
          <FinalSubmitButton label="Approve artwork for production" pendingLabel="Saving final approval…" background="#067647" />
        </form>
      ) : allPagesDecided && hasChanges ? (
        <form action={submitArtworkReviewAction} style={{ padding: 18, display: "grid", gap: 12, background: "#fff7ed" }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="pageDecisionsJson" value={payloadJson} />
          <div style={{ display: "grid", gap: 5 }}>
            <strong style={{ color: "#c2410c", fontSize: 16 }}>{changesPageCount} page{changesPageCount === 1 ? " has" : "s have"} requested changes</strong>
            <span style={{ color: "#7c2d12", fontSize: 13, lineHeight: 1.45 }}>Submit the complete review once. Approved pages and change requests will then be saved together and sent back to the artwork team.</span>
          </div>
          <FinalSubmitButton label="Submit review & change requests" pendingLabel="Submitting complete review…" background="#c2410c" />
        </form>
      ) : (
        <div style={{ padding: 18, display: "grid", gap: 10, background: "#f8fafc" }}>
          <strong>Finish the page decisions above</strong>
          <p style={{ margin: 0, color: "#667085", fontSize: 13, lineHeight: 1.5 }}>{pendingPageCount} proof page{pendingPageCount === 1 ? " still needs" : "s still need"} a decision. Your selections stay on this page until the final review is submitted.</p>
          <div style={{ height: 8, borderRadius: 999, background: "#e4e7ec", overflow: "hidden" }}><div style={{ width: `${pageCount ? Math.round(((pageCount - pendingPageCount) / pageCount) * 100) : 0}%`, height: "100%", background: hasChanges ? "#f97316" : "#12b76a", transition: "width .2s ease" }} /></div>
          {dirty ? <span style={{ color: "#475467", fontSize: 11, fontWeight: 800 }}>Unsaved review selections are being kept locally in this browser.</span> : null}
        </div>
      )}
    </section>
  );
}
