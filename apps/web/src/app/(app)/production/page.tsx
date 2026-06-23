export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import {
  listApprovedArtworkReadyForProduction,
  listProductionItemsForJob,
  listProductionJobsForTenant,
  listProductionStepsForJob,
  type ProductionItemRecord,
  type ProductionJobRecord,
  type ProductionStepRecord
} from "@/server/production";
import {
  addProductionStepAction,
  attachPrintReadyFileAction,
  createProductionJobFromArtworkAction,
  deleteProductionJobAction,
  restoreProductionJobAction,
  setProductionJobStatusAction,
  syncProductionJobAction,
  toggleProductionStepAction,
  updateProductionJobDetailsAction
} from "./actions";
import { PrintReadyUploadInputs } from "./PrintReadyUploadInputs";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function statusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === "completed") return { bg: "#dcfae6", fg: "#067647", border: "#abefc6" };
  if (status === "ready_for_dispatch") return { bg: "#e0f2fe", fg: "#075985", border: "#bae6fd" };
  if (status === "in_production") return { bg: "#eef4ff", fg: "#3538cd", border: "#c7d7fe" };
  if (status === "waiting_on_files" || status === "waiting_on_material") return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  if (status === "deleted") return { bg: "#fff5f4", fg: "#b42318", border: "#fecaca" };
  return { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" };
}

function isPdfOrFile(url: string | null | undefined, fileName?: string | null): boolean {
  const text = `${url ?? ""} ${fileName ?? ""}`.toLowerCase().split("?")[0];
  return text.endsWith(".pdf") || text.endsWith(".ai") || text.endsWith(".eps") || text.endsWith(".zip") || text.endsWith(".rar") || text.endsWith(".7z") || text.includes(".pdf ");
}

function proofPreview(item: ProductionItemRecord) {
  if (!item.proofImageUrl) return <div style={{ color: "#667085" }}>No approved proof attached.</div>;
  if (isPdfOrFile(item.proofImageUrl, item.proofFileName)) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 180, gap: 10, background: "#fff", borderRadius: 16, border: "1px dashed #cbd5e1" }}>
        <strong>Approved proof file</strong>
        <a href={item.proofImageUrl} target="_blank" rel="noreferrer" style={{ color: "#6d28d9", fontWeight: 900, textDecoration: "none" }}>{item.proofFileName || "Open proof"}</a>
      </div>
    );
  }
  return <img src={item.proofImageUrl} alt={item.title} style={{ width: "100%", height: 220, objectFit: "contain", objectPosition: "center", display: "block", background: "#fff", borderRadius: 16 }} />;
}

function completionForItem(item: ProductionItemRecord, steps: ProductionStepRecord[]): { done: number; total: number } {
  const itemSteps = steps.filter((step) => step.itemId === item.id);
  return { done: itemSteps.filter((step) => step.status === "done").length, total: itemSteps.length };
}

function pageCompletion(steps: ProductionStepRecord[]): { done: number; total: number } {
  return { done: steps.filter((step) => step.status === "done").length, total: steps.length };
}

const cardStyle = {
  border: "1px solid #dbe4f0",
  borderRadius: 24,
  background: "rgba(255,255,255,0.94)",
  boxShadow: "0 18px 44px rgba(15,23,42,0.06)",
  padding: 18
} as const;

const inputStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "0 13px",
  width: "100%",
  boxSizing: "border-box",
  font: "inherit",
  background: "#fff"
} as const;

const textareaStyle = {
  minHeight: 92,
  borderRadius: 14,
  border: "1px solid #cfd9e8",
  padding: "12px 14px",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#fff"
} as const;

const labelStyle = {
  display: "grid",
  gap: 7,
  fontSize: 12,
  fontWeight: 900,
  color: "#344054"
} as const;

const buttonStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: "none",
  background: "#6d28d9",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  padding: "0 16px"
} as const;

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "#fff",
  color: "#344054",
  border: "1px solid #cfd9e8"
} as const;

