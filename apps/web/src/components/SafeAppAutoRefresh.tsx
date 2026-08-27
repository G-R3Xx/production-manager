"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  APP_ACTIVITY_CHECK_EVENT,
  claimAppRefresh,
  clearAllAutoRefreshFormDirty,
  installAutoRefreshFormTracking,
  pageHasUnsavedEdits,
} from "@/lib/auto-refresh-client";

// The global pulse is only a safety net for cross-user/background changes.
// Page-specific status watchers can poll faster without making every screen
// scan the whole workflow database several times per second.
const PULSE_INTERVAL_MS = 30_000;
const MIN_PULSE_CHECK_GAP_MS = 15_000;
const FALLBACK_REFRESH_MS = 180_000;
const INITIAL_PULSE_DELAY_MS = 8_000;

export function SafeAppAutoRefresh({ initialPulse }: { initialPulse: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const isProductionBoard = pathname?.startsWith("/production/board") ?? false;
  const refreshingRef = useRef(false);
  const checkingRef = useRef(false);
  const pulseRef = useRef<string>(initialPulse);
  const hasBaselineRef = useRef(Boolean(initialPulse));
  const pendingRefreshRef = useRef(false);
  const lastRefreshAtRef = useRef(Date.now());
  const lastCheckAtRef = useRef(0);

  useEffect(() => {
    if (initialPulse) {
      pulseRef.current = initialPulse;
      hasBaselineRef.current = true;
      pendingRefreshRef.current = false;
    }
    clearAllAutoRefreshFormDirty();
  }, [initialPulse]);

  useEffect(() => {
    const removeFormTracking = installAutoRefreshFormTracking();

    async function checkPulse() {
      const now = Date.now();
      if (document.visibilityState !== "visible" || refreshingRef.current || checkingRef.current) return;
      if (now - lastCheckAtRef.current < MIN_PULSE_CHECK_GAP_MS) return;
      lastCheckAtRef.current = now;
      checkingRef.current = true;

      try {
        const response = await fetch("/api/app-pulse", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) throw new Error(`Pulse request failed (${response.status})`);
        const payload = await response.json() as { pulse?: string };
        const nextPulse = String(payload.pulse ?? "");

        // The app layout deliberately does not block navigation waiting for a
        // global pulse anymore. The first background check establishes the
        // baseline and must never cause an immediate second page load.
        if (!hasBaselineRef.current) {
          pulseRef.current = nextPulse;
          hasBaselineRef.current = true;
          pendingRefreshRef.current = false;
          return;
        }

        if (nextPulse !== pulseRef.current) {
          pulseRef.current = nextPulse;
          pendingRefreshRef.current = true;
        }
      } catch {
        if (Date.now() - lastRefreshAtRef.current >= FALLBACK_REFRESH_MS) pendingRefreshRef.current = true;
      } finally {
        checkingRef.current = false;
      }

      if (!pendingRefreshRef.current) return;
      if (pageHasUnsavedEdits()) return;
      if (!claimAppRefresh()) return;

      refreshingRef.current = true;
      pendingRefreshRef.current = false;
      lastRefreshAtRef.current = Date.now();
      router.refresh();
      window.setTimeout(() => {
        refreshingRef.current = false;
      }, 900);
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkPulse();
    };
    const checkFromActivityEvent = () => void checkPulse();

    // Let the requested page paint first; the global change detector is not
    // part of the critical navigation path.
    const initialTimer = window.setTimeout(() => void checkPulse(), INITIAL_PULSE_DELAY_MS);
    const timer = isProductionBoard ? null : window.setInterval(() => void checkPulse(), PULSE_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    window.addEventListener("pageshow", checkWhenVisible);
    window.addEventListener(APP_ACTIVITY_CHECK_EVENT, checkFromActivityEvent);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearTimeout(initialTimer);
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      window.removeEventListener("pageshow", checkWhenVisible);
      window.removeEventListener(APP_ACTIVITY_CHECK_EVENT, checkFromActivityEvent);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      removeFormTracking();
    };
  }, [isProductionBoard, router]);

  return null;
}
