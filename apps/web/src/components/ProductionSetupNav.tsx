import Link from "next/link";
import type { CSSProperties } from "react";

type Section = "operations" | "machines";

export function ProductionSetupNav({ active: _active }: { active: Section }) {
  return (
    <section style={shell}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={eyebrow}>Settings · Production costing</div>
          <h1 style={{ margin: "5px 0 4px", fontSize: 34 }}>Production costing</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5, maxWidth: 920 }}>
            Materials + Production Steps + Extras + Services. Production Steps are the only manufacturing-cost setup staff need to manage. Equipment is a supporting resource; labour rates live in Staff / Company settings.
          </p>
        </div>
        <Link prefetch={false} href="/settings" style={backLink}>← Settings</Link>
      </div>
    </section>
  );
}

const shell: CSSProperties = { display: "grid", gap: 15, border: "1px solid #dbe4f0", borderRadius: 18, background: "linear-gradient(135deg,#f8fbff,#ffffff)", padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,.04)" };
const eyebrow: CSSProperties = { fontSize: 12, fontWeight: 950, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".07em" };
const backLink: CSSProperties = { textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#475569", padding: "9px 12px", fontWeight: 850 };
