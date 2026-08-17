"use client";

import { useEffect, useRef, useState } from "react";

import { loadPdfJs, type PdfDocument } from "@/lib/pdfjs-browser";

function watermarkPatternSvg(text: string): string {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300">
    <g transform="rotate(-28 210 150)">
      <text x="24" y="92" fill="rgba(15,23,42,0.16)" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="1.5">${safe}</text>
      <text x="52" y="212" fill="rgba(15,23,42,0.16)" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="1.5">${safe}</text>
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function ProofWatermark({ text, borderRadius = 10 }: { text: string; borderRadius?: number }) {
  return <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius, pointerEvents: "none", userSelect: "none", backgroundImage: watermarkPatternSvg(text), backgroundRepeat: "repeat", backgroundSize: "360px 260px", opacity: 1, mixBlendMode: "multiply" }} />;
}

function PdfCanvas({ url, title, watermarkText, large = false }: { url: string; title: string; watermarkText: string; large?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let documentHandle: PdfDocument | null = null;

    async function renderPdf() {
      const host = hostRef.current;
      if (!host) return;
      host.replaceChildren();
      setStatus("loading");
      setPageCount(0);

      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        documentHandle = await pdfjs.getDocument({ url }).promise;
        if (cancelled || !hostRef.current) return;
        setPageCount(documentHandle.numPages);

        const targetWidth = Math.max(280, hostRef.current.clientWidth - (large ? 8 : 4));
        for (let pageNumber = 1; pageNumber <= documentHandle.numPages; pageNumber += 1) {
          if (cancelled || !hostRef.current) return;
          const page = await documentHandle.getPage(pageNumber);
          const natural = page.getViewport({ scale: 1 });
          const scale = Math.min(Math.max(targetWidth / Math.max(natural.width, 1), 0.35), large ? 2.4 : 1.8);
          const viewport = page.getViewport({ scale });
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Canvas rendering is unavailable in this browser.");

          canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
          canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.maxWidth = "100%";
          canvas.style.display = "block";
          canvas.style.margin = pageNumber === 1 ? "0 auto" : "14px auto 0";
          canvas.style.background = "#fff";
          canvas.style.borderRadius = "10px";
          canvas.style.boxShadow = large ? "0 10px 34px rgba(15,23,42,0.16)" : "0 5px 18px rgba(15,23,42,0.10)";
          canvas.setAttribute("aria-label", `${title}, PDF page ${pageNumber}`);
          hostRef.current.appendChild(canvas);

          await page.render({
            canvasContext: context,
            viewport,
            transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0]
          }).promise;
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void renderPdf();
    return () => {
      cancelled = true;
      if (documentHandle?.destroy) void documentHandle.destroy();
    };
  }, [large, title, url]);

  return (
    <div style={{ width: "100%", display: "grid", gap: 9 }}>
      {status === "loading" ? <div style={{ minHeight: large ? 420 : 360, display: "grid", placeItems: "center", color: "#667085", fontWeight: 800, background: "#f8fafc", borderRadius: 14 }}>Rendering proof preview…</div> : null}
      <div style={{ position: "relative", width: "100%", display: status === "error" ? "none" : "block" }}>
        <div ref={hostRef} style={{ width: "100%" }} />
        <ProofWatermark text={watermarkText} borderRadius={14} />
      </div>
      {status === "ready" && pageCount > 1 ? <div style={{ textAlign: "center", color: "#667085", fontSize: 12, fontWeight: 800 }}>{pageCount} PDF pages</div> : null}
      {status === "error" ? <div style={{ minHeight: 260, display: "grid", placeItems: "center", textAlign: "center", padding: 24, color: "#667085", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 14 }}><div><strong style={{ color: "#344054" }}>Preview unavailable</strong><p style={{ margin: "6px 0 0" }}>The proof preview could not be rendered.</p></div></div> : null}
    </div>
  );
}

export function ArtworkProofPreview({ url, title, isPdf, watermarkText }: { url: string; title: string; isPdf: boolean; watermarkText: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div style={{ width: "100%", position: "relative" }}>
        {isPdf ? <PdfCanvas url={url} title={title} watermarkText={watermarkText} /> : <div style={{ position: "relative", width: "100%" }}><img src={url} alt={title} style={{ width: "100%", maxHeight: 760, objectFit: "contain", objectPosition: "center", display: "block", borderRadius: 10 }} /><ProofWatermark text={watermarkText} borderRadius={10} /></div>}
        <button type="button" onClick={() => setExpanded(true)} style={{ position: "absolute", top: 10, right: 10, minHeight: 38, border: "1px solid #d0d5dd", borderRadius: 10, background: "rgba(255,255,255,0.94)", color: "#101828", padding: "0 12px", fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 14px rgba(15,23,42,0.10)" }}>View larger</button>
      </div>

      {expanded ? <div role="dialog" aria-modal="true" aria-label={`${title} full size preview`} onClick={() => setExpanded(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.82)", padding: 20, display: "grid", placeItems: "center" }}>
        <div onClick={(event) => event.stopPropagation()} style={{ width: "min(1500px, 96vw)", maxHeight: "94vh", overflow: "auto", background: "#eef2f6", borderRadius: 18, padding: 16, boxShadow: "0 28px 90px rgba(0,0,0,0.35)" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, padding: "8px 10px", background: "rgba(255,255,255,0.96)", border: "1px solid #d0d5dd", borderRadius: 12 }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</strong>
            <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}><span style={{ minHeight: 36, display: "inline-flex", alignItems: "center", border: "1px solid #d0d5dd", borderRadius: 9, padding: "0 11px", color: "#667085", background: "#fff", fontSize: 12, fontWeight: 850 }}>Watermarked preview only</span><button type="button" onClick={() => setExpanded(false)} style={{ minHeight: 36, border: "none", borderRadius: 9, padding: "0 12px", background: "#101828", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Close</button></div>
          </div>
          {isPdf ? <PdfCanvas url={url} title={title} watermarkText={watermarkText} large /> : <div style={{ position: "relative", width: "100%" }}><img src={url} alt={title} style={{ display: "block", maxWidth: "100%", maxHeight: "calc(94vh - 92px)", margin: "0 auto", objectFit: "contain", borderRadius: 10, background: "#fff" }} /><ProofWatermark text={watermarkText} borderRadius={10} /></div>}
        </div>
      </div> : null}
    </>
  );
}
