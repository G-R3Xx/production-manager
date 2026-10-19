"use client";

import type { CSSProperties } from "react";
import type { QuoteVisualCategoryImages, QuoteVisualCategoryKey } from "@/server/quote-visuals";
import { saveQuoteVisualCategoryImageAction } from "./actions";
import { normalizeQuoteImageFile } from "@/lib/quote-image-normalize";

const categories: Array<{ key: QuoteVisualCategoryKey; label: string; group: string; hint: string }> = [
  { key: "signage", label: "Large format / signage", group: "Quote line type", hint: "Panels, vinyl, banners and fabricated signage." },
  { key: "small_format", label: "Small format / print", group: "Quote line type", hint: "Cards, flyers, brochures and booklets." },
  { key: "plan_printing", label: "Plan printing", group: "Quote line type", hint: "Plans, drawings and CAD printing." },
  { key: "poster_printing", label: "Poster printing", group: "Quote line type", hint: "Posters and print-only sheet work." },
  { key: "service", label: "Pickup / delivery / install", group: "Quote line type", hint: "Service-only quote lines." },
  { key: "pickup", label: "Pickup", group: "Service option", hint: "Catalogue image for client pickup." },
  { key: "delivery", label: "Delivery", group: "Service option", hint: "Catalogue image for delivery." },
  { key: "install", label: "Install", group: "Service option", hint: "Catalogue image for installation." },
  { key: "access_equipment", label: "Access equipment", group: "Service option", hint: "Catalogue image for access-equipment-only service lines." },
  { key: "component", label: "Custom component / assembly", group: "Quote line type", hint: "Built-up or custom manufactured work." },
  { key: "acrylic", label: "Acrylic", group: "Sign type", hint: "Fallback image when an acrylic material has no own image." },
  { key: "acm", label: "ACM", group: "Sign type", hint: "Fallback image for aluminium composite." },
  { key: "corflute", label: "Corflute", group: "Sign type", hint: "Fallback image for corrugated plastic." },
  { key: "pvc", label: "PVC / Foam", group: "Sign type", hint: "Fallback image for PVC and foam sheet." },
  { key: "banner", label: "Vinyl / Roll Stock", group: "Sign type", hint: "Fallback image for SAV, vinyl, banner and roll media." },
  { key: "other_sheet", label: "Other sheet", group: "Sign type", hint: "Only for sheet stock that does not belong to another category." },
  { key: "artwork_supplied", label: "Print-ready artwork supplied", group: "Artwork", hint: "Visual used for supplied print-ready artwork." },
  { key: "artwork_required", label: "Artwork / setup required", group: "Artwork", hint: "Visual used when artwork/setup work is required." }
];

const input: CSSProperties = { width: "100%", minHeight: 40, border: "1px solid #cbd5e1", borderRadius: 10, padding: "7px 10px", boxSizing: "border-box", background: "#fff" };
const button: CSSProperties = { minHeight: 38, border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 850, padding: "0 13px", cursor: "pointer" };

export function QuoteVisualCategoryManager({ images }: { images: QuoteVisualCategoryImages }) {
  return (
    <details style={{ border: "1px solid #dbeafe", borderRadius: 18, background: "#fff", padding: 14 }}>
      <summary style={{ cursor: "pointer", fontSize: 18, fontWeight: 900 }}>Quote wizard category images</summary>
      <p style={{ margin: "8px 0 14px", color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
        These images are fallbacks for the visual quote wizard. A material-specific image always wins. Upload the full subject. PM automatically prepares category images to the same 1:1 square quote-image standard.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 12 }}>
        {categories.map((category) => {
          const current = images[category.key];
          return (
            <form key={category.key} action={saveQuoteVisualCategoryImageAction} encType="multipart/form-data" style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, display: "grid", gap: 9, background: "#fbfdff" }}>
              <input type="hidden" name="categoryKey" value={category.key} />
              {current?.imageUrl ? <input type="hidden" name="existingCategoryImageUrl" value={current.imageUrl} /> : null}
              {current?.storagePath ? <input type="hidden" name="existingCategoryImageStoragePath" value={current.storagePath} /> : null}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 88, height: 88, border: "1px solid #dbe3ef", borderRadius: 10, background: "#f8fafc", overflow: "hidden", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
                  {current?.imageUrl ? <img src={current.imageUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} /> : <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>Default image</span>}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#2563eb", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em" }}>{category.group}</div>
                  <strong style={{ display: "block", marginTop: 2 }}>{category.label}</strong>
                  <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.35, marginTop: 3 }}>{category.hint}</div>
                </div>
              </div>
              <input name="categoryImageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif" onChange={(event) => { const inputElement = event.currentTarget; const file = inputElement.files?.[0]; if (!file) return; void normalizeQuoteImageFile(file).then((normalized) => { const transfer = new DataTransfer(); transfer.items.add(normalized); inputElement.files = transfer.files; }).catch(() => undefined); }} style={input} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                {current?.imageUrl ? <label style={{ display: "flex", gap: 7, alignItems: "center", color: "#b42318", fontSize: 11, fontWeight: 800 }}><input type="checkbox" name="removeCategoryImage" value="1" /> Remove custom image</label> : <span style={{ color: "#64748b", fontSize: 11 }}>Auto-normalised to 1:1 · max 10 MB</span>}
                <button type="submit" style={button}>Save image</button>
              </div>
            </form>
          );
        })}
      </div>
    </details>
  );
}
