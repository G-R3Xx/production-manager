import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { canViewQuoteCostBreakdown } from "@/server/users";
import { getQuoteDraftById, listQuoteLines } from "@/server/quotes";
import { buildQuoteCostReport, COST_CATEGORIES } from "@/lib/quote-cost-report";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const preferredRegion = "syd1";

type Props = { params: Promise<{ id: string }> };
const money = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const decimal = (value: number) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: 4 }).format(value);
const table = { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 };
const cell = { borderBottom: "1px solid #e2e8f0", padding: "7px 8px", textAlign: "left" as const, verticalAlign: "top" as const };

export default async function QuoteCostBreakdownPage({ params }: Props) {
  const authUser = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(authUser.id);
  if (!tenant || tenant.membershipStatus !== "active") redirect("/bootstrap");

  // Permission is read from the DB on every request. Hiding the button alone is NOT security.
  // Deny before loading the quote, including guessed URLs and direct requests.
  if (!(await canViewQuoteCostBreakdown(tenant.tenantId, tenant.userProfileId))) notFound();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const quote = await getQuoteDraftById(tenant.tenantId, id);
  if (!quote || quote.status === "deleted") notFound();
  const lines = await listQuoteLines(quote.id);
  const report = buildQuoteCostReport(lines);

  return (
    <main style={{ padding: "24px 18px", maxWidth: 1220, margin: "0 auto", background: "#fff", color: "#0f172a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontSize: 25, margin: 0 }}>Internal quote cost breakdown</h1>
        <Link prefetch={false} href={`/quotes?selected=${encodeURIComponent(quote.id)}`} style={{ color: "#1d4ed8" }}>Back to quote</Link>
      </div>
      <p style={{ margin: "8px 0 16px", fontSize: 14 }}><strong>Confidential — staff use only.</strong> Not a client quote. No client-facing URL or email attachment is generated.</p>
      <div style={{ padding: 12, border: "1px solid #cbd5e1", marginBottom: 16 }}>
        <div><b>Quote:</b> {quote.quoteNumber || quote.id} · <b>Client:</b> {quote.clientName} · <b>Job:</b> {quote.jobName || "—"}</div>
        <div><b>Status:</b> {quote.status} · <b>Pricing source:</b> stored quote-line snapshots · <b>GST:</b> excluded from costs and line revenue</div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#475569" }}>Rates, usages and charges are exactly the values recorded when each line was last saved. They are not current stock, supplier, staff or machine rates. Costs represent the quote estimate, not actual production expenditure.</p>
      </div>
      <h2 style={{ fontSize: 18 }}>Quote totals</h2>
      <table style={{ ...table, maxWidth: 850 }}><tbody>
        <tr><th style={cell}>Selling price ex GST (non-cancelled lines)</th><td style={cell}>{money(report.revenue)}</td></tr>
        <tr><th style={cell}>Known cost (complete lines only)</th><td style={cell}>{money(report.knownCost)}{!report.complete ? " — partial" : ""}</td></tr>
        <tr><th style={cell}>Estimated gross profit</th><td style={cell}>{report.grossProfit === null ? "Unavailable — incomplete costing" : money(report.grossProfit)}</td></tr>
        <tr><th style={cell}>Estimated gross margin</th><td style={cell}>{report.marginPercent === null ? "Unavailable" : `${report.marginPercent.toFixed(2)}%`}</td></tr>
        <tr><th style={cell}>GST on selling price (10%)</th><td style={cell}>{money(report.revenue * 0.1)}</td></tr>
        <tr><th style={cell}>Selling price inc GST</th><td style={cell}>{money(report.revenue * 1.1)}</td></tr>
      </tbody></table>
      {!report.complete ? <p role="alert" style={{ padding: 12, border: "1px solid #d97706", color: "#92400e" }}>Some non-cancelled lines have no trustworthy saved cost breakdown. The total cost is partial and an overall margin is deliberately not shown. Review line warnings below.</p> : null}

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Cost categories (known complete lines)</h2>
      <table style={{ ...table, maxWidth: 850 }}><tbody>{COST_CATEGORIES.map((category) => <tr key={category}><th style={cell}>{category}</th><td style={cell}>{money(report.categoryTotals[category])}</td></tr>)}</tbody></table>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Itemised line costs</h2>
      {report.lines.length === 0 ? <p>No quote lines exist.</p> : report.lines.map((line, index) => (
        <section key={index} style={{ border: "1px solid #cbd5e1", padding: 14, marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, margin: "0 0 8px" }}>{index + 1}. {line.name} {line.active ? "" : "(cancelled — excluded from totals)"}</h3>
          {line.machineSelections.length > 0 ? <p style={{ fontSize: 12 }}><b>Machines selected:</b> {line.machineSelections.join(", ")} (a machine charge is included only when recorded in the cost rows below)</p> : null}
          {line.optionSummary ? <p style={{ fontSize: 12, color: "#475569", overflowWrap: "anywhere" }}>{line.optionSummary}</p> : null}
          <p style={{ fontSize: 13 }}><b>Qty:</b> {decimal(line.qty)} · <b>Sell per unit:</b> {money(line.unitPrice)} · <b>Saved line revenue:</b> {money(line.revenue)} · <b>Pricing:</b> {line.pricingSource}</p>
          {line.warnings.length ? <div role="alert" style={{ border: "1px solid #f59e0b", background: "#fffbeb", padding: 9, fontSize: 12 }}><b>Costing notes:</b><ul style={{ margin: "4px 0" }}>{line.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div> : null}
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ ...table, minWidth: 850 }}>
              <thead><tr style={{ background: "#f1f5f9" }}><th style={cell}>Category</th><th style={cell}>Cost item / machine / material</th><th style={cell}>Usage per item</th><th style={cell}>Usage for line</th><th style={cell}>Unit rate</th><th style={cell}>Cost / item</th><th style={cell}>Cost × quote qty</th></tr></thead>
              <tbody>{line.parts.map((part, i) => <tr key={i}>
                <td style={cell}>{part.category}</td>
                <td style={cell}><b>{part.label}</b>{part.detail ? <div>{part.detail}</div> : null}{part.note ? <div style={{ color: "#64748b", fontSize: 11, maxWidth: 350 }}>{part.note}</div> : null}</td>
                <td style={cell}>{decimal(part.amountPerUnit)} {part.unit}</td><td style={cell}>{decimal(part.amountPerUnit * line.qty)} {part.unit}</td><td style={cell}>{money(part.rate)} / {part.unit || "unit"}</td><td style={cell}>{money(part.costPerUnit)}</td><td style={cell}>{money(part.lineCost)}</td>
              </tr>)}</tbody>
            </table>
            {line.parts.length === 0 ? <p>No itemised components saved for this line.</p> : null}
          </div>
          <p style={{ fontSize: 13 }}><b>Saved raw cost per unit:</b> {line.rawCostPerUnit === null ? "Unknown" : money(line.rawCostPerUnit)} · <b>Estimated full line cost:</b> {line.totalCost === null ? "Unknown" : money(line.totalCost)} · <b>Gross profit:</b> {line.grossProfit === null ? "Unknown" : money(line.grossProfit)} · <b>Margin:</b> {line.marginPercent === null ? "Unknown" : `${line.marginPercent.toFixed(2)}%`}</p>
          <details><summary style={{ fontSize: 12, cursor: "pointer" }}>Saved price calculation settings</summary>
            <table style={{ ...table, maxWidth: 700 }}><tbody>{line.savedPricing.map((setting) => <tr key={setting.label}><th style={cell}>{setting.label}</th><td style={cell}>{setting.value}</td></tr>)}</tbody></table>
          </details>
        </section>
      ))}
    </main>
  );
}
