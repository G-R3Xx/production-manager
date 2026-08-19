"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { claimAppRefresh, installAutoRefreshFormTracking, pageHasUnsavedEdits } from "@/lib/auto-refresh-client";

const STATUS_POLL_MS = 5_000;

export function PublicStatusAutoRefresh({ statusUrl, fingerprint }: { statusUrl: string; fingerprint: string }) {
  const router = useRouter();
  const latestRef = useRef(fingerprint);
  const checkingRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    latestRef.current = fingerprint;
  }, [fingerprint]);

  useEffect(() => {
    const removeFormTracking = installAutoRefreshFormTracking();

    async function checkStatus() {
      if (document.visibilityState !== "visible" || checkingRef.current || refreshingRef.current) return;
      checkingRef.current = true;
      try {
        const response = await fetch(statusUrl, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;
        const payload = await response.json() as { fingerprint?: string };
        const nextFingerprint = String(payload.fingerprint ?? "");
        if (!nextFingerprint || nextFingerprint === latestRef.current || pageHasUnsavedEdits() || !claimAppRefresh()) return;
        latestRef.current = nextFingerprint;
        refreshingRef.current = true;
        router.refresh();
        window.setTimeout(() => { refreshingRef.current = false; }, 1_200);
      } catch {
        // The public portal remains usable if a background status request briefly fails.
      } finally {
        checkingRef.current = false;
      }
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkStatus();
    };

    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), STATUS_POLL_MS);
    window.addEventListener("focus", checkWhenVisible);
    window.addEventListener("pageshow", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkWhenVisible);
      window.removeEventListener("pageshow", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
      removeFormTracking();
    };
  }, [router, statusUrl]);

  return null;
}
