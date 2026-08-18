import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getJobById, listJobTasksForTenant, buildJobTimeline, jobStageMeta } from "@/server/jobs";
import { getEnquiryById } from "@/server/enquiries";
import { getSurveyRequestById } from "@/server/surveys";
import { getQuoteDraftById, getArtworkApprovalById } from "@/server/quotes";
import { getProductionJobById } from "@/server/production";
import { listUsersForTenant } from "@/server/users";
import { createJobTaskAction, updateJobMetaAction, updateJobTaskAction } from "../actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const card = { background: "#fff", border: "1px solid #dfe7f2", borderRadius: 22, padding: 20, boxShadow: "0 12px 34px rgba(15,23,42,.05)" } as const;
const input = { width: "100%", minHeight: 42, borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", padding: "0 12px", boxSizing: "border-box" as const };
const label = { display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: "#344054" } as const;
const button = { minHeight: 42, border: 0, borderRadius: 12, background: "#0f172a", color: "#fff", fontWeight: 900, padding: "0 14px", cursor: "pointer" } as const;

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" });
}

function tone(stage: string) {
  if (stage.includes("invoice") || stage.includes("changes")) return { bg: "#fff1f2", fg: "#b42318", border: "#fecdd3" };
  if (stage.includes("artwork") || stage.includes("survey")) return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
  if (stage.includes("ready") || stage === "invoiced" || stage === "closed") return { bg: "#ecfdf3", fg: "#067647", border: "#abefc6" };
  if (stage.includes("quote")) return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
}

