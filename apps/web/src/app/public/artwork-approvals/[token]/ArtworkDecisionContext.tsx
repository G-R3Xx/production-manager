"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ArtworkPageDecisionStatus = "pending" | "approved" | "changes_requested";
export type ArtworkPageDecision = {
  pageId: string;
  status: ArtworkPageDecisionStatus;
  notes: string | null;
};

type ArtworkDecisionContextValue = {
  decisions: ArtworkPageDecision[];
  pageCount: number;
  approvedPageCount: number;
  changesPageCount: number;
  pendingPageCount: number;
  allPagesApproved: boolean;
  allPagesDecided: boolean;
  hasChanges: boolean;
  dirty: boolean;
  decisionFor: (pageId: string) => ArtworkPageDecision;
  setDecision: (pageId: string, status: ArtworkPageDecisionStatus, notes?: string | null) => void;
  payloadJson: string;
  clearPersistedDraft: () => void;
};

const ArtworkDecisionContext = createContext<ArtworkDecisionContextValue | null>(null);

function normaliseDecision(decision: ArtworkPageDecision): ArtworkPageDecision {
  const status: ArtworkPageDecisionStatus = decision.status === "approved" || decision.status === "changes_requested" ? decision.status : "pending";
  return {
    pageId: String(decision.pageId),
    status,
    notes: status === "changes_requested" ? (String(decision.notes ?? "").trim() || null) : null
  };
}

