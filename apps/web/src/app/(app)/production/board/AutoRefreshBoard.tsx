"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshBoardProps = {
  seconds?: number;
};

export function AutoRefreshBoard({ seconds = 45 }: AutoRefreshBoardProps) {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, Math.max(10, seconds) * 1000);

    return () => window.clearInterval(interval);
  }, [router, seconds]);

  return null;
}
