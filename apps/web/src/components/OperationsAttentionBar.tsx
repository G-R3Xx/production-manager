"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OperationsAttentionTone = "danger" | "warning" | "success" | "blue" | "neutral";

type AttentionSnapshot = {
  attention: { eyebrow: string; title: string; detail: string; href: string; tone: OperationsAttentionTone } | null;
  today: { taskCount: number; installCount: number; href: string };
  latest: { title: string; createdAt: string; href: string } | null;
  activeJobs: number;
};

const toneStyles: Record<OperationsAttentionTone, { background: string; border: string; accent: string }> = {
  danger: { background: "#fff7f7", border: "#fecaca", accent: "#dc2626" },
  warning: { background: "#fffaf0", border: "#fed7aa", accent: "#ea580c" },
  success: { background: "#f0fdf4", border: "#bbf7d0", accent: "#15803d" },
  blue: { background: "#eff6ff", border: "#bfdbfe", accent: "#2563eb" },
  neutral: { background: "#ffffff", border: "#dbe4f0", accent: "#64748b" },
};

function relativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
}

const compactCard = {
  minHeight: 42,
  borderRadius: 14,
  border: "1px solid #dbe4f0",
  background: "#fff",
  boxShadow: "0 8px 22px rgba(15,23,42,.06)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 13px",
  color: "#0f172a",
  textDecoration: "none",
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
} as const;

export function OperationsAttentionBar() {
  const [snapshot, setSnapshot] = useState<AttentionSnapshot | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/operations-attention", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      setSnapshot(await response.json() as AttentionSnapshot);
    } catch {
      // This is convenience UI only. Never interrupt the user's current page.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const attention = snapshot?.attention ?? {
    eyebrow: "Needs attention",
    title: "Checking priorities…",
    detail: "",
    href: "/dashboard",
    tone: "neutral" as const,
  };
  const tone = toneStyles[attention.tone];

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap", flex: "1 1 720px", minWidth: 0 }}>
      <Link
        href={attention.href}
        title={[attention.title, attention.detail].filter(Boolean).join(" — ")}
        style={{
          ...compactCard,
          flex: "1 1 500px",
          minWidth: 280,
          background: tone.background,
          borderColor: tone.border,
        }}
      >
        <span aria-hidden="true" style={{ width: 8, height: 8, flex: "0 0 8px", borderRadius: 999, background: tone.accent, boxShadow: `0 0 0 4px ${tone.border}66` }} />
        <span style={{ color: tone.accent, fontSize: 10, lineHeight: 1, fontWeight: 950, letterSpacing: ".07em", textTransform: "uppercase", flex: "0 0 auto" }}>{attention.eyebrow}</span>
        <strong style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attention.title}</strong>
        {attention.detail ? <span style={{ color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {attention.detail}</span> : null}
        <span style={{ marginLeft: "auto", color: tone.accent, fontSize: 12, fontWeight: 900, flex: "0 0 auto" }}>Open →</span>
      </Link>

      <Link href={snapshot?.today.href || "/calendar"} style={{ ...compactCard, flex: "0 0 auto" }} title="Open today's calendar">
        <span style={{ color: "#64748b", fontSize: 10, fontWeight: 950, letterSpacing: ".07em" }}>TODAY</span>
        <strong style={{ fontSize: 12 }}>{snapshot ? `${snapshot.today.taskCount} ${snapshot.today.taskCount === 1 ? "task" : "tasks"}` : "— tasks"}</strong>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <span style={{ fontSize: 12, color: "#475569" }}>{snapshot ? `${snapshot.today.installCount} ${snapshot.today.installCount === 1 ? "install" : "installs"}` : "— installs"}</span>
      </Link>

      <Link href={snapshot?.latest?.href || "/dashboard"} style={{ ...compactCard, flex: "0 1 300px", minWidth: 190 }} title={snapshot?.latest?.title || "No alerts yet"}>
        <span style={{ color: "#64748b", fontSize: 10, fontWeight: 950, letterSpacing: ".07em", flex: "0 0 auto" }}>LATEST</span>
        <strong style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{snapshot?.latest?.title || (snapshot ? "No alerts yet" : "Checking…")}</strong>
        {snapshot?.latest ? <span style={{ color: "#94a3b8", fontSize: 11, flex: "0 0 auto" }}>· {relativeTime(snapshot.latest.createdAt)}</span> : null}
      </Link>
    </div>
  );
}
