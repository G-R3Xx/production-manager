"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { claimAppRefresh, pageHasUnsavedEdits } from "@/lib/auto-refresh-client";

const STATUS_POLL_MS = 5_000;

export function ArtworkStatusAutoRefresh({ approvalId, fingerprint }: { approvalId: string; fingerprint: string }) {
  const router = useRouter();
  const latestRef = useRef(fingerprint);
  const refreshingRef = useRef(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    latestRef.current = fingerprint;
  }, [fingerprint]);

  useEffect(() => {
    async function checkStatus() {
      if (document.visibilityState !== "visible" || refreshingRef.current || checkingRef.current) return;
      checkingRef.current = true;
      try {
        const response = await fetch(`/api/artwork-approvals/${encodeURIComponent(approvalId)}/status`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Cache-Control": "no-cache" }
        });
        if (!response.ok) return;
        const data = await response.json() as { fingerprint?: string; updatedAt?: string };
        const nextFingerprint = String(data.fingerprint ?? data.updatedAt ?? "");
        if (!nextFingerprint || nextFingerprint === latestRef.current || pageHasUnsavedEdits() || !claimAppRefresh()) return;
        latestRef.current = nextFingerprint;
        refreshingRef.current = true;
        router.refresh();
        window.setTimeout(() => { refreshingRef.current = false; }, 1_200);
      } catch {
        // A temporary status-check failure should not interrupt artwork work.
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
    };
  }, [approvalId, router]);

  return null;
}
