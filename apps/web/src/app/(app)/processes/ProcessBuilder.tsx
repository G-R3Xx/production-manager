"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { createProcessAction } from "./actions";

export type LabourOption = {
  id: string;
  name: string;
  department: string;
  active: boolean;
};

const presets = [
  {
    id: "direct-print",
    icon: "▣",
    name: "Direct print",
    processType: "print",
    description: "Print directly onto a sheet or rigid substrate."
  },
  {
    id: "roll-print",
    icon: "◫",
    name: "Roll print",
    processType: "print",
    description: "Print vinyl, banner or another roll material."
  },
  {
    id: "laminate",
    icon: "▤",
    name: "Laminate",
    processType: "laminate",
    description: "Apply a protective or finishing laminate."
  },
  {
    id: "trim-cut",
    icon: "✂",
    name: "Trim / cut",
    processType: "cut",
    description: "Trim, contour cut, router cut or cut to shape."
  },
  {
    id: "mount-apply",
    icon: "▱",
    name: "Mount / apply",
    processType: "mount",
    description: "Apply a print or vinyl to another substrate."
  },
  {
    id: "finishing",
    icon: "✦",
    name: "Finishing",
    processType: "finish",
    description: "Eyelets, hems, drilling, tape or other finishing."
  },
  {
    id: "pack",
    icon: "□",
    name: "Pack",
    processType: "pack",
    description: "Wrap, label and prepare the completed job."
  },
  {
    id: "install",
    icon: "⌂",
    name: "Install",
    processType: "install",
    description: "Install client-supplied or manufactured signage on site."
  },
  {
    id: "custom",
    icon: "+",
    name: "",
    processType: "other",
    description: "Create a different production step."
  }
] as const;

const departments = [
  { value: "signage", label: "Signage" },
  { value: "small_format", label: "Small format" },
  { value: "plan_printing", label: "Plan printing" },
  { value: "displays", label: "Displays" },
  { value: "vehicle_graphics", label: "Vehicle graphics" },
  { value: "general", label: "General / service" }
];

const processTypes = [
  { value: "print", label: "Printing" },
  { value: "laminate", label: "Laminating" },
  { value: "cut", label: "Cutting / trimming" },
  { value: "mount", label: "Mounting / application" },
  { value: "finish", label: "Finishing" },
  { value: "pack", label: "Packing" },
  { value: "install", label: "Installation" },
  { value: "other", label: "Other" }
];

