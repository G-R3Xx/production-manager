"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const PULSE_INTERVAL_MS = 10_000;
const FALLBACK_REFRESH_MS = 60_000;

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function SafeAppAutoRefresh() {
  const router = useRouter();
  const dirtyRef = useRef(false);
  const refreshingRef = useRef(false);
  const pulseRef = useRef<string | null>(null);
  const pendingRefreshRef = useRef(false);
  const lastRefreshAtRef = useRef(Date.now());

  useEffect(() => {
    const markDirty = (event: Event) => {
      if (isEditableElement(event.target)) dirtyRef.current = true;
    };
    const clearDirty = () => {
      dirtyRef.current = false;
    };

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", clearDirty, true);
    document.addEventListener("reset", clearDirty, true);

    async function checkPulse() {
      if (document.visibilityState !== "visible" || refreshingRef.current) return;

      try {
        const response = await fetch("/api/app-pulse", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) throw new Error(`Pulse request failed (${response.status})`);
        const payload = await response.json() as { pulse?: string };
        const nextPulse = String(payload.pulse ?? "");

        if (pulseRef.current === null) {
          pulseRef.current = nextPulse;
          return;
        }
        if (nextPulse !== pulseRef.current) {
          pulseRef.current = nextPulse;
          pendingRefreshRef.current = true;
        }
      } catch {
        if (Date.now() - lastRefreshAtRef.current >= FALLBACK_REFRESH_MS) pendingRefreshRef.current = true;
      }

      if (!pendingRefreshRef.current) return;
      if (dirtyRef.current || isEditableElement(document.activeElement)) return;

      refreshingRef.current = true;
      pendingRefreshRef.current = false;
      lastRefreshAtRef.current = Date.now();
      router.refresh();
      window.setTimeout(() => {
        refreshingRef.current = false;
      }, 900);
    }

    void checkPulse();
    const timer = window.setInterval(() => void checkPulse(), PULSE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", clearDirty, true);
      document.removeEventListener("reset", clearDirty, true);
    };
  }, [router]);

  return null;
}
