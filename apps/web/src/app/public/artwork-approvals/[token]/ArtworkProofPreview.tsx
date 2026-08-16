"use client";

import { useEffect, useRef, useState } from "react";

type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel?: () => void };
type PdfPage = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; transform?: number[] }): PdfRenderTask;
};
type PdfDocument = { numPages: number; getPage(pageNumber: number): Promise<PdfPage>; destroy?: () => Promise<void> | void };
type PdfLoadingTask = { promise: Promise<PdfDocument> };
type PdfJsLibrary = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: string | { url: string }): PdfLoadingTask;
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLibrary;
    __productionManagerPdfJsPromise?: Promise<PdfJsLibrary>;
  }
}

const PDFJS_VERSION = "3.11.174";
const PDFJS_SCRIPT = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

function loadPdfJs(): Promise<PdfJsLibrary> {
  if (typeof window === "undefined") return Promise.reject(new Error("PDF preview is only available in the browser."));
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }
  if (window.__productionManagerPdfJsPromise) return window.__productionManagerPdfJsPromise;

  window.__productionManagerPdfJsPromise = new Promise<PdfJsLibrary>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-pm-pdfjs="${PDFJS_VERSION}"]`);
    const finish = () => {
      if (!window.pdfjsLib) {
        reject(new Error("The clean PDF preview could not be loaded."));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };
    if (existing) {
      if (window.pdfjsLib) finish();
      else {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("The PDF preview library could not be loaded.")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = PDFJS_SCRIPT;
    script.async = true;
    script.dataset.pmPdfjs = PDFJS_VERSION;
    script.onload = finish;
    script.onerror = () => reject(new Error("The PDF preview library could not be loaded."));
    document.head.appendChild(script);
  });

  return window.__productionManagerPdfJsPromise;
}

function PdfCanvas({ url, title, large = false }: { url: string; title: string; large?: boolean }) {
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
      {status === "loading" ? <div style={{ minHeight: large ? 420 : 360, display: "grid", placeItems: "center", color: "#667085", fontWeight: 800, background: "#f8fafc", borderRadius: 14 }}>Rendering clean PDF preview…</div> : null}
      <div ref={hostRef} style={{ width: "100%", display: status === "error" ? "none" : "block" }} />
      {status === "ready" && pageCount > 1 ? <div style={{ textAlign: "center", color: "#667085", fontSize: 12, fontWeight: 800 }}>{pageCount} PDF pages</div> : null}
      {status === "error" ? <div style={{ minHeight: 260, display: "grid", placeItems: "center", textAlign: "center", padding: 24, color: "#667085", background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 14 }}><div><strong style={{ color: "#344054" }}>Preview unavailable</strong><p style={{ margin: "6px 0 0" }}>The original proof is still available below.</p></div></div> : null}
    </div>
  );
}

export function ArtworkProofPreview({ url, title, isPdf }: { url: string; title: string; isPdf: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div style={{ width: "100%", position: "relative" }}>
        {isPdf ? <PdfCanvas url={url} title={title} /> : <img src={url} alt={title} style={{ width: "100%", maxHeight: 760, objectFit: "contain", objectPosition: "center", display: "block", borderRadius: 10 }} />}
        <button type="button" onClick={() => setExpanded(true)} style={{ position: "absolute", top: 10, right: 10, minHeight: 38, border: "1px solid #d0d5dd", borderRadius: 10, background: "rgba(255,255,255,0.94)", color: "#101828", padding: "0 12px", fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 14px rgba(15,23,42,0.10)" }}>View larger</button>
      </div>

      {expanded ? <div role="dialog" aria-modal="true" aria-label={`${title} full size preview`} onClick={() => setExpanded(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.82)", padding: 20, display: "grid", placeItems: "center" }}>
        <div onClick={(event) => event.stopPropagation()} style={{ width: "min(1500px, 96vw)", maxHeight: "94vh", overflow: "auto", background: "#eef2f6", borderRadius: 18, padding: 16, boxShadow: "0 28px 90px rgba(0,0,0,0.35)" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, padding: "8px 10px", background: "rgba(255,255,255,0.96)", border: "1px solid #d0d5dd", borderRadius: 12 }}>
            <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</strong>
            <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}><a href={url} target="_blank" rel="noreferrer" style={{ minHeight: 36, display: "inline-flex", alignItems: "center", border: "1px solid #d0d5dd", borderRadius: 9, padding: "0 11px", color: "#344054", textDecoration: "none", fontWeight: 850 }}>Open original ↗</a><button type="button" onClick={() => setExpanded(false)} style={{ minHeight: 36, border: "none", borderRadius: 9, padding: "0 12px", background: "#101828", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Close</button></div>
          </div>
          {isPdf ? <PdfCanvas url={url} title={title} large /> : <img src={url} alt={title} style={{ display: "block", maxWidth: "100%", maxHeight: "calc(94vh - 92px)", margin: "0 auto", objectFit: "contain", borderRadius: 10, background: "#fff" }} />}
        </div>
      </div> : null}
    </>
  );
}
