"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PREFETCH_ROUTES = [
  "/enquiries",
  "/surveys",
  "/quotes",
  "/artwork-approvals",
  "/clients",
  "/materials",
  "/dashboard"
];

function shouldShowForLink(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href") || "";
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  try {
    const next = new URL(href, window.location.href);
    if (next.origin !== window.location.origin) return false;
    return `${next.pathname}${next.search}` !== `${window.location.pathname}${window.location.search}`;
  } catch {
    return false;
  }
}

export function RouteTransitionOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Loading your workspace…");
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchKey = useMemo(() => searchParams?.toString() ?? "", [searchParams]);

  function clearTimers() {
    if (delayTimer.current) clearTimeout(delayTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    delayTimer.current = null;
    safetyTimer.current = null;
  }

  function startLoading(nextMessage = "Loading your workspace…", delayMs = 70) {
    clearTimers();
    setMessage(nextMessage);
    delayTimer.current = setTimeout(() => setVisible(true), delayMs);
    safetyTimer.current = setTimeout(() => setVisible(false), 18000);
  }

  useEffect(() => {
    clearTimers();
    setVisible(false);
  }, [pathname, searchKey]);

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 700));
    const cancelIdle = window.cancelIdleCallback ?? ((id: number) => window.clearTimeout(id));
    const idleId = idle(() => {
      PREFETCH_ROUTES.forEach((route, index) => {
        window.setTimeout(() => router.prefetch(route), index * 90);
      });
    });

    return () => cancelIdle(idleId as number);
  }, [router]);

  useEffect(() => {
    function handleCustomLoading(event: Event) {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      startLoading(detail?.message || "Loading your workspace…", 0);
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !shouldShowForLink(anchor)) return;
      startLoading("Loading page…");
    }

    function handleSubmit(event: SubmitEvent) {
      const target = event.target as HTMLFormElement | null;
      if (!target || target.dataset.noGlobalLoader === "true") return;
      startLoading("Saving your changes…", 0);
    }

    function handlePageShow() {
      clearTimers();
      setVisible(false);
    }

    window.addEventListener("pm:loading", handleCustomLoading as EventListener);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      clearTimers();
      window.removeEventListener("pm:loading", handleCustomLoading as EventListener);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-label="Loading"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        background: "rgba(248, 250, 252, 0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        pointerEvents: "auto"
      }}
    >
      <style>{`
        @keyframes pm-logo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.92; filter: drop-shadow(0 18px 34px rgba(109, 40, 217, 0.20)); }
          50% { transform: scale(1.055); opacity: 1; filter: drop-shadow(0 24px 44px rgba(109, 40, 217, 0.34)); }
        }
        @keyframes pm-loading-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          width: "min(440px, calc(100vw - 44px))",
          borderRadius: 32,
          border: "1px solid rgba(203, 213, 225, 0.9)",
          background: "rgba(255,255,255,0.96)",
          boxShadow: "0 32px 84px rgba(15, 23, 42, 0.18)",
          padding: "34px 30px",
          display: "grid",
          placeItems: "center",
          gap: 18,
          textAlign: "center"
        }}
      >
        <img
          src="/brand/production-manager-logo.svg"
          alt="Production Manager"
          style={{
            width: 230,
            maxWidth: "82%",
            height: "auto",
            display: "block",
            animation: "pm-logo-pulse 1.05s ease-in-out infinite"
          }}
        />
        <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 1000, letterSpacing: "0.06em", color: "#111827" }}>I&apos;M LOADING</div>
          <div style={{ color: "#667085", fontSize: 14, fontWeight: 750 }}>{message}</div>
          <div style={{ display: "inline-flex", gap: 6, marginTop: 2 }} aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#6d28d9",
                  animation: "pm-loading-dot 1s ease-in-out infinite",
                  animationDelay: `${index * 0.12}s`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
