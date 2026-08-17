"use client";

import { useEffect, useRef, useState } from "react";

import { loadPdfJs, type PdfDocument } from "@/lib/pdfjs-browser";

export function JobSheetArtworkPreview({ url, title, isPdf }: { url: string; title: string; isPdf: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(isPdf ? "loading" : "ready");

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    let documentHandle: PdfDocument | null = null;

    async function renderFirstPage() {
      try {
        setStatus("loading");
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        documentHandle = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        const page = await documentHandle.getPage(1);
        const host = hostRef.current;
        const canvas = canvasRef.current;
        if (!host || !canvas) return;

        const natural = page.getViewport({ scale: 1 });
        const targetWidth = Math.max(220, host.clientWidth - 4);
        const scale = Math.min(Math.max(targetWidth / Math.max(natural.width, 1), 0.35), 1.8);
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas rendering is unavailable.");

        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.style.maxWidth = "100%";
        canvas.style.maxHeight = "330px";
        canvas.style.objectFit = "contain";

        await page.render({
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0]
        }).promise;
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void renderFirstPage();
    return () => {
      cancelled = true;
      if (documentHandle?.destroy) void documentHandle.destroy();
    };
  }, [isPdf, url]);

  if (!isPdf) {
    return <img src={url} alt={title} style={{ width: "100%", maxHeight: 330, objectFit: "contain", background: "#fff", borderRadius: 10, border: "1px solid #bbf7d0", display: "block" }} />;
  }

  return (
    <div ref={hostRef} style={{ width: "100%", minHeight: 220, border: "1px solid #bbf7d0", borderRadius: 10, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", padding: 6 }}>
      {status === "loading" ? <div style={{ color: "#667085", fontSize: 12, fontWeight: 800, padding: 28, textAlign: "center" }}>Rendering approved artwork preview…</div> : null}
      <canvas ref={canvasRef} aria-label={`${title} approved artwork preview`} style={{ display: status === "ready" ? "block" : "none", margin: "0 auto" }} />
      {status === "error" ? <div style={{ color: "#667085", fontSize: 12, padding: 28, textAlign: "center" }}><strong style={{ color: "#344054" }}>Approved PDF artwork</strong><br />Preview unavailable — use the artwork link below.</div> : null}
    </div>
  );
}
