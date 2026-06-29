"use client";

import { useEffect } from "react";

type FullscreenBoardModeProps = {
  requested: boolean;
};

export function FullscreenBoardMode({ requested }: FullscreenBoardModeProps) {
  useEffect(() => {
    if (!requested) return;

    document.body.style.margin = "0";
    const element = document.documentElement;
    if (!document.fullscreenElement && element.requestFullscreen) {
      element.requestFullscreen().catch(() => {
        // Browsers can block fullscreen without a direct user gesture. The popup
        // window is still opened at full screen size from the Production page.
      });
    }
  }, [requested]);

  return null;
}
