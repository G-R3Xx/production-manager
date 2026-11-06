export const dynamic = "force-dynamic";
import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { listProjectPlansForTenant, listUnplannedProductionJobsForTenant } from "@/server/project-timelines";
import { createProjectPlanAction, createManualProjectPlanAction } from "./actions";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
const card: CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 20, boxShadow: "0 8px 25px rgba(15,23,42,.04)" };

export default async function ProjectsPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const [projects, jobs] = await Promise.all([
    listProjectPlansForTenant(tenant.tenantId),
    listUnplannedProductionJobsForTenant(tenant.tenantId)
  ]);
  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error : null;
  const requestedJobId = typeof params.productionJobId === "string" ? params.productionJobId : "";
  const selectedJobId = jobs.some(job => job.id === requestedJobId) ? requestedJobId : "";
  const canEdit = ["owner", "manager"].includes(tenant.tenantRole) && tenant.membershipStatus === "active";
  return <main style={{ margin: "0 auto", maxWidth: 1300, display: "grid", gap: 20, paddingBottom: 50 }}>
    <header style={{ ...card, background: "linear-gradient(125deg,#f8fbff,#eaf1ff)" }}>
      <div style={{ textTransform: "uppercase", color: "#475569", fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>Production Manager · Projects</div>
      <h1 style={{ margin: "7px 0", color: "#0f172a", fontSize: 29 }}>Project timelines</h1>
      <p style={{ margin: 0, color: "#475569", lineHeight: 1.55 }}>Create a timeline directly or link one to an existing Production Job. Manage Sub Jobs, task times and staff in one place.</p>
    </header>
    {error ? <div role="alert" style={{ ...card, borderColor: "#fca5a5", color: "#991b1b" }}>{error}</div> : null}
    {canEdit ? <section style={{ ...card, borderColor: "#bfdbfe", background: "#f8fbff" }}>
      <h2 style={{ margin: "0 0 11px", fontSize: 18 }}>+ New manual project</h2>
      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 13px" }}>For planning, installation coordination or large projects that have no quote or Production Job. Add your own Sub Jobs and tasks after creating it.</p>
      <form action={createManualProjectPlanAction} style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 10 }}>
        <label style={{ flex: "2 1 300px", fontSize: 12, fontWeight: 800, display: "grid", gap: 5 }}>Project name
          <input name="title" type="text" required maxLength={200} placeholder="e.g. NGA Exhibition Installation" style={{ minHeight: 43, padding: "0 11px", borderRadius: 10, border: "1px solid #cbd5e1" }}/>
        </label>
        <label style={{ flex: "1 1 220px", fontSize: 12, fontWeight: 800, display: "grid", gap: 5 }}>Client / reference (optional)
          <input name="clientName" type="text" maxLength={200} placeholder="e.g. National Gallery" style={{ minHeight: 43, padding: "0 11px", borderRadius: 10, border: "1px solid #cbd5e1" }}/>
        </label>
        <button type="submit" style={{ border: 0, borderRadius: 10, background: "#183a70", color: "white", fontWeight: 800, padding: "11px 18px", minHeight: 43, cursor: "pointer" }}>Create manual project</button>
      </form>
    </section> : null}
    {canEdit ? <section style={card}>
      <h2 style={{ margin: "0 0 11px", fontSize: 18 }}>From an existing Production Job</h2>
      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 13px" }}>Choose an existing Production Job. This does not create another quote or duplicate its production steps.</p>
      <form action={createProjectPlanAction} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <select name="productionJobId" aria-label="Production Job" required defaultValue={selectedJobId} style={{ flex: "1 1 340px", minHeight: 43, borderRadius: 10, border: "1px solid #cbd5e1", padding: "0 10px", maxWidth: "100%" }}>
          <option value="" disabled>Select a Production Job…</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.quoteNumber ?? "Job"} · {j.title} ({j.clientName})</option>)}
        </select>
        <button disabled={jobs.length === 0} type="submit" style={{ border: 0, borderRadius: 10, background: "#183a70", color: "white", fontWeight: 800, padding: "11px 18px", cursor: jobs.length ? "pointer" : "not-allowed" }}>Create timeline</button>
      </form>
      {!jobs.length ? <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: 12 }}>Every existing Production Job already has a timeline, or no active jobs are available.</p> : null}
    </section> : null}
    <section style={card}>
      <h2 style={{ margin: "0 0 15px", fontSize: 18 }}>Project timelines <span style={{ color: "#64748b" }}>({projects.length})</span></h2>
      {projects.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,310px),1fr))", gap: 12 }}>
        {projects.map(project => <Link href={`/projects/${project.id}`} key={project.id} prefetch={false} style={{ display: "block", textDecoration: "none", color: "#0f172a", border: "1px solid #dbe4ef", borderRadius: 14, padding: 16, background: "#f8fafc" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{project.title}</div>
          <div style={{ color: "#475569", fontSize: 12, marginTop: 5 }}>{project.isManual ? "Manual project · No quote required" : `Linked Production Job · ${project.quoteNumber ?? "Job"}`}{project.clientName ? ` · ${project.clientName}` : ""}</div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#334155", fontSize: 12, marginTop: 14, gap: 12 }}>
            <span>{project.taskCount} scheduled tasks</span><span>{project.dueDate ? `Completed by ${project.dueDate}` : "No completion date"}</span>
          </div>
        </Link>)}
      </div> : <p style={{ color: "#64748b", margin: 0 }}>No project timelines yet. Create one manually or link a Production Job.</p>}
    </section>
  </main>;
}
