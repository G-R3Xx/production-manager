"use client";

import { useEffect, useState } from "react";
import { QUOTE_LINE_TITLE_MAX_LENGTH } from "@/lib/quote-line-label";

/** Inline label-only editing: no full quote reprice or page refresh. */
export function QuoteLineLabelEditor({ quoteId, lineId, productName, initialOverride, canEdit }: {
  quoteId: string;
  lineId: string;
  productName: string;
  initialOverride: string | null;
  canEdit: boolean;
}) {
  const [override, setOverride] = useState(initialOverride);
  const [draft, setDraft] = useState(initialOverride ?? productName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setOverride(initialOverride);
    setDraft(initialOverride ?? productName);
  }, [initialOverride, productName]);

  async function save(title: string) {
    if (saving) return;
    const cleaned = title.trim();
    if (cleaned.length > QUOTE_LINE_TITLE_MAX_LENGTH || /[\x00-\x1f\x7f]/.test(cleaned)) {
      setError(`Use a single-line label up to ${QUOTE_LINE_TITLE_MAX_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/quotes/line/title", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, lineId, title: cleaned })
      });
      const result = await response.json() as { ok: boolean; error?: string; title?: string | null };
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save the label.");
      setOverride(result.title ?? null);
      setDraft(result.title ?? productName);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the label.");
    } finally {
      setSaving(false);
    }
  }

  return <span style={{ display: "inline-flex", gap: 7, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
    {editing ? (
      <span onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input autoFocus aria-label={`Display name for ${productName}`} value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); void save(draft); }
            if (event.key === "Escape") { event.preventDefault(); setEditing(false); setDraft(override ?? productName); setError(""); }
          }}
          maxLength={QUOTE_LINE_TITLE_MAX_LENGTH}
          style={{ minHeight: 32, width: "min(350px, 75vw)", border: "1px solid #93c5fd", borderRadius: 8, padding: "5px 9px" }} />
        <button type="button" onClick={() => void save(draft)} disabled={saving} style={{ minHeight: 32, borderRadius: 8, padding: "4px 9px", border: 0, background: "#155eef", color: "#fff", fontWeight: 750 }}>{saving ? "Saving…" : "Save name"}</button>
        <button type="button" disabled={saving} onClick={() => { setEditing(false); setDraft(override ?? productName); setError(""); }}
          style={{ minHeight: 32, borderRadius: 8, padding: "4px 9px", border: "1px solid #cbd5e1", background: "#fff" }}>Cancel</button>
        {override ? <button type="button" disabled={saving} onClick={() => void save("")}
          style={{ minHeight: 32, borderRadius: 8, padding: "4px 9px", border: "1px solid #cbd5e1", background: "#fff" }}>Reset</button> : null}
      </span>
    ) : <>
      <strong style={{ fontSize: 14 }}>{override || productName}</strong>
      {canEdit ? <button type="button" title="Override the displayed quote-line title (does not affect pricing)"
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setDraft(override ?? productName); setEditing(true); }}
        style={{ minHeight: 26, padding: "3px 7px", borderRadius: 7, fontSize: 11, fontWeight: 800, color: "#155eef", border: "1px solid #bfdbfe", background: "#eff6ff" }}>Rename</button> : null}
    </>}
    {error ? <span role="alert" style={{ fontSize: 11, color: "#b42318" }}>{error}</span> : null}
  </span>;
}