export default async function JobWorkspacePage({ params, searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) redirect("/bootstrap");
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const message = readParam(query, "message");
  const error = readParam(query, "error");

  const job = await getJobById(activeTenant.tenantId, id);
  if (!job) { notFound(); return null; }

  const [tasks, staff, enquiry, survey, quote, artwork, production, timeline] = await Promise.all([
    listJobTasksForTenant(activeTenant.tenantId, { jobId: job.id }),
    listUsersForTenant(activeTenant.tenantId),
    job.enquiryId ? getEnquiryById(activeTenant.tenantId, job.enquiryId) : Promise.resolve(null),
    job.surveyRequestId ? getSurveyRequestById(activeTenant.tenantId, job.surveyRequestId) : Promise.resolve(null),
    job.quoteId ? getQuoteDraftById(activeTenant.tenantId, job.quoteId) : Promise.resolve(null),
    job.artworkApprovalId ? getArtworkApprovalById(activeTenant.tenantId, job.artworkApprovalId) : Promise.resolve(null),
    job.productionJobId ? getProductionJobById(activeTenant.tenantId, job.productionJobId) : Promise.resolve(null),
    buildJobTimeline(activeTenant.tenantId, job),
  ]);

  const stageTone = tone(job.currentStage);
  const activeStaff = staff.filter((row) => row.membershipStatus === "active");
  const staffById = new Map(activeStaff.map((row) => [row.userProfileId, row]));
  const stageMeta = jobStageMeta(job.currentStage);
  const stageLinks = [
    enquiry ? { label: "Enquiry", href: `/enquiries?selected=${enquiry.id}` } : null,
    survey ? { label: "Survey", href: `/surveys?selected=${survey.id}` } : null,
    quote ? { label: "Quote", href: `/quotes?selected=${quote.id}` } : null,
    artwork ? { label: "Artwork", href: `/artwork-approvals?selected=${artwork.id}` } : null,
    production ? { label: "Production", href: `/production?selected=${production.id}` } : null,
    production ? { label: "Job sheet", href: `/job-sheets/${production.id}`, external: true } : null,
  ].filter(Boolean) as Array<{ label: string; href: string; external?: boolean }>;

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", display: "grid", gap: 16 }}>
      {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 14, padding: 12 }}>{message}</div> : null}
      {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 14, padding: 12 }}>{error}</div> : null}

      <section style={{ ...card, display: "grid", gap: 16, background: "linear-gradient(135deg,#fff 0%,#f7fbff 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, color: "#2563eb", fontSize: 12, fontWeight: 950, letterSpacing: ".08em", textTransform: "uppercase" }}>{job.jobNumber} · Job workspace</p>
            <h1 style={{ margin: "6px 0 4px", fontSize: 36, letterSpacing: "-.04em" }}>{job.title}</h1>
            <p style={{ margin: 0, color: "#475467", fontSize: 17 }}>{job.clientName}{quote?.quoteNumber ? ` · ${quote.quoteNumber}` : ""}{job.myobOrderNumber ? ` · MYOB ${job.myobOrderNumber}` : ""}</p>
          </div>
          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <span style={{ borderRadius: 999, padding: "8px 12px", background: stageTone.bg, color: stageTone.fg, border: `1px solid ${stageTone.border}`, fontWeight: 950 }}>{job.currentStageLabel}</span>
            <strong style={{ color: "#344054" }}>Next: {job.nextAction || stageMeta.nextAction}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={job.currentHref} style={{ minHeight: 42, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, background: "#155eef", color: "#fff", fontWeight: 950, textDecoration: "none" }}>Open current stage</Link>
          {stageLinks.map((item) => <a key={item.label} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined} style={{ minHeight: 42, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 12, background: "#fff", border: "1px solid #d0d5dd", color: "#344054", fontWeight: 900, textDecoration: "none" }}>{item.label}</a>)}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(320px, .8fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <section style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <div><p style={{ margin: 0, fontSize: 12, fontWeight: 950, color: "#4f46e5", textTransform: "uppercase" }}>Tasks + milestones</p><h2 style={{ margin: "4px 0 0" }}>What needs to happen next</h2></div>
              <Link href="/calendar" style={{ color: "#155eef", fontWeight: 900, textDecoration: "none" }}>Open calendar →</Link>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {tasks.map((task) => {
                const taskTone = task.status === "completed" ? { bg: "#ecfdf3", fg: "#067647", border: "#abefc6" } : task.status === "in_progress" ? { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" } : { bg: "#f8fafc", fg: "#344054", border: "#e2e8f0" };
                return (
                  <details key={task.id} style={{ border: `1px solid ${taskTone.border}`, borderRadius: 16, background: taskTone.bg, overflow: "hidden" }}>
                    <summary style={{ listStyle: "none", cursor: "pointer", padding: 13, display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                      <span><strong style={{ color: "#0f172a" }}>{task.title}</strong><span style={{ display: "block", marginTop: 3, color: "#667085", fontSize: 12 }}>{task.stage.replaceAll("_", " ")} · {task.dueDate ? `Due ${fmtDate(task.dueDate)}` : "No due date"}{task.assigneeProfileIds.length ? ` · ${task.assigneeProfileIds.map((id) => staffById.get(id)?.shortName || staffById.get(id)?.fullName || "Staff").join(", ")}` : ""}</span></span>
                      <span style={{ alignSelf: "start", borderRadius: 999, padding: "4px 8px", background: "#fff", color: taskTone.fg, border: `1px solid ${taskTone.border}`, fontSize: 11, fontWeight: 950 }}>{task.status.replaceAll("_", " ")}</span>
                    </summary>
                    <form action={updateJobTaskAction} style={{ borderTop: `1px solid ${taskTone.border}`, background: "#fff", padding: 14, display: "grid", gap: 12 }}>
                      <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="taskId" value={task.id} />
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                        <label style={label}>Task<input name="title" defaultValue={task.title} style={input} /></label>
                        <label style={label}>Status<select name="status" defaultValue={task.status} style={input}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
                        <label style={label}>Due date<input type="date" name="dueDate" defaultValue={task.dueDate ?? ""} style={input} /></label>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={label}>Stage<select name="stage" defaultValue={task.stage} style={input}>{stageOptions(task.stage)}</select></label>
                        <label style={label}>Priority<select name="priority" defaultValue={task.priority} style={input}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                      </div>
                      <fieldset style={{ border: "1px solid #e4e7ec", borderRadius: 12, padding: 10 }}><legend style={{ fontWeight: 900, fontSize: 12 }}>Assigned staff</legend><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{activeStaff.map((person) => <label key={person.userProfileId} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="assigneeIds" value={person.userProfileId} defaultChecked={task.assigneeProfileIds.includes(person.userProfileId)} />{person.shortName || person.fullName}</label>)}</div></fieldset>
                      <label style={label}>Notes<textarea name="notes" defaultValue={task.notes ?? ""} style={{ ...input, minHeight: 70, paddingTop: 10 }} /></label>
                      <div><button type="submit" style={button}>Save task</button></div>
                    </form>
                  </details>
                );
              })}
              {!tasks.length ? <p style={{ margin: 0, color: "#667085" }}>No tasks yet. Add the first one below.</p> : null}
            </div>
            <details style={{ marginTop: 14, border: "1px dashed #a5b4fc", borderRadius: 16, padding: 12, background: "#fafaff" }}>
              <summary style={{ cursor: "pointer", fontWeight: 950, color: "#4338ca" }}>+ Add job task / milestone</summary>
              <form action={createJobTaskAction} style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <input type="hidden" name="jobId" value={job.id} />
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
                  <label style={label}>Task<input name="title" required placeholder="e.g. Client proof due" style={input} /></label>
                  <label style={label}>Stage<select name="stage" defaultValue={job.currentStage} style={input}>{stageOptions(job.currentStage)}</select></label>
                  <label style={label}>Due date<input name="dueDate" type="date" style={input} /></label>
                </div>
                <label style={label}>Priority<select name="priority" defaultValue="normal" style={input}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                <fieldset style={{ border: "1px solid #e4e7ec", borderRadius: 12, padding: 10 }}><legend style={{ fontWeight: 900, fontSize: 12 }}>Assign to one or more staff</legend><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{activeStaff.map((person) => <label key={person.userProfileId} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" name="assigneeIds" value={person.userProfileId} />{person.shortName || person.fullName}</label>)}</div></fieldset>
                <label style={label}>Notes<textarea name="notes" style={{ ...input, minHeight: 70, paddingTop: 10 }} /></label>
                <div><button type="submit" style={button}>Add task</button></div>
              </form>
            </details>
          </section>

          <section style={card}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 950, color: "#4f46e5", textTransform: "uppercase" }}>Timeline</p><h2 style={{ margin: "4px 0 14px" }}>Job history</h2>
            <div style={{ display: "grid", gap: 0 }}>
              {timeline.map((item, index) => <div key={item.key} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 12, minHeight: 64 }}><div style={{ display: "grid", justifyItems: "center" }}><span style={{ marginTop: 4, width: 10, height: 10, borderRadius: 999, background: item.tone === "green" ? "#12b76a" : item.tone === "orange" ? "#f79009" : item.tone === "purple" ? "#7f56d9" : item.tone === "blue" ? "#2e90fa" : "#98a2b3" }} />{index < timeline.length - 1 ? <span style={{ width: 2, minHeight: 46, background: "#e4e7ec" }} /> : null}</div><div>{item.href ? <Link href={item.href} style={{ fontWeight: 950, color: "#101828", textDecoration: "none" }}>{item.title}</Link> : <strong>{item.title}</strong>}<p style={{ margin: "3px 0 0", color: "#667085", fontSize: 13 }}>{item.detail}{item.at ? ` · ${fmtDateTime(item.at)}` : ""}</p></div></div>)}
            </div>
          </section>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={card}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 950, color: "#4f46e5", textTransform: "uppercase" }}>Job control</p><h2 style={{ margin: "4px 0 14px" }}>Owner + dates</h2>
            <form action={updateJobMetaAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="jobId" value={job.id} />
              <label style={label}>Job name<input name="title" defaultValue={job.title} style={input} /></label>
              <label style={label}>Job owner<select name="ownerProfileId" defaultValue={job.ownerProfileId ?? ""} style={input}><option value="">Unassigned</option>{activeStaff.map((person) => <option key={person.userProfileId} value={person.userProfileId}>{person.fullName} ({person.shortName})</option>)}</select></label>
              <label style={label}>Overall due date<input type="date" name="dueDate" defaultValue={job.dueDate ?? ""} style={input} /></label>
              <label style={label}>Priority<select name="priority" defaultValue={job.priority || "normal"} style={input}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
              <label style={label}>Invoice status<select name="invoiceStatus" defaultValue={job.invoiceStatus || "not_invoiced"} style={input}><option value="not_invoiced">Not invoiced</option><option value="invoiced">Invoiced</option></select></label>
              <button type="submit" style={button}>Save job details</button>
            </form>
          </section>

          <section style={card}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 950, color: "#4f46e5", textTransform: "uppercase" }}>Linked workflow</p><h2 style={{ margin: "4px 0 12px" }}>One job, all stages</h2>
            <div style={{ display: "grid", gap: 9 }}>
              {[
                ["Enquiry", enquiry?.status, enquiry ? `/enquiries?selected=${enquiry.id}` : null],
                ["Survey", survey?.status, survey ? `/surveys?selected=${survey.id}` : null],
                ["Quote", quote?.status, quote ? `/quotes?selected=${quote.id}` : null],
                ["Artwork", artwork?.status, artwork ? `/artwork-approvals?selected=${artwork.id}` : null],
                ["Production", production?.status, production ? `/production?selected=${production.id}` : null],
                ["MYOB Order", job.myobOrderNumber ? `Order ${job.myobOrderNumber}` : "Not created", null],
                ["Install Scheduler", job.installSchedulerJobId ? "Linked" : "Not linked", job.installSchedulerJobUrl],
              ].map(([name, status, href]) => <div key={String(name)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "10px 0", borderBottom: "1px solid #f0f2f5" }}><span><strong>{name}</strong><span style={{ display: "block", color: "#667085", fontSize: 12, marginTop: 2 }}>{String(status || "Not required / not started")}</span></span>{href ? <a href={String(href)} target={String(href).startsWith("http") ? "_blank" : undefined} rel={String(href).startsWith("http") ? "noreferrer" : undefined} style={{ color: "#155eef", fontWeight: 900, textDecoration: "none", alignSelf: "center" }}>Open</a> : null}</div>)}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function stageOptions(selected: string) {
  const values = [
    ["new_enquiry", "New enquiry"], ["survey_required", "Survey required"], ["survey_scheduled", "Survey scheduled"],
    ["quote_required", "Quote required"], ["quote_awaiting_approval", "Quote awaiting approval"], ["quote_changes_requested", "Quote changes requested"],
    ["artwork_required", "Artwork required"], ["artwork_sent", "Artwork sent"], ["artwork_changes_requested", "Artwork changes requested"], ["artwork_approved", "Artwork approved"],
    ["production", "Production"], ["ready_for_pickup", "Pickup"], ["ready_for_delivery", "Delivery"], ["ready_for_install", "Install"],
    ["invoice_required", "Invoice required"], ["general", "General / admin"],
  ];
  if (selected && !values.some(([value]) => value === selected)) values.push([selected, selected.replaceAll("_", " ")]);
  return values.map(([value, text]) => <option key={value} value={value}>{text}</option>);
}
