export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCompanySettingsByTenantId } from "@/server/company";
import { getArtworkApprovalByPublicToken, listArtworkApprovalPages, markArtworkApprovalViewedByToken } from "@/server/quotes";
import { approveArtworkAction, requestArtworkChangesAction } from "./actions";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const cardStyle = { background: "rgba(255,255,255,0.96)", border: "1px solid #e9d5ff", borderRadius: 26, padding: 22, boxShadow: "0 18px 48px rgba(88,28,135,0.08)" } as const;
const textareaStyle = { minHeight: 92, borderRadius: 14, border: "1px solid #ddd6fe", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 14, border: "none", background: "#6d28d9", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 16px" } as const;

export default async function PublicArtworkApprovalPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const message = readParam((await searchParams) ?? {}, "message");
  const approval = await getArtworkApprovalByPublicToken(token);
  if (!approval) notFound();

  await markArtworkApprovalViewedByToken(token);

  const [pages, companySettings] = await Promise.all([
    listArtworkApprovalPages(approval.id),
    getCompanySettingsByTenantId(approval.tenantId)
  ]);
  const companyName = companySettings?.tradingName || companySettings?.companyLegalName || companySettings?.tenantName || "Production Manager";

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg,#fbf8ff,#f3e8ff)", padding: 24 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 18 }}>
        {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
        <section style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7c3aed" }}>Artwork approval from {companyName}</p>
            <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>{approval.clientName}</h1>
            <p style={{ margin: 0, color: "#667085" }}>Please review the proof pages below.</p>
          </div>
          <span style={{ borderRadius: 999, background: "#f5f3ff", color: "#6d28d9", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{approval.status.replace(/_/g, " ")}</span>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          {pages.map((page, index) => (
            <article key={page.id} style={{ ...cardStyle, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>{index + 1}. {page.title}</h2>
                <a href={page.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#6d28d9", fontWeight: 900 }}>Open full size</a>
              </div>
              <img src={page.imageUrl} alt={page.title} style={{ width: "100%", maxHeight: 680, objectFit: "contain", borderRadius: 18, border: "1px solid #e9d5ff", background: "#fff" }} />
              {page.notes ? <p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{page.notes}</p> : null}
            </article>
          ))}
          {pages.length === 0 ? <section style={cardStyle}><p style={{ margin: 0, color: "#667085" }}>No proof pages have been added yet.</p></section> : null}
        </section>

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0 }}>Respond to artwork</h2>
          <p style={{ margin: 0, color: "#667085" }}>Approve the artwork or request changes. Your response goes straight back to Production Manager.</p>
          <form action={approveArtworkAction} style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="token" value={token} />
            <textarea name="notes" placeholder="Optional notes" style={textareaStyle} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" style={{ ...buttonStyle, background: "#067647" }}>Approve artwork</button>
              <button formAction={requestArtworkChangesAction} type="submit" style={{ ...buttonStyle, background: "#c2410c" }}>Request changes</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
