import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "40px",
        background: "#f6f8fb"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)"
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4f46e5" }}>
          Production Manager
        </p>

        <h1 style={{ marginTop: 12, marginBottom: 12, fontSize: 40, lineHeight: 1.1 }}>
          Fresh rebuild, clean architecture, multi-tenant from day one.
        </h1>

        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: "#475467", maxWidth: 760 }}>
          The tenant-aware app shell is now live with bootstrap, company settings, users, and active tenant switching.
        </p>

        <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/sign-in" style={{ textDecoration: "none", padding: "12px 16px", borderRadius: 12, background: "#111827", color: "#fff", fontWeight: 600 }}>
            Go to sign in
          </Link>

          <Link href="/dashboard" style={{ textDecoration: "none", padding: "12px 16px", borderRadius: 12, background: "#fff", color: "#111827", fontWeight: 600, border: "1px solid #d0d5dd" }}>
            Open dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
