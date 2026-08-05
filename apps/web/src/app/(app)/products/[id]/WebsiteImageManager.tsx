"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type WebsiteImageItem = {
  id: string;
  url: string;
  alt: string;
  storagePath?: string | null;
  conditions?: WebsiteImageCondition[];
};

export type WebsiteImageCondition = {
  fieldKey: string;
  optionValue: string;
};

export type WebsiteImageOptionField = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

type ManagedImage = WebsiteImageItem & {
  token: string;
  kind: "existing";
  previewUrl: string;
};

type Props = {
  productId: string;
  productName: string;
  initialImages: WebsiteImageItem[];
  featuredImageId: string | null;
  optionFields: WebsiteImageOptionField[];
};

type SignedImageUpload = {
  bucket: string;
  storagePath: string;
  token: string;
  publicUrl: string;
  imageId: string;
};

const MAX_IMAGES = 24;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const RASTER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const RASTER_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

function extensionOf(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function isSvgFile(file: File): boolean {
  return file.type === "image/svg+xml" || extensionOf(file.name) === "svg";
}

function isSupportedRasterFile(file: File): boolean {
  return RASTER_IMAGE_TYPES.has(file.type) || RASTER_IMAGE_EXTENSIONS.has(extensionOf(file.name));
}

function parseSvgLength(value: string | null): number | null {
  if (!value || /%$/.test(value.trim())) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function convertSvgToPng(file: File): Promise<File> {
  const svgText = await file.text();
  const svgDocument = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (svgDocument.querySelector("parsererror") || svgDocument.documentElement.localName.toLowerCase() !== "svg") {
    throw new Error(`${file.name} is not a valid SVG image.`);
  }

  const svg = svgDocument.documentElement;
  const viewBox = (svg.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  const viewBoxWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2]! > 0 ? viewBox[2]! : null;
  const viewBoxHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3]! > 0 ? viewBox[3]! : null;
  const sourceWidth = parseSvgLength(svg.getAttribute("width")) ?? viewBoxWidth ?? 1200;
  const sourceHeight = parseSvgLength(svg.getAttribute("height")) ?? viewBoxHeight ?? 1200;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const targetLongestSide = Math.min(2400, Math.max(1200, longestSide));
  const scale = targetLongestSide / longestSide;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const sourceBlob = new Blob([svgText], { type: "image/svg+xml" });
  const sourceUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`${file.name} could not be rendered as an image.`));
      image.src = sourceUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the SVG image.");
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The SVG could not be converted to PNG.")), "image/png");
    });
    const pngName = file.name.replace(/\.svg$/i, "") + ".png";
    return new File([pngBlob], pngName, { type: "image/png", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function prepareWebsiteImageFile(file: File): Promise<{ file: File; convertedFromSvg: boolean }> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 12 MB.`);
  if (isSvgFile(file)) return { file: await convertSvgToPng(file), convertedFromSvg: true };
  if (!isSupportedRasterFile(file)) {
    throw new Error(`${file.name} is not a supported website image. Use JPG, PNG, WebP, GIF, AVIF or SVG.`);
  }
  return { file, convertedFromSvg: false };
}

function token(prefix: string): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${id}`;
}

function serialisable(images: ManagedImage[], featuredToken: string | null) {
  return JSON.stringify({
    featuredToken,
    items: images.map((image) => ({
      token: image.token,
      kind: "existing",
      id: image.id,
      url: image.url,
      alt: image.alt,
      storagePath: image.storagePath ?? null,
      conditions: (image.conditions ?? []).filter((condition) => condition.fieldKey && condition.optionValue)
    }))
  });
}

async function uploadProductImageDirectly(productId: string, file: File): Promise<SignedImageUpload> {
  const response = await fetch("/api/products/website-image-upload-sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    })
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<SignedImageUpload> & { error?: string };
  if (!response.ok || !payload.bucket || !payload.storagePath || !payload.token || !payload.publicUrl || !payload.imageId) {
    throw new Error(payload.error || "Could not prepare the website image upload.");
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.storage.from(payload.bucket).uploadToSignedUrl(
    payload.storagePath,
    payload.token,
    file,
    {
      contentType: file.type || "application/octet-stream",
      upsert: true
    }
  );

  if (error) throw new Error(error.message);

  return {
    bucket: payload.bucket,
    storagePath: payload.storagePath,
    token: payload.token,
    publicUrl: payload.publicUrl,
    imageId: payload.imageId
  };
}

export function WebsiteImageManager({ productId, productName, initialImages, featuredImageId, optionFields }: Props) {
  const [images, setImages] = useState<ManagedImage[]>(() => initialImages.map((image) => ({
    ...image,
    token: `existing:${image.id}`,
    kind: "existing",
    previewUrl: image.url
  })));
  const initialFeatured = initialImages.find((image) => image.id === featuredImageId)?.id ?? initialImages[0]?.id ?? null;
  const [featuredToken, setFeaturedToken] = useState<string | null>(initialFeatured ? `existing:${initialFeatured}` : null);
  const [draggedToken, setDraggedToken] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [message, setMessage] = useState("");
  const [uploadingCount, setUploadingCount] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stateJson = useMemo(() => serialisable(images, featuredToken), [images, featuredToken]);
  const uploading = uploadingCount > 0;

  useEffect(() => {
    const form = sectionRef.current?.closest("form");
    if (!form) return;
    const stopSubmitWhileUploading = (event: Event) => {
      if (!uploading) return;
      event.preventDefault();
      setMessage("Please wait for the website images to finish uploading before saving.");
    };
    form.addEventListener("submit", stopSubmitWhileUploading);
    return () => form.removeEventListener("submit", stopSubmitWhileUploading);
  }, [uploading]);

  function commit(next: ManagedImage[]) {
    setImages(next);
    if (next.length === 0) {
      setFeaturedToken(null);
    } else if (!next.some((image) => image.token === featuredToken)) {
      setFeaturedToken(next[0]?.token ?? null);
    }
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected: File[] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length || uploading) return;

    const room = Math.max(0, MAX_IMAGES - images.length);
    const candidates = selected.slice(0, room);
    if (!candidates.length) return;

    setUploadingCount(candidates.length);
    setMessage(`Preparing ${candidates.length} website image${candidates.length === 1 ? "" : "s"}…`);

    const uploaded: ManagedImage[] = [];
    const failures: string[] = [];
    let convertedSvgCount = 0;
    for (const originalFile of candidates) {
      try {
        const prepared = await prepareWebsiteImageFile(originalFile);
        if (prepared.convertedFromSvg) convertedSvgCount += 1;
        const result = await uploadProductImageDirectly(productId, prepared.file);
        uploaded.push({
          id: result.imageId,
          token: `existing:${result.imageId}`,
          kind: "existing",
          url: result.publicUrl,
          previewUrl: result.publicUrl,
          alt: productName,
          storagePath: result.storagePath,
          conditions: []
        });
      } catch (error) {
        failures.push(`${originalFile.name}: ${error instanceof Error ? error.message : "upload failed"}`);
      } finally {
        setUploadingCount((count) => Math.max(0, count - 1));
      }
    }

    if (uploaded.length) {
      const next = [...images, ...uploaded];
      commit(next);
      if (!featuredToken && next[0]) setFeaturedToken(next[0].token);
    }

    if (failures.length) {
      setMessage(failures.join(" · "));
    } else if (selected.length > room) {
      setMessage(`Images uploaded. Only ${MAX_IMAGES} website images can be saved.`);
    } else {
      const conversionNote = convertedSvgCount ? ` ${convertedSvgCount} SVG image${convertedSvgCount === 1 ? " was" : "s were"} converted to PNG for WooCommerce.` : "";
      setMessage(`${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded.${conversionNote} Save website settings to keep the gallery.`);
    }
  }

  function addUrl() {
    const value = urlInput.trim();
    if (!/^https?:\/\//i.test(value)) {
      setMessage("Enter a complete image URL beginning with http:// or https://.");
      return;
    }
    try {
      const pathname = new URL(value).pathname.toLowerCase();
      if (pathname.endsWith(".svg")) {
        setMessage("SVG image URLs cannot be imported safely by WordPress. Download the SVG and use Add image files; Production Manager will convert it to PNG automatically.");
        return;
      }
    } catch {
      setMessage("Enter a valid image URL.");
      return;
    }
    if (images.length >= MAX_IMAGES) {
      setMessage(`Only ${MAX_IMAGES} website images can be saved.`);
      return;
    }
    const id = token("url").replace("url:", "");
    const item: ManagedImage = {
      id,
      token: `existing:${id}`,
      kind: "existing",
      url: value,
      previewUrl: value,
      alt: productName,
      storagePath: null,
      conditions: []
    };
    const next = [...images, item];
    commit(next);
    if (!featuredToken) setFeaturedToken(item.token);
    setUrlInput("");
    setMessage("");
  }

  function removeImage(imageToken: string) {
    commit(images.filter((image) => image.token !== imageToken));
  }

  function changeAlt(imageToken: string, alt: string) {
    commit(images.map((image) => image.token === imageToken ? { ...image, alt } : image));
  }

  function changeConditions(imageToken: string, conditions: WebsiteImageCondition[]) {
    commit(images.map((image) => image.token === imageToken ? { ...image, conditions } : image));
  }

  function addCondition(image: ManagedImage) {
    const current = image.conditions ?? [];
    const available = optionFields.find((field) => !current.some((condition) => condition.fieldKey === field.key));
    const firstOption = available?.options[0];
    if (!available || !firstOption) return;
    changeConditions(image.token, [...current, { fieldKey: available.key, optionValue: firstOption.value }]);
  }

  function updateCondition(image: ManagedImage, index: number, update: Partial<WebsiteImageCondition>) {
    const current = [...(image.conditions ?? [])];
    const existing = current[index];
    if (!existing) return;
    const next = { ...existing, ...update };
    if (update.fieldKey) {
      const field = optionFields.find((item) => item.key === update.fieldKey);
      if (field && !field.options.some((option) => option.value === next.optionValue)) {
        next.optionValue = field.options[0]?.value ?? "";
      }
    }
    current[index] = next;
    changeConditions(image.token, current);
  }

  function removeCondition(image: ManagedImage, index: number) {
    changeConditions(image.token, (image.conditions ?? []).filter((_condition, conditionIndex) => conditionIndex !== index));
  }

  function move(imageToken: string, direction: -1 | 1) {
    const current = images.findIndex((image) => image.token === imageToken);
    const destination = current + direction;
    if (current < 0 || destination < 0 || destination >= images.length) return;
    const next = [...images];
    const [item] = next.splice(current, 1);
    if (!item) return;
    next.splice(destination, 0, item);
    commit(next);
  }

  function dropOn(event: DragEvent<HTMLDivElement>, destinationToken: string) {
    event.preventDefault();
    if (!draggedToken || draggedToken === destinationToken) return;
    const from = images.findIndex((image) => image.token === draggedToken);
    const to = images.findIndex((image) => image.token === destinationToken);
    if (from < 0 || to < 0) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    commit(next);
    setDraggedToken(null);
  }

  return <section ref={sectionRef} style={{ display: "grid", gap: 13, padding: 16, border: "1px solid #dbe4f0", borderRadius: 16, background: "#f8fafc" }}>
    <input type="hidden" name="websiteImagesState" value={stateJson}/>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
      <div>
        <h3 style={{ margin: 0 }}>Website images</h3>
        <p style={{ margin: "5px 0 0", color: "#64748b", lineHeight: 1.5 }}>Choose the featured image, add gallery images, then drag them into the order customers should see.</p>
      </div>
      <label style={{ minHeight: 40, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 13px", borderRadius: 10, background: uploading ? "#64748b" : "#0f172a", color: "#fff", fontWeight: 900, cursor: uploading ? "wait" : "pointer" }}>
        {uploading ? `Uploading ${uploadingCount}…` : "Add image files"}
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.avif,.svg,image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml" multiple disabled={uploading} onChange={addFiles} style={{ display: "none" }}/>
      </label>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}>
      <input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="Or add an image URL" disabled={uploading} style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 11px", background: "#fff" }}/>
      <button type="button" onClick={addUrl} disabled={uploading} style={{ border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", padding: "0 13px", fontWeight: 850, cursor: uploading ? "wait" : "pointer" }}>Add URL</button>
    </div>

    {message ? <div style={{ color: failuresColour(message), fontSize: 13, fontWeight: 750 }}>{message}</div> : null}

    {images.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
      {images.map((image, index) => {
        const featured = featuredToken === image.token;
        return <div
          key={image.token}
          draggable={!uploading}
          onDragStart={() => setDraggedToken(image.token)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => dropOn(event, image.token)}
          style={{ display: "grid", gap: 9, padding: 10, border: featured ? "2px solid #7c3aed" : "1px solid #dbe4f0", borderRadius: 14, background: "#fff", cursor: uploading ? "default" : "grab" }}
        >
          <div style={{ position: "relative", aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 10, background: "#e2e8f0" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.previewUrl} alt={image.alt || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
            <span style={{ position: "absolute", top: 7, left: 7, padding: "4px 7px", borderRadius: 999, background: "rgba(15,23,42,.84)", color: "#fff", fontSize: 11, fontWeight: 900 }}>{featured ? "Featured" : `Gallery ${index + 1}`}</span>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 850 }}>
            <input type="radio" name="websiteFeaturedImagePicker" checked={featured} onChange={() => setFeaturedToken(image.token)}/>
            Use as featured image
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 850 }}>
            Alt text
            <input value={image.alt} onChange={(event) => changeAlt(image.token, event.target.value)} placeholder={productName} style={{ minHeight: 38, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 9px" }}/>
          </label>
          <div style={{ display: "grid", gap: 8, padding: 10, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div>
              <strong style={{ display: "block", fontSize: 12 }}>Change to this image when</strong>
              <span style={{ color: "#64748b", fontSize: 11 }}>{(image.conditions ?? []).length ? "Every rule below must match." : featured ? "Default image when no option-image rule matches." : "Gallery only until a matching option is added."}</span>
            </div>
            {(image.conditions ?? []).map((condition, conditionIndex) => {
              const selectedField = optionFields.find((field) => field.key === condition.fieldKey);
              return <div key={`${image.token}-condition-${conditionIndex}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: 6 }}>
                <select value={condition.fieldKey} onChange={(event) => updateCondition(image, conditionIndex, { fieldKey: event.target.value })} style={{ minHeight: 36, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "0 7px" }}>
                  {optionFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                </select>
                <select value={condition.optionValue} onChange={(event) => updateCondition(image, conditionIndex, { optionValue: event.target.value })} style={{ minHeight: 36, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "0 7px" }}>
                  {(selectedField?.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button type="button" onClick={() => removeCondition(image, conditionIndex)} style={{ border: "1px solid #fecaca", borderRadius: 8, background: "#fff", color: "#b91c1c", padding: "0 8px", fontWeight: 900 }} aria-label="Remove option-image rule">×</button>
              </div>;
            })}
            {optionFields.length > (image.conditions ?? []).length ? <button type="button" onClick={() => addCondition(image)} style={{ justifySelf: "start", border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff", color: "#1d4ed8", padding: "6px 9px", fontWeight: 850, cursor: "pointer" }}>+ Add matching option</button> : null}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={() => move(image.token, -1)} disabled={uploading || index === 0} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "6px 9px", fontWeight: 800, cursor: uploading || index === 0 ? "not-allowed" : "pointer" }}>← Earlier</button>
            <button type="button" onClick={() => move(image.token, 1)} disabled={uploading || index === images.length - 1} style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", padding: "6px 9px", fontWeight: 800, cursor: uploading || index === images.length - 1 ? "not-allowed" : "pointer" }}>Later →</button>
            <button type="button" onClick={() => removeImage(image.token)} disabled={uploading} style={{ marginLeft: "auto", border: "1px solid #fecaca", borderRadius: 8, background: "#fff", color: "#b91c1c", padding: "6px 9px", fontWeight: 850, cursor: uploading ? "not-allowed" : "pointer" }}>Remove</button>
          </div>
        </div>;
      })}
    </div> : <div style={{ padding: 18, border: "1px dashed #94a3b8", borderRadius: 13, background: "#fff", color: "#64748b", textAlign: "center" }}>No website images yet. Add a featured image and optional gallery images.</div>}

    <div style={{ color: "#64748b", fontSize: 12 }}>Up to {MAX_IMAGES} images, 12 MB each. The most specific matching option image wins; the featured image remains the fallback. JPG, PNG, WebP, GIF and AVIF are uploaded directly. SVG files are automatically converted to high-resolution PNG for WooCommerce.</div>
  </section>;
}

function failuresColour(message: string): string {
  return /failed|could not|larger|not an image|not a supported|cannot|wait/i.test(message) ? "#b45309" : "#047857";
}
