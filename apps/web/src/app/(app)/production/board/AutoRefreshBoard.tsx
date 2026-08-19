"use client";

import { useEffect } from "react";
import { requestAppActivityCheck } from "@/lib/auto-refresh-client";

type AutoRefreshBoardProps = {
  seconds?: number;
};

export function AutoRefreshBoard({ seconds = 45 }: AutoRefreshBoardProps) {
  useEffect(() => {
    requestAppActivityCheck();
    const interval = window.setInterval(requestAppActivityCheck, Math.max(10, seconds) * 1000);

    return () => window.clearInterval(interval);
  }, [seconds]);

  return null;
}