export function ProcessBuilder({ labour }: { labour: LabourOption[] }) {
  const [selectedPreset, setSelectedPreset] = useState("direct-print");
  const [name, setName] = useState("Direct print");
  const [processType, setProcessType] = useState("print");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selected = useMemo(
    () => presets.find((preset) => preset.id === selectedPreset) ?? presets[0],
    [selectedPreset]
  );

  function choosePreset(id: string) {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setSelectedPreset(id);
    setName(preset.name);
    setProcessType(preset.processType);
    setShowAdvanced(id === "custom");
  }

  return (
    <form action={createProcessAction} style={{ display: "grid", gap: 22 }}>
      <input type="hidden" name="processType" value={processType} />

      <div>
        <div style={stepLabel}>1 · What happens to the job?</div>
        <h2 style={{ margin: "6px 0 8px", fontSize: 25 }}>Choose a common production step</h2>
        <p style={helpText}>A step is one action. You will put several steps together later when creating a manufacturing method.</p>
        <div style={presetGrid}>
          {presets.map((preset) => {
            const active = preset.id === selectedPreset;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => choosePreset(preset.id)}
                aria-pressed={active}
                style={{
                  ...presetCard,
                  borderColor: active ? "#0f766e" : "#dbe4f0",
                  background: active ? "#f0fdfa" : "#fff",
                  boxShadow: active ? "0 0 0 3px rgba(15,118,110,.12)" : "none"
                }}
              >
                <span style={{ ...presetIcon, color: active ? "#0f766e" : "#475569" }}>{preset.icon}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 16, color: "#0f172a" }}>{preset.name || "Custom step"}</strong>
                  <span style={{ display: "block", marginTop: 4, color: "#64748b", lineHeight: 1.35, fontSize: 13 }}>{preset.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={divider} />

      <div>
        <div style={stepLabel}>2 · Name it and choose where it belongs</div>
        <div style={formGrid}>
          <label style={fieldLabel}>
            Step name
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={selected.id === "custom" ? "e.g. Weld frame" : undefined}
              required
              style={inputStyle}
            />
            <span style={fieldHelp}>Use the wording staff should see on production jobs.</span>
          </label>
          <label style={fieldLabel}>
            Work area
            <select name="department" defaultValue="signage" style={inputStyle}>
              {departments.map((department) => (
                <option key={department.value} value={department.value}>{department.label}</option>
              ))}
            </select>
            <span style={fieldHelp}>This keeps step choices relevant when building products.</span>
          </label>
        </div>
      </div>

      <div style={divider} />

      <div>
        <div style={stepLabel}>3 · Does this step normally need staff time?</div>
        <div style={formGrid}>
          <label style={fieldLabel}>
            Default labour task <span style={{ color: "#94a3b8", fontWeight: 700 }}>(optional)</span>
            <select name="labourOperationId" defaultValue="" style={inputStyle}>
              <option value="">No default labour</option>
              {labour.filter((row) => row.active).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
            <span style={fieldHelp}>Choose labour only when hands-on staff time should be costed automatically. Machine cost is linked separately on the Machines page.</span>
          </label>
          <div style={explanationCard}>
            <strong style={{ color: "#0f172a" }}>Example</strong>
            <span style={{ color: "#475569", lineHeight: 1.5 }}>
              “Direct print” may use a printer machine with no default labour. “Eyelets” may use a finishing labour task so staff time is included.
            </span>
          </div>
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setShowAdvanced((value) => !value)} style={textButton}>
          {showAdvanced ? "Hide advanced category" : "Advanced: change step category"}
        </button>
        {showAdvanced ? (
          <label style={{ ...fieldLabel, maxWidth: 420, marginTop: 10 }}>
            Step category
            <select value={processType} onChange={(event) => setProcessType(event.target.value)} style={inputStyle}>
              {processTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <span style={fieldHelp}>This helps machines and costing rules understand the kind of work being performed.</span>
          </label>
        ) : null}
      </div>

      <div style={reviewBar}>
        <div>
          <div style={{ fontSize: 12, color: "#0f766e", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em" }}>Ready to add</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{name || "Name your production step"}</div>
          <div style={{ marginTop: 3, color: "#64748b", fontSize: 13 }}>{selected.description}</div>
        </div>
        <button type="submit" disabled={!name.trim()} style={{ ...primaryButton, opacity: name.trim() ? 1 : 0.45 }}>
          Add production step
        </button>
      </div>
    </form>
  );
}

const stepLabel: CSSProperties = { color: "#0f766e", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".07em" };
const helpText: CSSProperties = { margin: 0, color: "#64748b", lineHeight: 1.55 };
const presetGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 16 };
const presetCard: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", border: "1px solid #dbe4f0", borderRadius: 14, padding: 14, cursor: "pointer", minHeight: 96, font: "inherit" };
const presetIcon: CSSProperties = { width: 34, height: 34, flex: "0 0 34px", borderRadius: 10, display: "grid", placeItems: "center", background: "#f1f5f9", fontSize: 18, fontWeight: 950 };
const divider: CSSProperties = { height: 1, background: "#e2e8f0" };
const formGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, marginTop: 12 };
const fieldLabel: CSSProperties = { display: "grid", gap: 7, color: "#0f172a", fontWeight: 850 };
const fieldHelp: CSSProperties = { color: "#64748b", fontSize: 12, fontWeight: 500, lineHeight: 1.45 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 46, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 12px", font: "inherit", color: "#0f172a", background: "#fff" };
const explanationCard: CSSProperties = { display: "grid", alignContent: "center", gap: 5, border: "1px solid #bae6fd", background: "#f0f9ff", borderRadius: 12, padding: 14 };
const textButton: CSSProperties = { border: 0, background: "transparent", color: "#0f766e", fontWeight: 850, cursor: "pointer", padding: 0, font: "inherit" };
const reviewBar: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", padding: 16, borderRadius: 14, border: "1px solid #99f6e4", background: "linear-gradient(135deg,#f0fdfa,#ecfeff)" };
const primaryButton: CSSProperties = { minHeight: 46, border: 0, borderRadius: 11, background: "#0f766e", color: "#fff", fontWeight: 950, padding: "0 20px", cursor: "pointer", font: "inherit" };
