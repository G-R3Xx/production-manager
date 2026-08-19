"use client";

import { useEffect } from "react";
import { requestAppActivityCheck } from "@/lib/auto-refresh-client";

export function AutoRefreshWhenPending({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    requestAppActivityCheck();
    const timer = window.setInterval(requestAppActivityCheck, 2_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return null;
}
