export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "40px"
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
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#4f46e5"
          }}
        >
          Production Manager
        </p>

        <h1
          style={{
            marginTop: 12,
            marginBottom: 12,
            fontSize: 40,
            lineHeight: 1.1
          }}
        >
          Fresh rebuild, clean architecture, multi-tenant from day one.
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: 1.6,
            color: "#475467",
            maxWidth: 760
          }}
        >
          This codebase is being rebuilt around Next.js, Postgres, Supabase, and
          Cloud Run with a server-first architecture for quoting, configurators,
          proofs, purchasing, stock, jobs, suppliers, users, and MYOB
          integration.
        </p>

        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16
          }}
        >
          {[
            "Auth + tenancy",
            "Configurator engine",
            "Quote snapshots",
            "Proof approvals",
            "Purchasing + stock",
            "MYOB sync"
          ].map((item) => (
            <div
              key={item}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                padding: 16,
                background: "#fafafa",
                fontWeight: 600
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
