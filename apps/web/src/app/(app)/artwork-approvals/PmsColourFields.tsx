"use client";

import { useMemo, useState } from "react";
import {
  PMS_SOLID_COATED_COUNT,
  pmsScreenSwatch,
  searchPmsColours,
  splitPmsColourEntries,
  type PmsColourOption,
} from "@/lib/pmsColour";

function Swatch({ value, size = 28 }: { value: string; size?: number }) {
  const swatch = useMemo(() => pmsScreenSwatch(value), [value]);
  return (
    <span
      aria-hidden="true"
      title={swatch.hex ? `${swatch.canonicalLabel || swatch.label || "PMS colour"} · screen approximation ${swatch.hex}` : "Type or choose a PMS Solid Coated reference"}
      style={{ width: size, height: size, flex: "0 0 auto", borderRadius: 7, border: "1px solid #98a2b3", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.65)", background: swatch.hex ? swatch.hex : "repeating-linear-gradient(135deg,#f2f4f7 0,#f2f4f7 5px,#d0d5dd 5px,#d0d5dd 10px)" }}
    />
  );
}

function PmsEntryField({ value, index, onChange, onRemove, removable }: { value: string; index: number; onChange: (value: string) => void; onRemove: () => void; removable: boolean }) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => searchPmsColours(value), [value]);
  const recognised = useMemo(() => pmsScreenSwatch(value), [value]);

  function choose(option: PmsColourOption) {
    onChange(option.label);
    setOpen(false);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr) auto", gap: 7, alignItems: "start" }}>
      <div style={{ paddingTop: 4 }}><Swatch value={value} /></div>
      <div style={{ position: "relative", minWidth: 0 }}>
        <input
          name="pmsColour"
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={index === 0 ? "Type PMS number, e.g. 557" : "Type another PMS colour"}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={`pms-options-${index}`}
          style={{ width: "100%", minHeight: 38, border: recognised.hex ? "1px solid #84adff" : "1px solid #cbd5e1", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#101828", fontSize: 11, fontWeight: 750, boxSizing: "border-box", outline: "none" }}
        />
        {open && value.trim() && suggestions.length ? (
          <div id={`pms-options-${index}`} role="listbox" style={{ position: "absolute", zIndex: 40, left: 0, right: 0, top: "calc(100% + 4px)", maxHeight: 270, overflowY: "auto", border: "1px solid #b2ccff", borderRadius: 10, background: "#fff", boxShadow: "0 12px 28px rgba(16,24,40,0.16)", padding: 4 }}>
            {suggestions.map((option) => (
              <button key={option.code} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} style={{ width: "100%", border: 0, borderRadius: 7, background: "transparent", padding: "6px 7px", display: "flex", alignItems: "center", gap: 8, textAlign: "left", color: "#101828", cursor: "pointer" }}>
                <span aria-hidden="true" style={{ width: 24, height: 24, flex: "0 0 auto", borderRadius: 6, border: "1px solid #98a2b3", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.65)", background: option.hex }} />
                <span style={{ minWidth: 0, display: "grid", gap: 1 }}>
                  <strong style={{ fontSize: 11 }}>{option.label}</strong>
                  <span style={{ color: "#667085", fontSize: 9.5 }}>{option.hex}{option.metallic ? " · metallic screen guide" : " · RGB screen guide"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {value.trim() && recognised.canonicalLabel ? <span style={{ display: "block", marginTop: 3, color: "#475467", fontSize: 9.5 }}>Matched: <strong>{recognised.canonicalLabel}</strong></span> : null}
      </div>
      {removable ? <button type="button" onClick={onRemove} aria-label={`Remove PMS colour ${index + 1}`} title="Remove colour" style={{ width: 32, minHeight: 32, marginTop: 3, border: "1px solid #fecdca", borderRadius: 9, background: "#fff", color: "#b42318", fontWeight: 950, cursor: "pointer" }}>×</button> : <span style={{ width: 32 }} />}
    </div>
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ color: "#344054", fontSize: 10, fontWeight: 950 }}>Required PMS colours</span>
        <span style={{ color: "#667085", fontSize: 9 }}>Search {PMS_SOLID_COATED_COUNT.toLocaleString()} bundled Solid Coated references</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {entries.map((entry, index) => <PmsEntryField key={index} value={entry} index={index} onChange={(next) => update(index, next)} onRemove={() => remove(index)} removable={entries.length > 1} />)}
      </div>
      <button type="button" onClick={() => setEntries((current) => [...current, ""])} style={{ justifySelf: "start", minHeight: 30, border: "1px solid #b2ccff", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#175cd3", fontSize: 10, fontWeight: 950, cursor: "pointer" }}>+ Add PMS colour</button>
      <span style={{ color: "#667085", fontSize: 9.5, lineHeight: 1.3 }}>Start typing a PMS number or name and choose the matching Solid Coated colour. Each approved PMS reference remains its own field; swatches are RGB screen guides only.</span>
    </div>
  );
}
