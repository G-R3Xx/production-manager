export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  getProjectPlanForTenant, listProjectTasks, listProjectSubJobs, listUnscheduledProductionSteps,
} from "@/server/project-timelines";
import { listActiveStaffOptionsForTenant } from "@/server/users";

import { GanttTimeline } from "./GanttTimeline";
import { ProjectTaskSections, ProjectTaskSummary } from "./ProjectTaskSections";
import { CompletionDateEditor } from "./CompletionDateEditor";
import { scheduleProductionStepAction,
  updateManualProjectPlanAction, addManualProjectSectionAction, renameManualProjectSectionAction, removeManualProjectSectionAction } from "../actions";

type PageProps = { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };
const card: CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 20, boxShadow: "0 8px 25px rgba(15,23,42,.04)" };
const field: CSSProperties = { display: "grid", gap: 5, minWidth: 0, fontSize: 12, fontWeight: 750, color: "#475569" };
const input: CSSProperties = { width: "100%", minWidth: 0, minHeight: 41, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 9, boxSizing: "border-box", background: "#fff", color: "#0f172a" };
const darkButton: CSSProperties = { border: 0, borderRadius: 9, background: "#1e3a8a", color: "white", padding: "10px 14px", minHeight: 41, fontWeight: 800, cursor: "pointer" };

function defaultPeriod(): { start: string; finish: string } {
  const tomorrow = new Date(Date.now() + 86400000);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(tomorrow);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "01";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return { start: `${day}T09:00`, finish: `${day}T10:00` };
}

