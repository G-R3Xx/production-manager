"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClientLogoBadge } from "@/components/ClientLogoBadge";
import { DashboardJobRow } from "./DashboardJobRow";

export type DashboardRow = {
  id: string;
  jobNumber: string;
  title: string;
  clientName: string;
  currentStage: string;
  currentStageLabel: string;
  nextAction: string;
  dueDate: string | null;
  ownerProfileId: string | null;
  assigneeProfileIds: string[];
  assigneeLabel: string;
  dispatchType: string | null;
  myobOrderNumber: string | null;
  logoUrl: string | null;
};

type StaffOption = { id: string; name: string };
type SortKey = "job" | "stage" | "next" | "due" | "assigned" | "dispatch" | "myob";

const stageFilters = [
  ["", "All active"], ["new_enquiry", "New enquiries"], ["survey", "Surveys"], ["quote_required", "Quote required"],
  ["quote_awaiting_approval", "Quote pending"], ["changes", "Changes requested"], ["artwork", "Artwork"], ["production", "Production"],
  ["dispatch", "Pickup / delivery / install"], ["invoice_required", "Invoice required"], ["overdue", "Overdue"],
] as const;

function stageMatches(row: DashboardRow, filter: string, todayKey: string): boolean {
  if (!filter) return true;
  if (filter === "survey") return row.currentStage.startsWith("survey_");
  if (filter === "changes") return row.currentStage.includes("changes_requested");
  if (filter === "artwork") return row.currentStage.startsWith("artwork_");
  if (filter === "production") return row.currentStage === "production";
  if (filter === "dispatch") return row.currentStage.startsWith("ready_for_");
  if (filter === "overdue") return Boolean(row.dueDate && row.dueDate < todayKey && row.currentStage !== "invoiced" && row.currentStage !== "closed");
  return row.currentStage === filter;
}

function sortValue(row: DashboardRow, key: SortKey): string {
  if (key === "job") return `${row.title} ${row.clientName} ${row.jobNumber}`.toLowerCase();
  if (key === "stage") return row.currentStageLabel.toLowerCase();
  if (key === "next") return row.nextAction.toLowerCase();
  if (key === "due") return row.dueDate || "9999-12-31";
  if (key === "assigned") return row.assigneeLabel.toLowerCase();
  if (key === "dispatch") return (row.dispatchType || "").toLowerCase();
  return (row.myobOrderNumber || "").toLowerCase();
}

function stageTone(stage: string) {
  if (stage === "invoice_required" || stage.includes("changes_requested")) return { bg: "#fff1f2", fg: "#b42318", border: "#fecdd3" };
  if (stage.includes("artwork") || stage.includes("survey")) return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
  if (stage.startsWith("quote")) return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  if (stage.includes("ready") || stage === "invoiced") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6" };
  return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });
}

