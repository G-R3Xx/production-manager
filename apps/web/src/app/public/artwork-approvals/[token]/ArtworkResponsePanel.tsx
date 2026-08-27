"use client";

import { SignaturePad } from "./SignaturePad";
import { approveArtworkAction } from "./actions";

const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #cfd9e8", padding: "0 12px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
export function ArtworkResponsePanel({ token, pageCount, approvedPageCount }: { token: string; pageCount: number; approvedPageCount: number }) {
  const allPagesApproved = pageCount > 0 && approvedPageCount === pageCount;

  return (
    <section id="respond" style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", boxShadow: "0 14px 40px rgba(15,23,42,0.07)", overflow: "hidden" }}>
      <div style={{ padding: 18, borderBottom: "1px solid #e4e7ec", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Final production approval</h2>
          <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Approve each proof page individually, then sign once to release the complete set to production.</p>
        </div>
        <span style={{ borderRadius: 999, border: `1px solid ${allPagesApproved ? "#abefc6" : "#d0d5dd"}`, background: allPagesApproved ? "#ecfdf3" : "#f8fafc", color: allPagesApproved ? "#067647" : "#475467", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{approvedPageCount}/{pageCount} pages approved</span>
      </div>

      {allPagesApproved ? (
        <form action={approveArtworkAction} style={{ padding: 18, display: "grid", gap: 13 }}>
          <input type="hidden" name="token" value={token} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" }}>Your name<input name="signatoryName" placeholder="Name of person approving" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" }}>Optional approval note<input name="notes" placeholder="Optional note" style={inputStyle} /></label>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid #abefc6", background: "#ecfdf3", borderRadius: 12, padding: 12, color: "#344054", fontWeight: 800, lineHeight: 1.45 }}>
            <input name="confirmed" type="checkbox" style={{ width: 18, height: 18, marginTop: 2, flex: "0 0 auto" }} />
            <span>I have checked all proof pages, spelling, layout, colours, sizes, quantities, materials, laminate/finish and mounting details and approve this artwork for production.</span>
          </label>
          <div style={{ display: "grid", gap: 7 }}><strong style={{ fontSize: 12 }}>Signature</strong><SignaturePad /></div>
          <button type="submit" style={{ minHeight: 48, borderRadius: 13, border: "none", background: "#067647", color: "#fff", fontWeight: 950, cursor: "pointer", fontSize: 15 }}>Approve artwork for production</button>
        </form>
      ) : (
        <div style={{ padding: 18, display: "grid", gap: 10, background: "#f8fafc" }}>
          <strong>Finish the page decisions above</strong>
          <p style={{ margin: 0, color: "#667085", fontSize: 13, lineHeight: 1.5 }}>{pageCount - approvedPageCount} proof page{pageCount - approvedPageCount === 1 ? " still needs" : "s still need"} approval. Change requests are attached directly to the relevant proof page.</p>
          <div style={{ height: 8, borderRadius: 999, background: "#e4e7ec", overflow: "hidden" }}><div style={{ width: `${pageCount ? Math.round((approvedPageCount / pageCount) * 100) : 0}%`, height: "100%", background: "#12b76a", transition: "width .2s ease" }} /></div>
        </div>
      )}
    </section>
  );
}
