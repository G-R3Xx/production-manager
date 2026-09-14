import Link from "next/link";
import type { CSSProperties } from "react";

type Section = "resources" | "processes" | "methods";

const tabs: Array<{ section: Section; href: string; label: string; body: string }> = [
  { section: "resources", href: "/machines", label: "Resources", body: "Machines + labour" },
  { section: "processes", href: "/processes", label: "Processes", body: "One reusable action" },
  { section: "methods", href: "/manufacturing-methods", label: "Production methods", body: "Ordered recipes" }
];

export function ProductionSetupNav({ active }: { active: Section }) {
  return (
    <section style={shell}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={eyebrow}>Settings · Production setup</div>
          <h1 style={{ margin: "5px 0 4px", fontSize: 34 }}>Production setup</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5, maxWidth: 780 }}>
            One setup flow: define the resources you own, connect them to a process once, then combine processes into reusable production methods.
          </p>
        </div>
        <Link href="/settings" style={backLink}>← Settings</Link>
      </div>
      <nav style={tabGrid} aria-label="Production setup sections">
        {tabs.map((tab) => {
          const selected = tab.section === active;
          return (
            <Link key={tab.section} href={tab.href} style={{ ...tabCard, ...(selected ? activeTab : {}) }}>
              <strong style={{ fontSize: 15, color: selected ? "#0f172a" : "#475569" }}>{tab.label}</strong>
              <span style={{ fontSize: 11, color: selected ? "#2563eb" : "#94a3b8", fontWeight: 800 }}>{tab.body}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

const shell: CSSProperties = {
  display: "grid",
  gap: 15,
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  background: "linear-gradient(135deg,#f8fbff,#ffffff)",
  padding: 18,
  boxShadow: "0 8px 24px rgba(15,23,42,.04)"
};
const eyebrow: CSSProperties = { fontSize: 12, fontWeight: 950, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".07em" };
const backLink: CSSProperties = { textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 11, background: "#fff", color: "#475569", padding: "9px 12px", fontWeight: 850 };
const tabGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, padding: 6, borderRadius: 14, background: "#e9eef6" };
const tabCard: CSSProperties = { textDecoration: "none", display: "grid", gap: 2, borderRadius: 10, padding: "10px 12px", minWidth: 0 };
const activeTab: CSSProperties = { background: "#fff", boxShadow: "0 4px 14px rgba(15,23,42,.08)", border: "1px solid #bfdbfe" };
