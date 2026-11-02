"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const QUOTE_LINE_REMOVED_EVENT = "pm-quote-lines-removed";

type QuickResult = { ok: boolean; error?: string; removedIds?: string[]; authMs?: number; dbMs?: number; totalMs?: number };
type SubJobOption = { id: string; title: string };

/** Preserve the existing server-rendered line editor, while removing deleted
 * lines immediately after the database confirms the mutation. */
export function QuoteLineVisibility({ lineId, children }: { lineId: string; children: React.ReactNode }) {
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    const listener = (event: Event) => {
      const ids = (event as CustomEvent<{ removedIds: string[] }>).detail?.removedIds ?? [];
      if (ids.includes(lineId)) setRemoved(true);
    };
    window.addEventListener(QUOTE_LINE_REMOVED_EVENT, listener);
    return () => window.removeEventListener(QUOTE_LINE_REMOVED_EVENT, listener);
  }, [lineId]);
  return removed ? null : <>{children}</>;
}

export function QuoteLineQuickActions({ quoteId, lineId, productName, subJobs, sectionId, allowMove }: {
  quoteId: string;
  lineId: string;
  productName: string;
  subJobs: SubJobOption[];
  sectionId: string | null;
  allowMove: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(sectionId ?? "");
  const [pending, setPending] = useState<"move" | "delete" | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setSelected(sectionId ?? ""), [sectionId]);

  async function mutate(mode: "move" | "delete") {
    if (pending) return;
    if (mode === "delete" && !window.confirm(`Delete “${productName}” and its linked charges?`)) return;
    const started = performance.now();
    setError("");
    setFeedback("");
    setPending(mode);
    try {
      const response = await fetch("/api/quotes/line/quick", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, lineId, mode, subJobId: selected })
      });
      const result = await response.json() as QuickResult;
      console.info("[quote-line-quick-client]", { mode, clickToResponseMs: Math.round(performance.now() - started), authMs: result.authMs, dbMs: result.dbMs, serverMs: result.totalMs });
      if (!response.ok || !result.ok) throw new Error(result.error || "The change could not be saved.");
      if (mode === "delete") {
        window.dispatchEvent(new CustomEvent(QUOTE_LINE_REMOVED_EVENT, { detail: { removedIds: result.removedIds ?? [lineId] } }));
      } else {
        setFeedback("Moved — updating sections…");
      }
      // Refresh the expensive builder data after giving immediate visual feedback.
      // Do not block the button on a full page re-render.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change could not be saved.");
    } finally {
      setPending(null);
    }
  }

  return <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
    {allowMove && subJobs.length > 0 ? <>
      <select aria-label={`Section for ${productName}`} value={selected} disabled={Boolean(pending)} onChange={(event) => setSelected(event.target.value)} style={{ minHeight: 34, maxWidth: 200, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 6px", background: "#fff" }}>
        <option value="">General / Unassigned</option>
        {subJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
      </select>
      <button type="button" disabled={Boolean(pending) || selected === (sectionId ?? "")} onClick={() => void mutate("move")} style={{ minHeight: 34, padding: "0 10px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 850, borderRadius: 9, cursor: pending ? "wait" : "pointer" }}>
        {pending === "move" ? "Moving…" : "Move"}
      </button>
    </> : null}
    <button type="button" disabled={Boolean(pending)} onClick={() => void mutate("delete")} title="Delete quote line" aria-label={`Delete ${productName} quote line`} style={{ border: "1px solid #fca5a5", background: "#fff1f2", color: "#b42318", borderRadius: 10, minHeight: 34, padding: "6px 11px", fontSize: 12, fontWeight: 950, cursor: pending ? "wait" : "pointer" }}>
      {pending === "delete" ? "Deleting…" : "× Delete line"}
    </button>
    {feedback ? <span role="status" style={{ fontSize: 11, color: "#155eef" }}>{feedback}</span> : null}
    {error ? <span role="alert" style={{ fontSize: 11, color: "#b42318" }}>{error}</span> : null}
  </div>;
}
