import type { CSSProperties } from "react";

type RouteLoadingShellProps = {
  title?: string;
  subtitle?: string;
  cards?: number;
};

const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 24,
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
        @keyframes pm-route-logo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; filter: drop-shadow(0 14px 28px rgba(109, 40, 217, 0.16)); }
          50% { transform: scale(1.04); opacity: 1; filter: drop-shadow(0 20px 38px rgba(109, 40, 217, 0.28)); }
        }
        @keyframes pm-loading-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
      <section style={{ ...cardStyle, minHeight: 250, display: "grid", placeItems: "center", textAlign: "center", gap: 14, background: "linear-gradient(135deg, #ffffff 0%, #faf5ff 56%, #eef4ff 100%)" }}>
        <img
          src="/brand/production-manager-logo.svg"
          alt="Production Manager"
          style={{ width: 260, maxWidth: "78%", height: "auto", display: "block", animation: "pm-route-logo-pulse 1.05s ease-in-out infinite" }}
        />
        <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6d28d9" }}>I&apos;m loading</p>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.04em" }}>{title}</h1>
          <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>{subtitle}</p>
          <div style={{ display: "inline-flex", gap: 6, marginTop: 3 }} aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#6d28d9",
                  animation: "pm-loading-dot 1s ease-in-out infinite",
                  animationDelay: `${index * 0.12}s`
                }}
              />
            ))}
          </div>
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