export function ArtworkDecisionProvider({
  token,
  revision,
  initialDecisions,
  children
}: {
  token: string;
  revision: string;
  initialDecisions: ArtworkPageDecision[];
  children: ReactNode;
}) {
  const initial = useMemo(() => initialDecisions.map(normaliseDecision), [initialDecisions]);
  const storageKey = useMemo(() => `production-manager:artwork-review:${token}:${revision || "A"}`, [revision, token]);
  const [decisions, setDecisions] = useState<ArtworkPageDecision[]>(initial);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ArtworkPageDecision[];
      if (!Array.isArray(parsed)) return;
      const knownIds = new Set(initial.map((entry) => entry.pageId));
      const localById = new Map(parsed.map(normaliseDecision).filter((entry) => knownIds.has(entry.pageId)).map((entry) => [entry.pageId, entry]));
      setDecisions(initial.map((entry) => localById.get(entry.pageId) ?? entry));
    } catch {
      // A corrupt browser draft should never stop the approval page from loading.
    }
  }, [initial, storageKey]);

  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);
  const currentJson = useMemo(() => JSON.stringify(decisions), [decisions]);
  const dirty = initialJson !== currentJson;

  useEffect(() => {
    try {
      if (dirty) window.sessionStorage.setItem(storageKey, currentJson);
      else window.sessionStorage.removeItem(storageKey);
    } catch {
      // Session storage is an optional convenience only.
    }
  }, [currentJson, dirty, storageKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setDecision = useCallback((pageId: string, status: ArtworkPageDecisionStatus, notes: string | null = null) => {
    setDecisions((current) => current.map((entry) => entry.pageId === pageId
      ? normaliseDecision({ pageId, status, notes })
      : entry));
  }, []);

  const decisionFor = useCallback((pageId: string) => decisions.find((entry) => entry.pageId === pageId) ?? { pageId, status: "pending" as const, notes: null }, [decisions]);
  const approvedPageCount = decisions.filter((entry) => entry.status === "approved").length;
  const changesPageCount = decisions.filter((entry) => entry.status === "changes_requested").length;
  const pendingPageCount = decisions.filter((entry) => entry.status === "pending").length;
  const pageCount = decisions.length;
  const allPagesApproved = pageCount > 0 && approvedPageCount === pageCount;
  const allPagesDecided = pageCount > 0 && pendingPageCount === 0;
  const hasChanges = changesPageCount > 0;

  const clearPersistedDraft = useCallback(() => {
    try { window.sessionStorage.removeItem(storageKey); } catch { /* optional */ }
  }, [storageKey]);

  const value = useMemo<ArtworkDecisionContextValue>(() => ({
    decisions,
    pageCount,
    approvedPageCount,
    changesPageCount,
    pendingPageCount,
    allPagesApproved,
    allPagesDecided,
    hasChanges,
    dirty,
    decisionFor,
    setDecision,
    payloadJson: currentJson,
    clearPersistedDraft
  }), [allPagesApproved, allPagesDecided, approvedPageCount, changesPageCount, clearPersistedDraft, currentJson, decisionFor, decisions, dirty, hasChanges, pageCount, pendingPageCount, setDecision]);

  return (
    <ArtworkDecisionContext.Provider value={value}>
      {dirty ? <form aria-hidden="true" data-production-manager-unsaved="true" style={{ display: "none" }} /> : null}
      {children}
    </ArtworkDecisionContext.Provider>
  );
}

export function useArtworkDecisions(): ArtworkDecisionContextValue {
  const context = useContext(ArtworkDecisionContext);
  if (!context) throw new Error("Artwork decision controls must be rendered inside ArtworkDecisionProvider.");
  return context;
}

export function ArtworkDecisionProgressBanner() {
  const { allPagesApproved, allPagesDecided, hasChanges, changesPageCount } = useArtworkDecisions();
  if (allPagesApproved) {
    return (
      <section style={{ border: "2px solid #12b76a", borderRadius: 18, background: "#ecfdf3", padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap", boxShadow: "0 10px 26px rgba(6,118,71,0.12)" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ color: "#067647", fontSize: 18 }}>✓ All proof pages approved locally</strong>
          <span style={{ color: "#344054", fontSize: 13 }}>Nothing has been saved yet. Complete the final production sign-off below to submit the approval.</span>
        </div>
        <a href="#respond" style={{ minHeight: 44, borderRadius: 12, padding: "0 16px", background: "#067647", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 950, whiteSpace: "nowrap" }}>Complete final approval →</a>
      </section>
    );
  }
  if (allPagesDecided && hasChanges) {
    return (
      <section style={{ border: "2px solid #fdba74", borderRadius: 18, background: "#fff7ed", padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ color: "#c2410c", fontSize: 18 }}>{changesPageCount} page{changesPageCount === 1 ? "" : "s"} marked for changes</strong>
          <span style={{ color: "#7c2d12", fontSize: 13 }}>Nothing has been sent yet. Submit the complete review below when you are ready.</span>
        </div>
        <a href="#respond" style={{ minHeight: 44, borderRadius: 12, padding: "0 16px", background: "#c2410c", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", fontWeight: 950, whiteSpace: "nowrap" }}>Submit complete review →</a>
      </section>
    );
  }
  return null;
}

function decisionTone(status: ArtworkPageDecisionStatus) {
  if (status === "approved") return { label: "Approved", fg: "#067647", bg: "#ecfdf3", border: "#abefc6", prefix: "✓ " };
  if (status === "changes_requested") return { label: "Changes requested", fg: "#c2410c", bg: "#fff7ed", border: "#fed7aa", prefix: "! " };
  return { label: "Awaiting decision", fg: "#475467", bg: "#f8fafc", border: "#d0d5dd", prefix: "" };
}

export function ArtworkDecisionStatusPill({ pageId }: { pageId: string }) {
  const { decisionFor } = useArtworkDecisions();
  const tone = decisionTone(decisionFor(pageId).status);
  return <span style={{ borderRadius: 999, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg, padding: "5px 8px", fontSize: 10, fontWeight: 950 }}>{tone.label}</span>;
}

export function ArtworkDecisionNavLink({ pageId, href, label }: { pageId: string; href: string; label: string }) {
  const { decisionFor } = useArtworkDecisions();
  const tone = decisionTone(decisionFor(pageId).status);
  return <a href={href} style={{ border: `1px solid ${tone.border}`, borderRadius: 10, padding: "8px 10px", textDecoration: "none", color: tone.fg, background: tone.bg, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" }}>{tone.prefix}{label}</a>;
}
