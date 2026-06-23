import Link from "next/link";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listEnquiriesForTenant, type EnquiryRecord } from "@/server/enquiries";
import { listSurveyRequestsForTenant, type SurveyRequestRecord } from "@/server/surveys";
import { listQuoteDraftsForTenant, listQuoteLines, type QuoteDraftRecord } from "@/server/quotes";
import { listMaterialsForTenant, type MaterialRecord } from "@/server/materials";
import { listCustomersForTenant } from "@/server/customers";

const pageStyle = { maxWidth: 1420, margin: "0 auto", display: "grid", gap: 18 } as const;
const panelStyle = {
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #dfe7f2",
  borderRadius: 28,
  padding: 24,
  boxShadow: "0 18px 48px rgba(15, 23, 42, 0.07)"
} as const;
const smallPanelStyle = {
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #e1e8f2",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 12px 34px rgba(15, 23, 42, 0.045)"
} as const;
const eyebrowStyle = { margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" } as const;
const mutedStyle = { margin: 0, color: "#64748b", lineHeight: 1.55 } as const;
const actionStyle = { minHeight: 42, borderRadius: 14, background: "#0f172a", color: "#fff", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontWeight: 900 } as const;
const ghostActionStyle = { ...actionStyle, background: "#fff", color: "#1e293b", border: "1px solid #dbe4f0" } as const;

type MetricCard = {
  label: string;
  value: number | string;
  note: string;
  href: string;
  tone: "red" | "orange" | "blue" | "green" | "purple" | "slate";
};

type ChartItem = {
  label: string;
  value: number;
  note?: string;
};

type ActivityItem = {
  type: string;
  title: string;
  detail: string;
  href: string;
  date: string | null;
  tone: "blue" | "green" | "orange" | "purple" | "slate";
};

const tones = {
  red: { bg: "#fff1f2", fg: "#be123c", border: "#fecdd3", icon: "#e11d48" },
  orange: { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa", icon: "#f97316" },
  blue: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", icon: "#2563eb" },
  green: { bg: "#ecfdf3", fg: "#067647", border: "#bbf7d0", icon: "#16a34a" },
  purple: { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe", icon: "#7c3aed" },
  slate: { bg: "#f8fafc", fg: "#334155", border: "#e2e8f0", icon: "#64748b" }
} as const;

function normalise(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function asMoney(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function plural(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function isCompletedSurvey(survey: SurveyRequestRecord): boolean {
  const status = normalise(survey.status);
  return status.includes("complete") || Boolean(survey.completedAt || survey.installSchedulerCompletedAt);
}

function isSurveySent(survey: SurveyRequestRecord): boolean {
  const sync = normalise(survey.installSchedulerSyncStatus);
  return Boolean(survey.installSchedulerJobId || survey.installSchedulerJobUrl || sync.includes("created") || sync.includes("sent") || sync.includes("synced"));
}

function isSurveySyncIssue(survey: SurveyRequestRecord): boolean {
  const sync = normalise(survey.installSchedulerSyncStatus);
  return Boolean(survey.installSchedulerSyncError || sync.includes("fail") || sync.includes("error"));
}

function quoteStatusLabel(status: string | null | undefined): string {
  const value = normalise(status);
  if (value.includes("accept") || value.includes("approved") || value.includes("won")) return "Accepted";
  if (value.includes("sent") || value.includes("issued")) return "Sent";
  if (value.includes("decline") || value.includes("lost")) return "Declined";
  return "Draft";
}

function enquiryStatusLabel(status: string | null | undefined): string {
  const value = normalise(status);
  if (value.includes("survey")) return "Survey";
  if (value.includes("quote")) return "Quoted";
  if (value.includes("close") || value.includes("lost")) return "Closed";
  return "New";
}

function groupCounts<T>(items: T[], getLabel: (item: T) => string, labels: string[]): ChartItem[] {
  return labels.map((label) => ({ label, value: items.filter((item) => getLabel(item) === label).length }));
}

function ChartCard({ title, description, items, footer }: { title: string; description: string; items: ChartItem[]; footer?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section style={{ ...smallPanelStyle, display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.025em" }}>{title}</h2>
        <p style={{ ...mutedStyle, marginTop: 4, fontSize: 13 }}>{description}</p>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {items.map((item) => {
          const width = `${Math.max(6, Math.round((item.value / max) * 100))}%`;
          return (
            <div key={item.label} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <span style={{ fontWeight: 850, color: "#1e293b" }}>{item.label}</span>
                <span style={{ fontWeight: 950, color: "#0f172a" }}>{item.value}</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "#eef2f7", overflow: "hidden" }}>
                <div style={{ height: "100%", width, borderRadius: 999, background: "linear-gradient(90deg, #2563eb, #06b6d4)" }} />
              </div>
              {item.note ? <p style={{ ...mutedStyle, fontSize: 12 }}>{item.note}</p> : null}
            </div>
          );
        })}
      </div>
      {footer ? <p style={{ ...mutedStyle, fontSize: 12 }}>{footer}</p> : null}
    </section>
  );
}

function Metric({ card }: { card: MetricCard }) {
  const tone = tones[card.tone];
  return (
    <Link href={card.href} style={{ ...smallPanelStyle, textDecoration: "none", color: "inherit", display: "grid", gap: 12, borderColor: tone.border, background: `linear-gradient(135deg, #ffffff 0%, ${tone.bg} 100%)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <span style={{ width: 42, height: 42, borderRadius: 16, background: tone.bg, color: tone.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 950, fontSize: 18 }}>!</span>
        <span style={{ borderRadius: 999, padding: "5px 9px", background: "rgba(255,255,255,0.72)", border: `1px solid ${tone.border}`, color: tone.fg, fontSize: 11, fontWeight: 950 }}>Open</span>
      </div>
      <div>
        <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 950, letterSpacing: "-0.055em", color: "#0f172a" }}>{card.value}</div>
        <h3 style={{ margin: "8px 0 4px", fontSize: 16 }}>{card.label}</h3>
        <p style={{ ...mutedStyle, fontSize: 13 }}>{card.note}</p>
      </div>
    </Link>
  );
}

function ActivityList({ title, items, emptyText }: { title: string; items: ActivityItem[]; emptyText: string }) {
  return (
    <section style={{ ...smallPanelStyle, display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-0.025em" }}>{title}</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {items.length ? items.map((item, index) => {
          const tone = tones[item.tone];
          return (
            <Link key={`${item.type}-${item.href}-${index}`} href={item.href} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 12, alignItems: "center", padding: 12, borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff", color: "inherit", textDecoration: "none" }}>
              <span style={{ width: 36, height: 36, borderRadius: 14, background: tone.bg, color: tone.fg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 950 }}>{item.type.slice(0, 2).toUpperCase()}</span>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: "block", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</strong>
                <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.detail}</span>
              </span>
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>{formatDate(item.date)}</span>
            </Link>
          );
        }) : <p style={mutedStyle}>{emptyText}</p>}
      </div>
    </section>
  );
}

function surveyStageItems(surveys: SurveyRequestRecord[], quotedSurveyIds: Set<string>): ChartItem[] {
  const requested = surveys.filter((survey) => !isSurveySent(survey) && !isCompletedSurvey(survey)).length;
  const sent = surveys.filter((survey) => isSurveySent(survey) && !isCompletedSurvey(survey)).length;
  const completed = surveys.filter((survey) => isCompletedSurvey(survey)).length;
  const readyToQuote = surveys.filter((survey) => isCompletedSurvey(survey) && !quotedSurveyIds.has(survey.id)).length;
  return [
    { label: "Requested", value: requested },
    { label: "Sent", value: sent },
    { label: "Completed", value: completed },
    { label: "Ready to quote", value: readyToQuote }
  ];
}

function lowStockMaterials(materials: MaterialRecord[]): MaterialRecord[] {
  return materials.filter((material) => material.active && asMoney(material.stockQuantity) > 0 && asMoney(material.stockQuantity) <= 2).slice(0, 8);
}

export default async function DashboardPage() {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);

  if (!activeTenant) {
    return (
      <div style={panelStyle}>
        <h1 style={{ marginTop: 0 }}>No active workspace</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Create or select a workspace to continue.</p>
      </div>
    );
  }

  const [enquiries, surveys, quotes, materials, customers] = await Promise.all([
    listEnquiriesForTenant(activeTenant.tenantId),
    listSurveyRequestsForTenant(activeTenant.tenantId),
    listQuoteDraftsForTenant(activeTenant.tenantId),
    listMaterialsForTenant(activeTenant.tenantId),
    listCustomersForTenant(activeTenant.tenantId)
  ]);

  const recentQuotes = quotes.slice(0, 24);
  const quoteLinePairs = await Promise.all(recentQuotes.map(async (quote) => ({ quote, lines: await listQuoteLines(quote.id) })));
  const quoteTotals = new Map<string, number>(quoteLinePairs.map(({ quote, lines }) => [quote.id, lines.reduce((sum, line) => sum + asMoney(line.lineTotal), 0)]));
  const totalOpenQuoteValue = recentQuotes.reduce((sum, quote) => {
    const label = quoteStatusLabel(quote.status);
    return label === "Accepted" || label === "Declined" ? sum : sum + (quoteTotals.get(quote.id) ?? 0);
  }, 0);

  const quotedSurveyIds = new Set(quotes.map((quote) => quote.surveyRequestId).filter((value): value is string => Boolean(value)));
  const newEnquiries = enquiries.filter((enquiry) => enquiryStatusLabel(enquiry.status) === "New");
  const surveysWaiting = surveys.filter((survey) => !isCompletedSurvey(survey));
  const completedSurveysNotQuoted = surveys.filter((survey) => isCompletedSurvey(survey) && !quotedSurveyIds.has(survey.id));
  const draftQuotes = quotes.filter((quote) => quoteStatusLabel(quote.status) === "Draft");
  const sentQuotes = quotes.filter((quote) => quoteStatusLabel(quote.status) === "Sent");
  const syncIssues = surveys.filter(isSurveySyncIssue);
  const lowStock = lowStockMaterials(materials);

  const urgentCards: MetricCard[] = [
    { label: "New enquiries", value: newEnquiries.length, note: "Need triage, survey or quote decision", href: "/enquiries", tone: newEnquiries.length ? "orange" : "green" },
    { label: "Surveys waiting", value: surveysWaiting.length, note: "Survey requested or sent to Install Scheduler", href: "/surveys", tone: surveysWaiting.length ? "blue" : "green" },
    { label: "Ready to quote", value: completedSurveysNotQuoted.length, note: "Completed survey information waiting for a quote", href: "/surveys", tone: completedSurveysNotQuoted.length ? "purple" : "green" },
    { label: "Draft quotes", value: draftQuotes.length, note: "Quotes started but not sent/accepted", href: "/quotes", tone: draftQuotes.length ? "orange" : "green" },
    { label: "Open quote value", value: formatMoney(totalOpenQuoteValue), note: "Draft/sent value from recent quote lines", href: "/quotes", tone: totalOpenQuoteValue > 0 ? "blue" : "slate" },
    { label: "Sync issues", value: syncIssues.length, note: "Survey bridge records needing attention", href: "/surveys", tone: syncIssues.length ? "red" : "green" }
  ];

  const enquiryChart = groupCounts<EnquiryRecord>(enquiries, (enquiry) => enquiryStatusLabel(enquiry.status), ["New", "Survey", "Quoted", "Closed"]);
  const surveyChart = surveyStageItems(surveys, quotedSurveyIds);
  const quoteChart = groupCounts<QuoteDraftRecord>(quotes, (quote) => quoteStatusLabel(quote.status), ["Draft", "Sent", "Accepted", "Declined"]);
  const quoteValueByStatus = ["Draft", "Sent", "Accepted", "Declined"].map((status) => ({
    label: status,
    value: Math.round(quotes.filter((quote) => quoteStatusLabel(quote.status) === status).reduce((sum, quote) => sum + (quoteTotals.get(quote.id) ?? 0), 0))
  }));

  const activity: ActivityItem[] = [
    ...enquiries.slice(0, 8).map((enquiry) => ({
      type: "Enquiry",
      title: enquiry.clientName,
      detail: `${enquiryStatusLabel(enquiry.status)} · ${enquiry.requestSummary}`,
      href: "/enquiries",
      date: enquiry.updatedAt ?? enquiry.createdAt,
      tone: "blue" as const
    })),
    ...surveys.slice(0, 8).map((survey) => ({
      type: "Survey",
      title: survey.clientName,
      detail: `${isCompletedSurvey(survey) ? "Completed" : isSurveySent(survey) ? "Awaiting completion" : "Requested"} · ${survey.siteAddress ?? "No site address"}`,
      href: "/surveys",
      date: survey.updatedAt ?? survey.createdAt,
      tone: isCompletedSurvey(survey) ? "green" as const : "purple" as const
    })),
    ...quotes.slice(0, 8).map((quote) => ({
      type: "Quote",
      title: quote.clientName,
      detail: `${quoteStatusLabel(quote.status)} · ${formatMoney(quoteTotals.get(quote.id) ?? 0)}`,
      href: "/quotes",
      date: quote.updatedAt ?? quote.createdAt,
      tone: "orange" as const
    }))
  ].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()).slice(0, 10);

  const upcoming: ActivityItem[] = [
    ...surveys.filter((survey) => !isCompletedSurvey(survey)).sort((a, b) => new Date(a.dueDate ?? a.createdAt).getTime() - new Date(b.dueDate ?? b.createdAt).getTime()).slice(0, 6).map((survey) => ({
      type: "Survey",
      title: survey.clientName,
      detail: `${survey.dueDate ? "Due" : "Requested"} · ${survey.siteAddress ?? "No site address"}`,
      href: "/surveys",
      date: survey.dueDate ?? survey.createdAt,
      tone: "purple" as const
    })),
    ...completedSurveysNotQuoted.slice(0, 6).map((survey) => ({
      type: "Quote",
      title: survey.clientName,
      detail: "Survey completed — quote required",
      href: "/surveys",
      date: survey.installSchedulerCompletedAt ?? survey.completedAt ?? survey.updatedAt,
      tone: "green" as const
    })),
    ...lowStock.map((material) => ({
      type: "Stock",
      title: material.name,
      detail: `${material.stockQuantity} ${material.stockUom} in stock`,
      href: "/materials",
      date: material.updatedAt,
      tone: "orange" as const
    }))
  ].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()).slice(0, 10);

  return (
    <div style={pageStyle}>
      <section style={{ ...panelStyle, display: "grid", gap: 18, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 48%, #eff6ff 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p style={eyebrowStyle}>Command centre</p>
            <h1 style={{ margin: "8px 0 8px", fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.04em" }}>{activeTenant.tenantName}</h1>
            <p style={{ ...mutedStyle, maxWidth: 820 }}>
              Visual overview of enquiries, surveys, quotes and work that needs action. Signed in as {user.email ?? "Unknown user"}.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/enquiries" style={actionStyle}>New enquiry</Link>
            <Link href="/quotes" style={ghostActionStyle}>New quote</Link>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <div style={{ ...smallPanelStyle, boxShadow: "none" }}><strong>{plural(customers.length, "client")}</strong><p style={{ ...mutedStyle, marginTop: 4, fontSize: 13 }}>Client records</p></div>
          <div style={{ ...smallPanelStyle, boxShadow: "none" }}><strong>{plural(enquiries.length, "enquiry")}</strong><p style={{ ...mutedStyle, marginTop: 4, fontSize: 13 }}>Total enquiries</p></div>
          <div style={{ ...smallPanelStyle, boxShadow: "none" }}><strong>{plural(surveys.length, "survey")}</strong><p style={{ ...mutedStyle, marginTop: 4, fontSize: 13 }}>Survey requests</p></div>
          <div style={{ ...smallPanelStyle, boxShadow: "none" }}><strong>{plural(quotes.length, "quote")}</strong><p style={{ ...mutedStyle, marginTop: 4, fontSize: 13 }}>Quote drafts</p></div>
          <div style={{ ...smallPanelStyle, boxShadow: "none" }}><strong>{plural(materials.filter((material) => material.active).length, "material")}</strong><p style={{ ...mutedStyle, marginTop: 4, fontSize: 13 }}>Active stock records</p></div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        {urgentCards.map((card) => <Metric key={card.label} card={card} />)}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <ChartCard title="Enquiry pipeline" description="Where incoming requests are sitting right now." items={enquiryChart} />
        <ChartCard title="Survey pipeline" description="Survey jobs from request through ready-to-quote." items={surveyChart} />
        <ChartCard title="Quote pipeline" description="Draft, sent, accepted and declined quote drafts." items={quoteChart} />
        <ChartCard title="Quote value" description="Recent quote line totals grouped by status." items={quoteValueByStatus} footer="Uses the most recent 24 quote drafts to keep the dashboard fast." />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <ActivityList title="Recent activity" items={activity} emptyText="No recent activity yet." />
        <ActivityList title="Upcoming work / needs action" items={upcoming} emptyText="Nothing urgent right now." />
      </section>
    </div>
  );
}
