"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 15_000;

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

  useEffect(() => {
    const markDirty = (event: Event) => {
      if (isEditableElement(event.target)) dirtyRef.current = true;
    };
    const clearDirtyOnSubmit = () => {
      dirtyRef.current = false;
    };
    const clearDirtyOnReset = () => {
      dirtyRef.current = false;
    };

    document.addEventListener("input", markDirty, true);
    document.addEventListener("change", markDirty, true);
    document.addEventListener("submit", clearDirtyOnSubmit, true);
    document.addEventListener("reset", clearDirtyOnReset, true);

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (dirtyRef.current || refreshingRef.current) return;
      if (isEditableElement(document.activeElement)) return;

      refreshingRef.current = true;
      router.refresh();
      window.setTimeout(() => {
        refreshingRef.current = false;
      }, 1200);
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("input", markDirty, true);
      document.removeEventListener("change", markDirty, true);
      document.removeEventListener("submit", clearDirtyOnSubmit, true);
      document.removeEventListener("reset", clearDirtyOnReset, true);
    };
  }, [router]);

  return null;
}
