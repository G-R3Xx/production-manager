export type PdfViewport = { width: number; height: number };
export type PdfRenderTask = { promise: Promise<void>; cancel?: () => void };
export type PdfPage = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; transform?: number[] }): PdfRenderTask;
};
export type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy?: () => Promise<void> | void;
};
export type PdfLoadingTask = { promise: Promise<PdfDocument> };
export type PdfJsLibrary = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: string | { url: string }): PdfLoadingTask;
};

type PdfJsWindow = Window & typeof globalThis & {
  pdfjsLib?: PdfJsLibrary;
  __productionManagerPdfJsPromise?: Promise<PdfJsLibrary>;
};

const PDFJS_VERSION = "3.11.174";
const PDFJS_SCRIPT = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

function browserWindow(): PdfJsWindow {
  return window as PdfJsWindow;
}

export function loadPdfJs(): Promise<PdfJsLibrary> {
  if (typeof window === "undefined") return Promise.reject(new Error("PDF preview is only available in the browser."));
  const win = browserWindow();

  if (win.pdfjsLib) {
    win.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(win.pdfjsLib);
  }
  if (win.__productionManagerPdfJsPromise) return win.__productionManagerPdfJsPromise;

  win.__productionManagerPdfJsPromise = new Promise<PdfJsLibrary>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-pm-pdfjs="${PDFJS_VERSION}"]`);
    const finish = () => {
      const current = browserWindow().pdfjsLib;
      if (!current) {
        reject(new Error("The PDF preview library could not be loaded."));
        return;
      }
      current.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(current);
    };

    if (existing) {
      if (win.pdfjsLib) finish();
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

  return win.__productionManagerPdfJsPromise;
}
