import Link from "next/link";
import type { CSSProperties } from "react";

type Section = "operations" | "machines";

const steps: Array<{ section: Section; href: string; number: string; label: string; body: string }> = [
  { section: "operations", href: "/operations", number: "1", label: "Operations & labour", body: "The single manufacturing-cost source: optional machine + labour + consumable." },
  { section: "machines", href: "/machines", number: "2", label: "Machines", body: "Equipment rates, speed, setup, ink/click costs and physical limits." }
];

export function ProductionSetupNav({ active }: { active: Section }) {
  return (
    <section style={shell}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={eyebrow}>Settings · Production costing</div>
          <h1 style={{ margin: "5px 0 4px", fontSize: 34 }}>Production costing</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5, maxWidth: 820 }}>
            Keep pricing simple: a quote charges Materials + Operations + Extras + Services. An Operation may include one machine and its labour rule. Processes and Production Methods are no longer separate pricing layers.
          </p>
        </div>
        <Link prefetch={false} href="/settings" style={backLink}>← Settings</Link>
      </div>

      <nav className="production-setup-flow" style={flowGrid} aria-label="Production costing setup">
        {steps.map((step, index) => {
          const selected = step.section === active;
          return (
            <div key={step.section} style={{ display: "contents" }}>
              <Link href={step.href} prefetch={false} aria-current={selected ? "page" : undefined} style={{ textDecoration: "none", minWidth: 0 }}>
                <div style={{ ...flowCard, ...(selected ? activeFlowCard : {}) }}>
                  <span style={{ ...flowNumber, ...(selected ? activeFlowNumber : {}) }}>{step.number}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", color: "#0f172a" }}>{step.label}</strong>
                    <span style={{ display: "block", marginTop: 3, color: "#64748b", fontSize: 13, lineHeight: 1.4 }}>{step.body}</span>
                  </span>
                </div>
              </Link>
              {index < steps.length - 1 ? <div className="production-setup-arrow" style={flowArrow}>→</div> : null}
            </div>
          );
        })}
      </nav>

      <style>{`
        @media (max-width: 820px) {
          .production-setup-flow { grid-template-columns: 1fr !important; }
          .production-setup-arrow { display: none !important; }
        }
      `}</style>
    </section>
  );
}

const shell: CSSProperties = { display: "grid", gap: 15, border: "1px solid #dbe4f0", borderRadius: 18, background: "linear-gradient(135deg,#f8fbff,#ffffff)", padding: 18, boxShadow: "0 8px 24px rgba(15,23,42,.04)" };
const eyebrow: CSSProperties = { fontSize: 12, fontWeight: 950, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".07em" };
const backLink: CSSProperties = { textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#475569", padding: "9px 12px", fontWeight: 850 };
const flowGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gap: 10, alignItems: "stretch" };
const flowCard: CSSProperties = { height: "100%", boxSizing: "border-box", display: "flex", alignItems: "flex-start", gap: 11, border: "1px solid #dbe4f0", borderRadius: 14, padding: 14, background: "#fff", transition: "border-color .15s ease, background .15s ease" };
const activeFlowCard: CSSProperties = { borderColor: "#5eead4", background: "#f0fdfa", boxShadow: "0 4px 14px rgba(15,118,110,.06)" };
const flowNumber: CSSProperties = { width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center", flex: "0 0 30px", fontWeight: 950, background: "#e2e8f0", color: "#475569" };
const activeFlowNumber: CSSProperties = { background: "#0f766e", color: "#fff" };
const flowArrow: CSSProperties = { alignSelf: "center", color: "#94a3b8", fontSize: 24, fontWeight: 900 };
