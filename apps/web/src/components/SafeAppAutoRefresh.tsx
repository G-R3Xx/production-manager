"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  APP_ACTIVITY_CHECK_EVENT,
  claimAppRefresh,
  clearAllAutoRefreshFormDirty,
  installAutoRefreshFormTracking,
  pageHasUnsavedEdits,
} from "@/lib/auto-refresh-client";

const PULSE_INTERVAL_MS = 5_000;
const FALLBACK_REFRESH_MS = 60_000;

export function SafeAppAutoRefresh({ initialPulse }: { initialPulse: string }) {
  const router = useRouter();
  const refreshingRef = useRef(false);
  const checkingRef = useRef(false);
  const pulseRef = useRef<string>(initialPulse);
  const pendingRefreshRef = useRef(false);
  const lastRefreshAtRef = useRef(Date.now());

  useEffect(() => {
    pulseRef.current = initialPulse;
    pendingRefreshRef.current = false;
    clearAllAutoRefreshFormDirty();
  }, [initialPulse]);

  useEffect(() => {
    const removeFormTracking = installAutoRefreshFormTracking();

    async function checkPulse() {
      if (document.visibilityState !== "visible" || refreshingRef.current || checkingRef.current) return;
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

    void checkPulse();
    const timer = window.setInterval(() => void checkPulse(), PULSE_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    window.addEventListener("pageshow", checkWhenVisible);
    window.addEventListener(APP_ACTIVITY_CHECK_EVENT, checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      window.removeEventListener("pageshow", checkWhenVisible);
      window.removeEventListener(APP_ACTIVITY_CHECK_EVENT, checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      removeFormTracking();
    };
  }, [router]);

  return null;
}