function statusButton(job: ProductionJobRecord, status: string, label: string, tone?: string) {
  const active = job.status === status;
  return (
    <form action={setProductionJobStatusAction}>
      <input type="hidden" name="jobId" value={job.id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        style={{
          ...secondaryButtonStyle,
          minHeight: 40,
          background: active ? (tone || "#0f172a") : "#fff",
          color: active ? "#fff" : "#344054",
          borderColor: active ? (tone || "#0f172a") : "#cfd9e8"
        }}
      >
        {label}
      </button>
    </form>
  );
}

export default async function ProductionPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!activeTenant) {
    redirect("/bootstrap");
    throw new Error("Active tenant is required");
  }
  const tenantId = activeTenant.tenantId;

  const params = (await searchParams) ?? {};
  const message = readParam(params, "message");
  const error = readParam(params, "error");
  const selectedParam = readParam(params, "selected");
  const filter = readParam(params, "filter");

  const [allJobs, approvedArtwork] = await Promise.all([
    listProductionJobsForTenant(tenantId, { includeDeleted: true }),
    listApprovedArtworkReadyForProduction(tenantId)
  ]);
  const deletedJobCount = allJobs.filter((job) => job.status === "deleted").length;
  const jobs = filter === "deleted" ? allJobs.filter((job) => job.status === "deleted") : allJobs.filter((job) => job.status !== "deleted");
  const selectedJob = selectedParam ? allJobs.find((job) => job.id === selectedParam) ?? jobs[0] ?? null : jobs[0] ?? null;
  let items: ProductionItemRecord[] = [];
  let steps: ProductionStepRecord[] = [];
  if (selectedJob) {
    [items, steps] = await Promise.all([listProductionItemsForJob(selectedJob.id), listProductionStepsForJob(selectedJob.id)]);
  }
  const complete = pageCompletion(steps);
  const readyCount = allJobs.filter((job) => job.status === "ready_to_start").length;
  const inProductionCount = allJobs.filter((job) => job.status === "in_production").length;
  const waitingCount = allJobs.filter((job) => job.status === "waiting_on_files" || job.status === "waiting_on_material").length;
  const readyDispatchCount = allJobs.filter((job) => job.status === "ready_for_dispatch").length;

  return (
    <div style={{ maxWidth: 1540, margin: "0 auto", display: "grid", gap: 18 }}>
      {message ? <section style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 16, padding: 14 }}>{message}</section> : null}
      {error ? <section style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 16, padding: 14 }}>{error}</section> : null}

      <section style={{ ...cardStyle, display: "grid", gap: 12, background: "linear-gradient(135deg, #ffffff 0%, #f7fbff 55%, #eef4ff 100%)" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2563eb" }}>Production</p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "start" }}>
          <div style={{ display: "grid", gap: 8, minWidth: 280 }}>
            <h1 style={{ margin: 0, fontSize: 38, letterSpacing: "-0.04em" }}>Production chain</h1>
            <p style={{ margin: 0, color: "#475467", lineHeight: 1.6 }}>Approved artwork turns into a production job with print-ready files, item-level procedures and staff checkoff. Client proof stays separate from the actual file used to print, cut, route or finish.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(110px, 1fr))", gap: 10, minWidth: 460 }}>
            {[
              ["Ready", readyCount],
              ["Waiting", waitingCount],
              ["In production", inProductionCount],
              ["Ready out", readyDispatchCount]
            ].map(([label, count]) => (
              <div key={String(label)} style={{ border: "1px solid #dbe4f0", borderRadius: 18, padding: 12, background: "rgba(255,255,255,0.78)" }}>
                <strong style={{ fontSize: 24 }}>{count}</strong>
                <div style={{ color: "#667085", fontSize: 12, fontWeight: 800 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>{filter === "deleted" ? "Deleted production jobs" : "Production jobs"}</h2>
            <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 13 }}>Select a production job. The job detail and procedure below use the full page width.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <a href="/production" style={{ color: filter === "deleted" ? "#667085" : "#2563eb", fontWeight: 900, textDecoration: "none" }}>Active</a>
            <a href="/production?filter=deleted" style={{ color: filter === "deleted" ? "#2563eb" : "#667085", fontWeight: 900, textDecoration: "none" }}>Deleted ({deletedJobCount})</a>
            <span style={{ borderRadius: 999, background: "#eef4ff", color: "#3538cd", padding: "7px 11px", fontSize: 12, fontWeight: 950 }}>{jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {jobs.map((job) => {
            const tone = statusTone(job.status);
            const isSelected = selectedJob?.id === job.id;
            return (
              <a key={job.id} href={`/production?selected=${job.id}${filter === "deleted" ? "&filter=deleted" : ""}`} style={{ minWidth: 290, border: isSelected ? "1px solid #93c5fd" : "1px solid #dbe4f0", borderRadius: 18, padding: 14, background: isSelected ? "#eff6ff" : "#fff", textDecoration: "none", color: "inherit", display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.clientName}</strong>
                  <span style={{ borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, padding: "4px 8px", fontSize: 11, fontWeight: 950 }}>{statusLabel(job.status)}</span>
                </div>
                <span style={{ color: "#475467", fontSize: 13 }}>{job.quoteNumber ?? "No quote number"}{job.projectName ? ` · ${job.projectName}` : ""}</span>
                <span style={{ color: "#667085", fontSize: 12 }}>Due {formatDate(job.dueDate)} · {job.assignedTo || "Unassigned"}</span>
              </a>
            );
          })}
          {jobs.length === 0 ? <div style={{ color: "#667085", padding: 8 }}>No production jobs yet.</div> : null}
        </div>
      </section>

      {approvedArtwork.length > 0 ? (
        <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>Approved artwork ready to start</h2>
            <p style={{ margin: "4px 0 0", color: "#667085" }}>Approved artwork packs that do not yet have a production job.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {approvedArtwork.map((approval) => (
              <form key={approval.approvalId} action={createProductionJobFromArtworkAction} style={{ border: "1px solid #dbe4f0", borderRadius: 18, padding: 14, background: "#fbfdff", display: "grid", gap: 8 }}>
                <input type="hidden" name="approvalId" value={approval.approvalId} />
                <strong>{approval.clientName}</strong>
                <span style={{ color: "#475467", fontSize: 13 }}>{approval.quoteNumber ?? "Quote"}{approval.projectName ? ` · ${approval.projectName}` : ""}</span>
                <span style={{ color: "#667085", fontSize: 12 }}>{approval.pageCount} approved proof page{approval.pageCount === "1" ? "" : "s"} · Approved {formatDateTime(approval.approvedAt)}</span>
                <button type="submit" style={buttonStyle}>Create production job</button>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {selectedJob ? (
        <section style={{ display: "grid", gap: 18 }}>
          <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "start" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <p style={{ margin: 0, color: "#667085", fontWeight: 850 }}>{selectedJob.quoteNumber ?? "Production job"}</p>
                <h2 style={{ margin: 0, fontSize: 32 }}>{selectedJob.clientName}</h2>
                <p style={{ margin: 0, color: "#475467" }}>{selectedJob.projectName ?? "Production from approved artwork"}{selectedJob.contactName ? ` · ${selectedJob.contactName}` : ""}</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ borderRadius: 999, background: statusTone(selectedJob.status).bg, color: statusTone(selectedJob.status).fg, border: `1px solid ${statusTone(selectedJob.status).border}`, padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{statusLabel(selectedJob.status)}</span>
                <span style={{ borderRadius: 999, background: "#f8fafc", border: "1px solid #dbe4f0", color: "#344054", padding: "8px 12px", fontSize: 12, fontWeight: 950 }}>{complete.done}/{complete.total} steps done</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {statusButton(selectedJob, "ready_to_start", "Ready to start")}
              {statusButton(selectedJob, "waiting_on_files", "Waiting on files", "#c2410c")}
              {statusButton(selectedJob, "waiting_on_material", "Waiting on material", "#c2410c")}
              {statusButton(selectedJob, "in_production", "In production", "#3538cd")}
              {statusButton(selectedJob, "ready_for_dispatch", "Ready for install / pickup", "#075985")}
              {statusButton(selectedJob, "completed", "Complete", "#067647")}
              <form action={syncProductionJobAction}>
                <input type="hidden" name="jobId" value={selectedJob.id} />
                <button type="submit" style={secondaryButtonStyle}>Sync from artwork pages</button>
              </form>
              {selectedJob.status === "deleted" ? (
                <form action={restoreProductionJobAction}>
                  <input type="hidden" name="jobId" value={selectedJob.id} />
                  <button type="submit" style={{ ...secondaryButtonStyle, color: "#067647", borderColor: "#abefc6" }}>Restore</button>
                </form>
              ) : (
                <form action={deleteProductionJobAction}>
                  <input type="hidden" name="jobId" value={selectedJob.id} />
                  <button type="submit" style={{ ...secondaryButtonStyle, color: "#b42318", borderColor: "#fecaca" }}>Delete</button>
                </form>
              )}
            </div>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 14 }}>
            <h2 style={{ margin: 0 }}>Job details</h2>
            <form action={updateProductionJobDetailsAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="jobId" value={selectedJob.id} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                <label style={labelStyle}>Priority<input name="priority" defaultValue={selectedJob.priority ?? "normal"} placeholder="normal / urgent" style={inputStyle} /></label>
                <label style={labelStyle}>Due date<input name="dueDate" type="date" defaultValue={selectedJob.dueDate ?? ""} style={inputStyle} /></label>
                <label style={labelStyle}>Assigned to<input name="assignedTo" defaultValue={selectedJob.assignedTo ?? ""} placeholder="Staff member" style={inputStyle} /></label>
                <div style={{ display: "grid", alignItems: "end" }}><button type="submit" style={buttonStyle}>Save job details</button></div>
              </div>
              <label style={labelStyle}>Internal production notes<textarea name="internalNotes" defaultValue={selectedJob.internalNotes ?? ""} placeholder="Notes for production staff" style={textareaStyle} /></label>
            </form>
          </section>

          <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <div>
              <h2 style={{ margin: 0 }}>Production items</h2>
              <p style={{ margin: "4px 0 0", color: "#667085" }}>Each approved artwork page becomes one production item. Attach the print-ready file used for print/cut/router/RIP, then check off the procedure.</p>
            </div>
            {items.map((item) => {
              const itemSteps = steps.filter((step) => step.itemId === item.id);
              const itemComplete = completionForItem(item, steps);
              return (
                <article key={item.id} style={{ border: "1px solid #dbe4f0", borderRadius: 22, padding: 16, background: "#fbfdff", display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.8fr) minmax(0, 1.2fr)", gap: 16, alignItems: "start" }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      {proofPreview(item)}
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>{item.itemCode ? `${item.itemCode} · ` : ""}{item.title}</strong>
                        <span style={{ color: "#667085", fontSize: 13 }}>Qty {item.quantity} · {item.productionType.replace(/_/g, " ")} · {itemComplete.done}/{itemComplete.total} steps</span>
                        {[item.sizeSummary, item.substrateSummary, item.colourSummary, item.finishingSummary].filter(Boolean).map((line, index) => <span key={index} style={{ color: "#475467", fontSize: 13, whiteSpace: "pre-wrap" }}>{line}</span>)}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 14 }}>
                      <section style={{ border: "1px solid #e4e7ec", borderRadius: 18, padding: 14, background: "#fff", display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <strong>Print-ready artwork</strong>
                          {item.printReadyUrl ? <span style={{ color: "#067647", fontWeight: 950, fontSize: 12 }}>Attached {formatDateTime(item.printReadyUploadedAt)}</span> : <span style={{ color: "#c2410c", fontWeight: 950, fontSize: 12 }}>Waiting on file</span>}
                        </div>
                        {item.printReadyUrl ? (
                          <div style={{ display: "grid", gap: 4, color: "#475467", fontSize: 13 }}>
                            <a href={item.printReadyUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: 900, textDecoration: "none" }}>{item.printReadyFileName || "Open print-ready file"}</a>
                            <span>{item.printReadyFileType || "File"}{item.printReadyUploadedBy ? ` · uploaded by ${item.printReadyUploadedBy}` : ""}</span>
                            {item.printReadyNotes ? <span style={{ whiteSpace: "pre-wrap" }}>{item.printReadyNotes}</span> : null}
                          </div>
                        ) : null}
                        <form action={attachPrintReadyFileAction} style={{ display: "grid", gap: 8 }}>
                          <PrintReadyUploadInputs itemId={item.id} />
                          <textarea name="printReadyNotes" placeholder="Optional print-ready file notes / version / RIP notes" style={{ ...textareaStyle, minHeight: 68 }} />
                          <button type="submit" style={secondaryButtonStyle}>Save pasted file link manually</button>
                        </form>
                      </section>

                      <section style={{ display: "grid", gap: 8 }}>
                        <strong>Procedure checkoff</strong>
                        <div style={{ display: "grid", gap: 8 }}>
                          {itemSteps.map((step) => (
                            <form key={step.id} action={toggleProductionStepAction} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", border: "1px solid #e4e7ec", borderRadius: 14, padding: 10, background: step.status === "done" ? "#ecfdf3" : "#fff" }}>
                              <input type="hidden" name="stepId" value={step.id} />
                              <input type="hidden" name="currentStatus" value={step.status} />
                              <button type="submit" aria-label={step.status === "done" ? "Reopen step" : "Check off step"} style={{ width: 30, height: 30, borderRadius: 999, border: step.status === "done" ? "1px solid #12b76a" : "1px solid #cfd9e8", background: step.status === "done" ? "#12b76a" : "#fff", color: "#fff", cursor: "pointer", fontWeight: 950 }}>{step.status === "done" ? "✓" : ""}</button>
                              <div style={{ display: "grid", gap: 2 }}>
                                <strong style={{ fontSize: 14 }}>{step.label}</strong>
                                {step.status === "done" ? <span style={{ color: "#067647", fontSize: 12 }}>Checked by {step.checkedBy || "staff"} · {formatDateTime(step.checkedAt)}</span> : <span style={{ color: "#667085", fontSize: 12 }}>Pending</span>}
                              </div>
                              <span style={{ color: "#667085", fontSize: 11, fontWeight: 850 }}>{step.stepType.replace(/_/g, " ")}</span>
                            </form>
                          ))}
                        </div>
                        <form action={addProductionStepAction} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                          <input type="hidden" name="jobId" value={selectedJob.id} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <input name="label" placeholder="Add manual step for this item" style={inputStyle} />
                          <button type="submit" style={secondaryButtonStyle}>Add step</button>
                        </form>
                      </section>
                    </div>
                  </div>
                </article>
              );
            })}
            {items.length === 0 ? <p style={{ margin: 0, color: "#667085" }}>No production items yet. Sync from artwork pages or create production from an approved artwork approval.</p> : null}
          </section>
        </section>
      ) : null}
    </div>
  );
}
