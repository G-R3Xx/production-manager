"use client";

import { useMemo, useState } from "react";
import { pmsScreenSwatch, splitPmsColourEntries } from "@/lib/pmsColour";

function Swatch({ value }: { value: string }) {
  const swatch = useMemo(() => pmsScreenSwatch(value), [value]);
  return (
    <span
      aria-hidden="true"
      title={swatch.hex ? `${swatch.label || "PMS colour"} · screen approximation ${swatch.hex}` : "Enter a recognised PMS / Pantone code"}
      style={{
        width: 28,
        height: 28,
        flex: "0 0 auto",
        borderRadius: 7,
        border: "1px solid #98a2b3",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.65)",
        background: swatch.hex
          ? swatch.hex
          : "repeating-linear-gradient(135deg,#f2f4f7 0,#f2f4f7 5px,#d0d5dd 5px,#d0d5dd 10px)",
      }}
    />
  );
}

export function PmsColourFields({ value }: { value: string }) {
  const initial = splitPmsColourEntries(value);
  const [entries, setEntries] = useState<string[]>(initial.length ? initial : [""]);

  function update(index: number, next: string) {
    setEntries((current) => current.map((entry, entryIndex) => entryIndex === index ? next : entry));
  }

  function remove(index: number) {
    setEntries((current) => {
      const next = current.filter((_, entryIndex) => entryIndex !== index);
      return next.length ? next : [""];
    });
  }

  return (
    <div style={{ display: "grid", gap: 7 }}>
      <span style={{ color: "#344054", fontSize: 10, fontWeight: 950 }}>Required PMS colours</span>
      <div style={{ display: "grid", gap: 6 }}>
        {entries.map((entry, index) => (
          <div key={index} style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr) auto", gap: 7, alignItems: "center" }}>
            <Swatch value={entry} />
            <input
              name="pmsColour"
              value={entry}
              onChange={(event) => update(index, event.target.value)}
              placeholder={index === 0 ? "e.g. PMS 557 C" : "e.g. PMS 186 C"}
              autoComplete="off"
              style={{ width: "100%", minHeight: 36, border: "1px solid #cbd5e1", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#101828", fontSize: 11, boxSizing: "border-box" }}
            />
            {entries.length > 1 ? (
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remove PMS colour ${index + 1}`}
                title="Remove colour"
                style={{ width: 32, minHeight: 32, border: "1px solid #fecdca", borderRadius: 9, background: "#fff", color: "#b42318", fontWeight: 950, cursor: "pointer" }}
              >×</button>
            ) : <span style={{ width: 32 }} />}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setEntries((current) => [...current, ""])}
        style={{ justifySelf: "start", minHeight: 30, border: "1px solid #b2ccff", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#175cd3", fontSize: 10, fontWeight: 950, cursor: "pointer" }}
      >+ Add PMS colour</button>
      <span style={{ color: "#667085", fontSize: 9.5, lineHeight: 1.3 }}>One PMS / Pantone reference per field. A short colour name can be added after the code, for example “PMS 557 C – Sage”.</span>
    </div>
  );
}
