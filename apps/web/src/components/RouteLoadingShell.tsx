import type { CSSProperties } from "react";

type RouteLoadingShellProps = {
  title?: string;
  subtitle?: string;
  cards?: number;
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 20,
  padding: 22,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)"
};

const shimmerStyle: CSSProperties = {
  background: "linear-gradient(90deg, #eef2f7 0%, #f8fafc 48%, #eef2f7 100%)",
  backgroundSize: "220% 100%",
  borderRadius: 999,
  animation: "pm-loading-shimmer 1.3s ease-in-out infinite"
};

function Line({ width = "100%", height = 12 }: { width?: string; height?: number }) {
  return <div style={{ ...shimmerStyle, width, height }} />;
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <section style={{ ...cardStyle, display: "grid", gap: 14 }} aria-hidden="true">
      <Line width={index % 2 === 0 ? "34%" : "46%"} height={12} />
      <Line width="72%" height={24} />
      <Line width="100%" />
      <Line width="88%" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginTop: 4 }}>
        <Line height={34} />
        <Line height={34} />
        <Line height={34} />
      </div>
    </section>
  );
}

export function RouteLoadingShell({
  title = "Loading",
  subtitle = "Fetching the latest workspace data…",
  cards = 4
}: RouteLoadingShellProps) {
  return (
    <div style={{ maxWidth: 1360, margin: "0 auto", display: "grid", gap: 16, minWidth: 0 }} role="status" aria-live="polite">
      <style>{`
        @keyframes pm-loading-shimmer {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
      `}</style>
      <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 6,
            borderRadius: 999,
            background: "#4f46e5"
          }}
        />
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
            Please wait
          </p>
          <h1 style={{ margin: "10px 0 8px", fontSize: 32 }}>{title}</h1>
          <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>{subtitle}</p>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {Array.from({ length: Math.min(Math.max(cards, 1), 6) }).map((_, index) => (
          <SkeletonCard key={index} index={index} />
        ))}
      </section>
    </div>
  );
}
