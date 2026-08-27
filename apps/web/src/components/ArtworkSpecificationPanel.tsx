import type { CSSProperties, ReactNode } from "react";
import { pmsScreenSwatches } from "@/lib/pmsColour";

export type ArtworkSpecificationIcon =
  | "substrate"
  | "colour"
  | "print"
  | "laminate"
  | "backing"
  | "cut"
  | "mounting"
  | "pickup"
  | "delivery"
  | "install"
  | "size"
  | "quantity"
  | "finish";

export type ArtworkSpecificationItem = {
  key: string;
  label: string;
  value: string;
  detail?: string | null;
  icon: ArtworkSpecificationIcon;
};

export type ArtworkSpecificationSnapshot = {
  version: 1;
  capturedAt: string;
  sourceQuoteLineId?: string | null;
  sourceLineUpdatedAt?: string | null;
  items: ArtworkSpecificationItem[];
};

function iconStroke(children: ReactNode) {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function SpecIcon({ icon }: { icon: ArtworkSpecificationIcon }) {
  if (icon === "substrate") return iconStroke(<><path d="M7 18 24 9l17 9-17 9L7 18Z"/><path d="m10 24 14 7 14-7"/><path d="m10 30 14 7 14-7"/></>);
  if (icon === "colour") return iconStroke(<><circle cx="16" cy="17" r="7"/><circle cx="30" cy="17" r="7"/><circle cx="23" cy="30" r="7"/><path d="M10 40h27"/></>);
  if (icon === "print") return iconStroke(<><path d="M12 10h24v9H12z"/><path d="M8 20h32a3 3 0 0 1 3 3v10H5V23a3 3 0 0 1 3-3Z"/><path d="M12 29h24v9H12z"/><path d="M35 25h2"/></>);
  if (icon === "laminate") return iconStroke(<><circle cx="13" cy="15" r="6"/><path d="M19 15h17a5 5 0 0 1 5 5v3"/><path d="M8 26h29v12H8z"/><path d="M13 21v5"/></>);
  if (icon === "backing") return iconStroke(<><path d="M8 12h27v20H8z"/><path d="m14 36 26-20"/><path d="M35 12h5v5"/><path d="M8 32v5h5"/></>);
  if (icon === "cut") return iconStroke(<><path d="M8 31c7-10 13-15 21-15 4 0 8 2 11 5" strokeDasharray="4 4"/><path d="M30 10 18 37"/><path d="M25 11h10l-5 8"/></>);
  if (icon === "mounting") return iconStroke(<><path d="M6 24h12"/><path d="M30 24h12"/><circle cx="24" cy="24" r="6"/><path d="M18 20 12 15M18 28l-6 5M30 20l6-5M30 28l6 5"/></>);
  if (icon === "pickup") return iconStroke(<><path d="M9 14h21v18H9z"/><path d="m9 20 10 6 11-6"/><path d="M35 12v23"/><path d="m30 30 5 5 5-5"/></>);
  if (icon === "delivery") return iconStroke(<><path d="M5 14h23v19H5z"/><path d="M28 20h8l7 7v6H28z"/><circle cx="14" cy="35" r="4"/><circle cx="36" cy="35" r="4"/><path d="M31 24h7"/></>);
  if (icon === "install") return iconStroke(<><path d="M11 37 36 12"/><path d="m30 9 9 9"/><path d="M8 31l9 9"/><path d="M13 16h11v11"/><path d="M9 20h4M20 9v4"/></>);
  if (icon === "size") return iconStroke(<><path d="M9 13h30v22H9z"/><path d="M9 7v4M39 7v4M13 8h22"/><path d="m16 5-3 3 3 3M32 5l3 3-3 3"/><path d="M43 15h-3M43 33h-3M42 18v12"/><path d="m39 21 3-3 3 3M39 27l3 3 3-3"/></>);
  if (icon === "quantity") return iconStroke(<><path d="M10 12h24v18H10z"/><path d="M15 17h24v18H15z"/><path d="M20 22h18v14H20z"/></>);
  return iconStroke(<><path d="M9 10h30v28H9z"/><path d="M15 18h18M15 24h18M15 30h12"/></>);
}

export function ArtworkSpecificationPanel({
  items,
  title = "Sign specification",
  compact = false,
  style,
}: {
  items: ArtworkSpecificationItem[];
  title?: string;
  compact?: boolean;
  style?: CSSProperties;
}) {
  if (!items.length) return null;

  return (
    <section style={{ border: "1px solid #d0d5dd", borderRadius: compact ? 13 : 16, background: "#fff", overflow: "hidden", ...style }}>
      <div style={{ padding: compact ? "9px 11px" : "11px 13px", borderBottom: "1px solid #d0d5dd", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <strong style={{ fontSize: compact ? 11 : 12, textTransform: "uppercase", letterSpacing: "0.075em", color: "#101828" }}>{title}</strong>
        <span style={{ fontSize: 9, fontWeight: 900, color: "#98a2b3", textTransform: "uppercase", letterSpacing: "0.06em" }}>Approval specification</span>
      </div>
      <div>
        {items.map((item, index) => (
          <div key={`${item.key}-${index}`} style={{ display: "grid", gridTemplateColumns: compact ? "46px minmax(0,1fr)" : "54px minmax(0,1fr)", minHeight: compact ? 52 : 60, borderTop: index ? "1px dotted #cbd5e1" : undefined }}>
            <div style={{ display: "grid", placeItems: "center", color: "#101828", borderRight: "1px dotted #cbd5e1", padding: 6 }}><SpecIcon icon={item.icon} /></div>
            <div style={{ padding: compact ? "8px 10px" : "9px 11px", minWidth: 0, display: "grid", alignContent: "center", gap: 2 }}>
              <span style={{ color: "#667085", fontSize: 8.5, lineHeight: 1.1, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.075em" }}>{item.label}</span>
              {item.key === "colour" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 6 : 8, marginTop: 2 }}>
                  {pmsScreenSwatches(item.value).map((swatch, swatchIndex) => (
                    <span key={`${swatch.label}-${swatchIndex}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: compact ? 10.5 : 11.5, lineHeight: 1.25, fontWeight: 900, color: "#101828" }}>
                      <span
                        aria-hidden="true"
                        title={swatch.hex ? `${swatch.label} · screen approximation ${swatch.hex}` : `${swatch.label} · PMS code is the approval reference`}
                        style={{
                          width: compact ? 20 : 23,
                          height: compact ? 20 : 23,
                          flex: "0 0 auto",
                          borderRadius: 5,
                          border: "1px solid #98a2b3",
                          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.55)",
                          background: swatch.hex
                            ? swatch.hex
                            : "repeating-linear-gradient(135deg,#f2f4f7 0,#f2f4f7 5px,#d0d5dd 5px,#d0d5dd 10px)",
                        }}
                      />
                      <span style={{ overflowWrap: "anywhere" }}>{swatch.label}</span>
                    </span>
                  ))}
                </div>
              ) : <strong style={{ color: "#101828", fontSize: compact ? 11 : 12, lineHeight: 1.3, overflowWrap: "anywhere" }}>{item.value}</strong>}
              {item.detail ? <span style={{ color: "#667085", fontSize: 9.5, lineHeight: 1.3, overflowWrap: "anywhere" }}>{item.detail}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
