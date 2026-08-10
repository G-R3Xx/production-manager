"use client";

import { useState } from "react";
import { SignaturePad } from "./SignaturePad";
import { approveArtworkAction, requestArtworkChangesAction } from "./actions";

const inputStyle = { minHeight: 44, borderRadius: 12, border: "1px solid #cfd9e8", padding: "0 12px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const textareaStyle = { minHeight: 110, borderRadius: 12, border: "1px solid #cfd9e8", padding: "11px 12px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;

export function ArtworkResponsePanel({ token, pageCount }: { token: string; pageCount: number }) {
  const [mode, setMode] = useState<"approve" | "changes">("approve");

  return (
    <section id="respond" style={{ border: "1px solid #d0d5dd", borderRadius: 22, background: "#fff", boxShadow: "0 14px 40px rgba(15,23,42,0.07)", overflow: "hidden" }}>
      <div style={{ padding: 18, borderBottom: "1px solid #e4e7ec", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Your artwork decision</h2>
          <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Review all {pageCount} proof page{pageCount === 1 ? "" : "s"}, then approve or tell us exactly what needs changing.</p>
        </div>
        <div style={{ display: "flex", gap: 6, padding: 4, background: "#f2f4f7", borderRadius: 12 }}>
          <button type="button" onClick={() => setMode("approve")} style={{ border: "none", borderRadius: 9, padding: "9px 13px", background: mode === "approve" ? "#fff" : "transparent", boxShadow: mode === "approve" ? "0 1px 4px rgba(15,23,42,0.12)" : "none", color: mode === "approve" ? "#067647" : "#667085", fontWeight: 900, cursor: "pointer" }}>Approve</button>
          <button type="button" onClick={() => setMode("changes")} style={{ border: "none", borderRadius: 9, padding: "9px 13px", background: mode === "changes" ? "#fff" : "transparent", boxShadow: mode === "changes" ? "0 1px 4px rgba(15,23,42,0.12)" : "none", color: mode === "changes" ? "#c2410c" : "#667085", fontWeight: 900, cursor: "pointer" }}>Request changes</button>
        </div>
      </div>

      {mode === "approve" ? (
        <form action={approveArtworkAction} style={{ padding: 18, display: "grid", gap: 13 }}>
          <input type="hidden" name="token" value={token} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" }}>Your name<input name="signatoryName" placeholder="Name of person approving" style={inputStyle} /></label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" }}>Optional approval note<input name="notes" placeholder="Optional note" style={inputStyle} /></label>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid #abefc6", background: "#ecfdf3", borderRadius: 12, padding: 12, color: "#344054", fontWeight: 800, lineHeight: 1.45 }}>
            <input name="confirmed" type="checkbox" style={{ width: 18, height: 18, marginTop: 2, flex: "0 0 auto" }} />
            <span>I have checked all proof pages, spelling, layout, colours, sizes, quantities and material/finishing details and approve this artwork for production.</span>
          </label>
          <div style={{ display: "grid", gap: 7 }}><strong style={{ fontSize: 12 }}>Signature</strong><SignaturePad /></div>
          <button type="submit" style={{ minHeight: 48, borderRadius: 13, border: "none", background: "#067647", color: "#fff", fontWeight: 950, cursor: "pointer", fontSize: 15 }}>Approve artwork for production</button>
        </form>
      ) : (
        <form action={requestArtworkChangesAction} style={{ padding: 18, display: "grid", gap: 12 }}>
          <input type="hidden" name="token" value={token} />
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" }}>What needs to change?<textarea name="notes" placeholder="Please be specific — for example: S2 phone number is incorrect; move logo 20mm left; change background to black." style={textareaStyle} /></label>
          <div style={{ border: "1px solid #fed7aa", background: "#fff7ed", borderRadius: 12, padding: 11, color: "#9a3412", fontSize: 12, lineHeight: 1.45 }}>Submitting this will return the artwork to our team for a revised proof. You do not need to sign when requesting changes.</div>
          <button type="submit" style={{ minHeight: 48, borderRadius: 13, border: "none", background: "#c2410c", color: "#fff", fontWeight: 950, cursor: "pointer", fontSize: 15 }}>Send change request</button>
        </form>
      )}
    </section>
  );
}
