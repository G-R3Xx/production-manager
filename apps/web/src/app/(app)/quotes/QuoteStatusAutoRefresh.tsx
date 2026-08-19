"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const STATUS_POLL_MS = 6_000;

function userIsEditing(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return active.isContentEditable || ["input", "textarea", "select"].includes(active.tagName.toLowerCase());
}

export function QuoteStatusAutoRefresh({ quoteId, updatedAt }: { quoteId: string; updatedAt: string }) {
  const router = useRouter();
  const latestRef = useRef(updatedAt);
  const refreshingRef = useRef(false);

  useEffect(() => {
    latestRef.current = updatedAt;
  }, [updatedAt]);

  useEffect(() => {
    async function checkStatus() {
      if (document.visibilityState !== "visible" || refreshingRef.current) return;
      try {
        const response = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/status`, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const data = await response.json() as { updatedAt?: string };
        const nextUpdatedAt = String(data.updatedAt ?? "");
        if (!nextUpdatedAt || nextUpdatedAt === latestRef.current || userIsEditing()) return;
        latestRef.current = nextUpdatedAt;
        refreshingRef.current = true;
        router.refresh();
        window.setTimeout(() => { refreshingRef.current = false; }, 900);
      } catch {
        // A temporary status-check failure should not interrupt quote editing.
      }
    }

    const timer = window.setInterval(() => void checkStatus(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [quoteId, router]);

  return null;
}
