const QUOTE_IMAGE_SIZE = 720;
const QUOTE_IMAGE_TYPE = "image/webp";
const QUOTE_IMAGE_QUALITY = 0.84;

function safeBaseName(name: string): string {
  const base = (name || "quote-image").replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return base || "quote-image";
}

async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  throw new Error("This browser cannot prepare quote images. Try a current Chrome, Edge or Safari browser.");
}

function cornerBackground(bitmap: ImageBitmap): string {
  const probe = document.createElement("canvas");
  probe.width = 12;
  probe.height = 12;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) return "rgb(240,243,247)";
  context.drawImage(bitmap, 0, 0, 12, 12);
  const data = context.getImageData(0, 0, 12, 12).data;
  const points = [[0, 0], [11, 0], [0, 11], [11, 11]];
  let r = 0, g = 0, b = 0, count = 0;
  for (const [x, y] of points) {
    const index = (y * 12 + x) * 4;
    const alpha = data[index + 3] / 255;
    if (alpha < 0.15) continue;
    r += data[index]; g += data[index + 1]; b += data[index + 2]; count += 1;
  }
  if (!count) return "rgb(240,243,247)";
  return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not prepare the quote image.")), QUOTE_IMAGE_TYPE, QUOTE_IMAGE_QUALITY);
  });
}

/**
 * Production Manager quote imagery uses a single 1:1 asset standard.
 * The complete source image is retained (no cropping). Any unused canvas area
 * is filled from the source image's corner colour so generated studio imagery
 * remains visually continuous rather than gaining white letterbox bars.
 */
export async function normalizeQuoteImageBlob(blob: Blob, sourceName = "quote-image"): Promise<File> {
  if (typeof document === "undefined") throw new Error("Quote image preparation is only available in the browser.");
  const bitmap = await decodeImage(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = QUOTE_IMAGE_SIZE;
    canvas.height = QUOTE_IMAGE_SIZE;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not prepare the quote image.");

    context.fillStyle = cornerBackground(bitmap);
    context.fillRect(0, 0, QUOTE_IMAGE_SIZE, QUOTE_IMAGE_SIZE);

    const scale = Math.min(QUOTE_IMAGE_SIZE / bitmap.width, QUOTE_IMAGE_SIZE / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const x = Math.round((QUOTE_IMAGE_SIZE - width) / 2);
    const y = Math.round((QUOTE_IMAGE_SIZE - height) / 2);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, x, y, width, height);

    const output = await canvasBlob(canvas);
    return new File([output], `${safeBaseName(sourceName)}-quote.webp`, { type: QUOTE_IMAGE_TYPE, lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}

export async function normalizeQuoteImageFile(file: File): Promise<File> {
  return normalizeQuoteImageBlob(file, file.name);
}

export async function normalizeQuoteImageUrl(url: string, sourceName = "quote-image"): Promise<File> {
  const response = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load existing quote image (${response.status}).`);
  return normalizeQuoteImageBlob(await response.blob(), sourceName);
}