export function DashboardJobsTable({ rows, staff, todayKey, initialStage = "", initialOwner = "", initialQuery = "" }: { rows: DashboardRow[]; staff: StaffOption[]; todayKey: string; initialStage?: string; initialOwner?: string; initialQuery?: string }) {
  const [stage, setStage] = useState(initialStage);
  const [owner, setOwner] = useState(initialOwner);
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<SortKey | null>(null);
  const [direction, setDirection] = useState<"asc" | "desc">("asc");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => stageMatches(row, stage, todayKey))
      .filter((row) => !owner || row.ownerProfileId === owner || row.assigneeProfileIds.includes(owner))
      .filter((row) => !q || `${row.jobNumber} ${row.title} ${row.clientName} ${row.currentStageLabel} ${row.myobOrderNumber || ""}`.toLowerCase().includes(q));
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => sortValue(a, sort).localeCompare(sortValue(b, sort), "en-AU", { numeric: true }) * (direction === "desc" ? -1 : 1));
  }, [rows, stage, owner, query, sort, direction, todayKey]);

  const changeSort = (key: SortKey) => {
    if (sort === key) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection("asc"); }
  };

  return (
    <>
      <section style={{ ...card, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{stageFilters.map(([value, label]) => <button type="button" key={value || "all"} onClick={() => setStage(value)} style={{ borderRadius: 999, padding: "7px 10px", border: stage === value ? "1px solid #155eef" : "1px solid #d0d5dd", background: stage === value ? "#eff6ff" : "#fff", color: stage === value ? "#155eef" : "#475467", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>{label}</button>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 220px auto", gap: 8 }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search job, client, quote or MYOB order…" style={control} />
          <select value={owner} onChange={(event) => setOwner(event.target.value)} style={control}><option value="">All staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          <button type="button" onClick={() => { setQuery(""); setOwner(""); setStage(""); }} style={{ ...primary, border: 0, cursor: "pointer" }}>Clear</button>
        </div>
      </section>

      <section style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 1180 }}>
            <colgroup><col style={{ width: "25%" }} /><col style={{ width: "14%" }} /><col style={{ width: "16%" }} /><col style={{ width: "9%" }} /><col style={{ width: "10%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} /></colgroup>
            <thead><tr style={{ background: "#f3f6fa", color: "#475467", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{[["Job / client","job"],["Current stage","stage"],["Next action","next"],["Due","due"],["Assigned","assigned"],["Dispatch","dispatch"],["MYOB","myob"],["",""]].map(([head, key], index) => <th key={`${head}-${index}`} style={{ padding: 0, textAlign: "left", borderBottom: "1px solid #d9e1eb", borderRight: index < 7 ? "1px solid #e4e9f0" : undefined }}>{key ? <button type="button" onClick={() => changeSort(key as SortKey)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: 10, color: "inherit", background: "transparent", border: 0, font: "inherit", textTransform: "inherit", letterSpacing: "inherit", cursor: "pointer" }}>{head}<span aria-hidden="true" style={{ color: sort === key ? "#155eef" : "#98a2b3", fontSize: 10 }}>{sort === key ? direction === "asc" ? "▲" : "▼" : "↕"}</span></button> : null}</th>)}</tr></thead>
            <tbody>{visible.map((row) => {
              const colors = stageTone(row.currentStage);
              const overdue = Boolean(row.dueDate && row.dueDate < todayKey && row.currentStage !== "invoiced" && row.currentStage !== "closed");
              return <DashboardJobRow key={row.id} href={`/jobs/${row.id}`}>
                <td style={{ padding: "9px 10px", borderRight: "1px solid #edf1f6" }}><div style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 9, alignItems: "center" }}><ClientLogoBadge logoUrl={row.logoUrl} name={row.clientName} size={36} radius={10} padding={3} /><span style={{ minWidth: 0 }}><strong style={{ display: "block", color: "#101828", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{row.title}</strong><span style={{ display: "block", marginTop: 2, color: "#667085", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.jobNumber} · {row.clientName}</span></span></div></td>
                <td style={{ padding: 10, borderRight: "1px solid #edf1f6" }}><span style={{ borderRadius: 999, background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}`, padding: "5px 8px", fontSize: 10, fontWeight: 950, whiteSpace: "nowrap" }}>{row.currentStageLabel}</span></td>
                <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: "#344054", fontWeight: 800, fontSize: 13 }}>{row.nextAction}</td>
                <td style={{ padding: 10, borderRight: "1px solid #edf1f6", fontSize: 12 }}><span style={{ color: overdue ? "#b42318" : "#344054", fontWeight: overdue ? 950 : 800 }}>{fmtDate(row.dueDate)}</span>{overdue ? <span style={{ display: "block", color: "#b42318", fontSize: 9, fontWeight: 950 }}>OVERDUE</span> : null}</td>
                <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: "#475467", fontSize: 11 }}>{row.assigneeLabel}</td>
                <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: "#475467", fontSize: 12, textTransform: "capitalize" }}>{row.dispatchType?.replaceAll("_", " ") || "—"}</td>
                <td style={{ padding: 10, borderRight: "1px solid #edf1f6", color: row.myobOrderNumber ? "#067647" : "#667085", fontSize: 12, fontWeight: 800 }}>{row.myobOrderNumber || "—"}</td>
                <td style={{ padding: 10, textAlign: "center" }}><Link href={`/jobs/${row.id}`} style={{ color: "#155eef", fontSize: 12, fontWeight: 950, textDecoration: "none" }}>Open →</Link></td>
              </DashboardJobRow>;
            })}</tbody>
          </table>
        </div>
        {!visible.length ? <div style={{ padding: 28, textAlign: "center", color: "#667085" }}>No jobs match these filters.</div> : null}
      </section>
    </>
  );
}

const card = { background: "#fff", border: "1px solid #dfe7f2", borderRadius: 22, boxShadow: "0 12px 34px rgba(15,23,42,.05)" } as const;
const primary = { minHeight: 42, borderRadius: 12, background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontWeight: 950 } as const;
const control = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #cbd5e1", padding: "0 11px", background: "#fff", boxSizing: "border-box" as const };
