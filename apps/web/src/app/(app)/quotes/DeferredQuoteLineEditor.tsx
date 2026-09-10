"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import type { QuoteLineEditorProps } from "./QuoteLineEditor";

export function DeferredQuoteLineEditor(props: QuoteLineEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [Editor, setEditor] = useState<ComponentType<QuoteLineEditorProps> | null>(null);

  useEffect(() => {
    const details = hostRef.current?.closest("details");
    if (!details) {
      setShouldLoad(true);
      return;
    }

    const syncOpenState = () => setShouldLoad(details.open);
    syncOpenState();
    details.addEventListener("toggle", syncOpenState);
    return () => details.removeEventListener("toggle", syncOpenState);
  }, []);

  useEffect(() => {
    if (!shouldLoad || Editor) return;
    let cancelled = false;
    void import("./QuoteLineEditor").then((module) => {
      if (!cancelled) setEditor(() => module.QuoteLineEditor);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Editor]);

  return (
    <div ref={hostRef}>
      {shouldLoad ? (
        Editor ? <Editor {...props} /> : (
          <div style={{ minHeight: 86, display: "grid", placeItems: "center", border: "1px dashed #cbd5e1", borderRadius: 14, color: "#64748b", background: "#f8fafc", fontSize: 13, fontWeight: 800 }}>
            Loading line editor…
          </div>
        )
      ) : null}
    </div>
  );
}