export default async function ProjectTimelinePage({ params, searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const { id } = await params;
  const project = await getProjectPlanForTenant(tenant.tenantId, id);
  if (!project) notFound();
  const [tasks, subJobs, productionSteps, staff] = await Promise.all([
    listProjectTasks(tenant.tenantId, id), listProjectSubJobs(tenant.tenantId, id),
    listUnscheduledProductionSteps(tenant.tenantId, id), listActiveStaffOptionsForTenant(tenant.tenantId)
  ]);
  const canEdit = ["owner", "manager"].includes(tenant.tenantRole) && tenant.membershipStatus === "active";
  const period = defaultPeriod();
  const paramsValue = (await searchParams) ?? {};
  const message = typeof paramsValue.message === "string" ? paramsValue.message : null;
  const error = typeof paramsValue.error === "string" ? paramsValue.error : null;
  return <main style={{ maxWidth: 1600, margin: "0 auto", display: "grid", gap: 18, minWidth: 0, paddingBottom: 64 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <Link href="/projects" style={{ color: "#1d4ed8", fontSize: 13, fontWeight: 900, textDecoration: "none" }}>← All Projects</Link>
      {project.productionJobId ? <Link href={`/production/${project.productionJobId}`} style={{ color: "#1d4ed8", fontSize: 13, fontWeight: 900 }}>Open Production Job</Link> : <span style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>Standalone project · no quote or job link</span>}
    </div>
    <header style={{ ...card, background: "linear-gradient(120deg,#f8fbff,#eef4ff)" }}>
      <div style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: 1, fontWeight: 900, color: "#475569" }}>Project timeline · {project.isManual ? "Manual" : project.quoteNumber ?? "Production"}</div>
      <h1 style={{ margin: "6px 0", fontSize: 27, color: "#0f172a" }}>{project.title}</h1>
      <div style={{ color: "#475569", fontSize: 13 }}>{project.clientName ? `${project.clientName} · ` : ""}{project.isManual ? "Standalone planning (no MYOB/quote/Production Job)" : project.jobStatus.replace(/_/g, " ")}</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, fontSize: 13, fontWeight: 800, color: "#334155" }}>
        <span>{subJobs.length} Sub Jobs</span><ProjectTaskSummary projectId={id} tasks={tasks} />
      </div>
    </header>
    {project.isManual ? <section style={card}>
      <details>
        <summary style={{ fontWeight: 850, fontSize: 15, cursor: "pointer" }}>Project details {project.dueDate ? `· target ${project.dueDate}` : "· no target date"}</summary>
        {canEdit ? <form action={updateManualProjectPlanAction} style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10, marginTop: 13 }}>
          <input type="hidden" name="projectId" value={id}/>
          <label style={{ ...field, flex: "2 1 250px" }}>Project name<input style={input} name="title" required maxLength={200} defaultValue={project.title}/></label>
          <label style={{ ...field, flex: "1 1 200px" }}>Client / reference<input style={input} name="clientName" maxLength={200} defaultValue={project.clientName}/></label>
          <label style={{ ...field, flex: "1 1 170px" }}>Target completion<input style={input} type="date" name="dueDate" defaultValue={project.dueDate ?? ""}/></label>
          <button type="submit" style={darkButton}>Save details</button>
        </form> : null}
        <p style={{ color: "#64748b", fontSize: 12 }}>Manual project dates are kept here. The Main Calendar currently displays Production Job deadlines only.</p>
      </details>
    </section> : project.productionJobId ? <CompletionDateEditor jobId={project.productionJobId} initialDate={project.dueDate} canEdit={canEdit}/> : null}
    {project.isManual && canEdit ? <section style={card}>
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Manual Sub Jobs</h2>
      <p style={{ color: "#64748b", fontSize: 12 }}>Add sections for different parts of this project. Each section can contain its own tasks, assigned staff and schedule.</p>
      <form action={addManualProjectSectionAction} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <input type="hidden" name="projectId" value={id}/>
        <label style={{ ...field, flex: "1 1 240px" }}>New Sub Job<input name="title" required maxLength={200} style={input} placeholder="e.g. Gallery Wall Graphics"/></label>
        <button style={darkButton} type="submit">+ Add Sub Job</button>
      </form>
      {subJobs.length > 0 ? <div style={{ display: "grid", gap: 9, marginTop: 16 }}>
        {subJobs.map(section => <div key={section.id} style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap", borderTop: "1px solid #edf2f7", paddingTop: 9 }}>
          <form action={renameManualProjectSectionAction} style={{ display: "flex", alignItems: "end", flex: "1 1 260px", gap: 8 }}>
            <input type="hidden" name="projectId" value={id}/><input type="hidden" name="sectionId" value={section.id}/>
            <label style={{ ...field, flex: 1 }}>Sub Job name<input name="title" style={input} required maxLength={200} defaultValue={section.title}/></label>
            <button type="submit" style={{ ...darkButton, background: "#e0eaff", color: "#1e40af" }}>Rename</button>
          </form>
          <form action={removeManualProjectSectionAction}>
            <input type="hidden" name="projectId" value={id}/><input type="hidden" name="sectionId" value={section.id}/>
            <button type="submit" title="Keep tasks, move them to General / Unassigned" style={{ ...darkButton, background: "#fff5f5", color: "#b91c1c", border: "1px solid #fecaca" }}>Remove section</button>
          </form>
        </div>)}
        <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>Removing a section keeps its tasks under General / Unassigned.</p>
      </div> : null}
    </section> : null}
    {message ? <div role="status" style={{ ...card, padding: 12, borderColor: "#86efac", color: "#166534" }}>{message}</div> : null}
    {error ? <div role="alert" style={{ ...card, padding: 12, borderColor: "#fca5a5", color: "#991b1b" }}>{error}</div> : null}
    <GanttTimeline projectId={id} canEdit={canEdit} tasks={tasks} sections={subJobs} staff={staff.map(person => ({ id: person.userProfileId, name: person.shortName || person.fullName }))} revision={project.updatedAt} />
    {canEdit && productionSteps.length > 0 ? <details style={card}>
      <summary style={{ cursor: "pointer", fontWeight: 900, fontSize: 17 }}>Add existing Production Steps to the timeline ({productionSteps.length})</summary>
      <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>Scheduling a step links it to the original production checklist. Its completion status stays connected; the schedule and allocated hours are managed here.</p>
      <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
        {productionSteps.map(step => <form key={step.id} action={scheduleProductionStepAction} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <input type="hidden" name="projectId" value={id} />
          <input type="hidden" name="productionStepId" value={step.id} />
          <div style={{ flex: "1 1 210px", minWidth: 150 }}>
            <div style={{ fontWeight: 850, fontSize: 13 }}>{step.label}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{step.itemTitle ?? "Production"} · {subJobs.find(s => s.id === step.subJobId)?.title ?? "General"} · {step.status}</div>
          </div>
          <label style={{ ...field, flex: "1 1 170px" }}>Start<input type="datetime-local" name="plannedStart" required defaultValue={period.start} style={input}/></label>
          <label style={{ ...field, flex: "1 1 170px" }}>Finish<input type="datetime-local" name="plannedEnd" required defaultValue={period.finish} style={input}/></label>
          <label style={{ ...field, flex: "0 1 100px" }}>Work hours<input name="allocatedHours" type="number" required min={0} max={8760} step="0.25" defaultValue={1} style={input}/></label>
          <button type="submit" style={darkButton}>Schedule step</button>
        </form>)}
      </div>
    </details> : null}
    <ProjectTaskSections projectId={id} canEdit={canEdit} tasks={tasks} subJobs={subJobs} staff={staff} period={period} />
  </main>;
}
