export default function ArtworkApprovalsLoading() {
  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", display: "grid", gap: 18 }}>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff", padding: 18 }}>
        <div style={{ height: 16, width: 160, borderRadius: 999, background: "#ede9fe" }} />
        <div style={{ height: 42, width: "55%", borderRadius: 14, background: "#f1f5f9", marginTop: 14 }} />
        <div style={{ height: 18, width: "75%", borderRadius: 999, background: "#f8fafc", marginTop: 12 }} />
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 16 }}>
        <section style={{ height: 520, border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff" }} />
        <section style={{ height: 620, border: "1px solid #e5e7eb", borderRadius: 24, background: "#fff" }} />
      </div>
    </div>
  );
}
