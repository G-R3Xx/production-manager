export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getCompanySettingsByTenantId } from "@/server/company";
import { getQuoteDraftByPublicToken, listQuoteLines, markQuoteViewedByToken } from "@/server/quotes";
import { acceptQuoteAction, declineQuoteAction, requestQuoteChangesAction } from "./actions";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

const cardStyle = { background: "rgba(255,255,255,0.96)", border: "1px solid #dfe7f2", borderRadius: 26, padding: 22, boxShadow: "0 18px 48px rgba(15,23,42,0.06)" } as const;
const textareaStyle = { minHeight: 92, borderRadius: 14, border: "1px solid #cfd9e8", padding: "12px 14px", width: "100%", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" } as const;
const buttonStyle = { minHeight: 44, borderRadius: 14, border: "none", background: "#0f172a", color: "#fff", fontWeight: 950, cursor: "pointer", padding: "0 16px" } as const;

export default async function PublicQuotePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const message = readParam((await searchParams) ?? {}, "message");
  const quote = await getQuoteDraftByPublicToken(token);
  if (!quote) notFound();

  await markQuoteViewedByToken(token);

  const [lines, companySettings] = await Promise.all([
    listQuoteLines(quote.id),
    getCompanySettingsByTenantId(quote.tenantId)
  ]);
  const subtotal = lines.reduce((sum, line) => sum + parseMoney(line.lineTotal), 0);
  const gst = subtotal * 0.1;
  const total = subtotal + gst;
  const companyName = companySettings?.tradingName || companySettings?.companyLegalName || companySettings?.tenantName || "Production Manager";

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f8fbff,#eef2f7)", padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 18 }}>
        {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
        <section style={{ ...cardStyle, display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" }}>Quote from {companyName}</p>
            <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>{quote.quoteNumber ?? "Quote"}</h1>
            <p style={{ margin: 0, color: "#475467" }}>{quote.clientName}{quote.contactName ? ` · ${quote.contactName}` : ""}</p>
          </div>
          <span style={{ borderRadius: 999, background: "#eef4ff", color: "#3538cd", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{quote.status.replace(/_/g, " ")}</span>
        </section>

        <section style={{ ...cardStyle, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Quote details</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {lines.map((line) => (
              <div key={line.id} style={{ border: "1px solid #e4e7ec", borderRadius: 18, padding: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, background: "#fbfdff" }}>
                <div style={{ display: "grid", gap: 5 }}>
                  <strong>{line.productName}</strong>
                  {line.optionSummary ? <span style={{ color: "#667085", fontSize: 13 }}>{line.optionSummary}</span> : null}
                  {line.notes ? <span style={{ color: "#667085", fontSize: 13 }}>{line.notes}</span> : null}
                </div>
                <div style={{ textAlign: "right", display: "grid", gap: 4 }}>
                  <strong>{formatMoney(parseMoney(line.lineTotal))}</strong>
                  <span style={{ color: "#667085", fontSize: 13 }}>Qty {line.quantity} · {formatMoney(parseMoney(line.unitPrice))} ea</span>
                </div>
              </div>
            ))}
            {lines.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>This quote has no saved line items yet.</p> : null}
          </div>
          <div style={{ borderTop: "1px solid #e4e7ec", paddingTop: 14, display: "grid", justifyContent: "end", gap: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10 }}><span>Subtotal</span><strong style={{ textAlign: "right" }}>{formatMoney(subtotal)}</strong></div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10 }}><span>GST</span><strong style={{ textAlign: "right" }}>{formatMoney(gst)}</strong></div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 140px", gap: 10, fontSize: 22 }}><span>Total</span><strong style={{ textAlign: "right" }}>{formatMoney(total)}</strong></div>
          </div>
        </section>

        {quote.notes ? <section style={{ ...cardStyle, display: "grid", gap: 8 }}><h2 style={{ margin: 0 }}>Notes</h2><p style={{ margin: 0, color: "#475467", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{quote.notes}</p></section> : null}

        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0 }}>Respond to quote</h2>
          <p style={{ margin: 0, color: "#667085" }}>Accept this quote, request changes, or decline. Your response goes straight back to Production Manager.</p>
          <form action={acceptQuoteAction} style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="token" value={token} />
            <textarea name="notes" placeholder="Optional notes" style={textareaStyle} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" style={{ ...buttonStyle, background: "#067647" }}>Accept quote</button>
              <button formAction={requestQuoteChangesAction} type="submit" style={{ ...buttonStyle, background: "#c2410c" }}>Request changes</button>
              <button formAction={declineQuoteAction} type="submit" style={{ ...buttonStyle, background: "#b42318" }}>Decline</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
