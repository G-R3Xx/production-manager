import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { canManageStaff, listUsersForTenant } from "@/server/users";
import {
  listTaskAssignmentDefaultsForTenant,
  TASK_ASSIGNMENT_DEFAULT_KEYS,
  TASK_ASSIGNMENT_DEFAULT_META,
} from "@/server/task-assignment-defaults";
import { saveTaskAssignmentDefaultsAction } from "./actions";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function readParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TaskAssignmentDefaultsPage({ searchParams }: PageProps) {
  const user = await getRequiredSessionUser();
  const tenant = await resolveActiveTenantForAuthUserId(user.id);
  if (!tenant) redirect("/bootstrap");
  const params = (await searchParams) ?? {};
  const [users, saved] = await Promise.all([
    listUsersForTenant(tenant.tenantId),
    listTaskAssignmentDefaultsForTenant(tenant.tenantId),
  ]);
  const staff = users.filter((person) => person.membershipStatus === "active");
  const savedByKey = new Map(saved.map((row) => [row.assignmentKey, row.assigneeProfileIds]));
  const canEdit = canManageStaff(tenant.tenantRole) && tenant.membershipStatus === "active";
  const suggestedNames: Partial<Record<(typeof TASK_ASSIGNMENT_DEFAULT_KEYS)[number], string[]>> = {
    artwork: ["connor"],
    signage_print: ["christine"],
    signage_manufacture: ["joel", "james"],
    small_format: ["daniel"],
    installation: ["joel", "james"],
  };
  const message = readParam(params, "message");
  const error = readParam(params, "error");

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gap: 18 }}>
      <header style={{ background: "#fff", border: "1px solid #e4e7ec", borderRadius: 20, padding: 24 }}>
        <Link href="/settings" style={{ color: "#155eef", textDecoration: "none", fontWeight: 900 }}>← Settings</Link>
        <p style={{ margin: "18px 0 0", fontSize: 12, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em", color: "#4f46e5" }}>Automatic task routing</p>
        <h1 style={{ margin: "6px 0 8px", fontSize: 34, letterSpacing: "-.035em" }}>Default task assignments</h1>
        <p style={{ margin: 0, color: "#475467", lineHeight: 1.6, maxWidth: 880 }}>
          Choose who normally owns each type of work. New jobs and generated production procedures inherit these staff automatically, while managers can still override a whole job or a single procedure without changing these company defaults.
          Where matching active staff exist and no rule has been saved yet, PM initially suggests Connor for artwork, Christine for signage print, Joel + James for manufacture/install, and Daniel for small format.
        </p>
      </header>

      {message ? <div style={{ border: "1px solid #abefc6", background: "#ecfdf3", color: "#067647", borderRadius: 14, padding: 13, fontWeight: 850 }}>{message}</div> : null}
      {error ? <div style={{ border: "1px solid #fda29b", background: "#fff5f4", color: "#b42318", borderRadius: 14, padding: 13, fontWeight: 850 }}>{error}</div> : null}

      <section style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1e3a8a", borderRadius: 16, padding: 16, lineHeight: 1.55 }}>
        <strong>How it works:</strong> the job due date is used as the inherited calendar date until a manager gives the process or individual procedure its own date. The person who actually checks a procedure off is still recorded separately with the completion time.
      </section>

      <form action={saveTaskAssignmentDefaultsAction} style={{ display: "grid", gap: 14 }}>
        {TASK_ASSIGNMENT_DEFAULT_KEYS.map((key) => {
          const meta = TASK_ASSIGNMENT_DEFAULT_META[key];
          const hasSavedRule = savedByKey.has(key);
          const suggested = new Set(suggestedNames[key] ?? []);
          const selected = new Set(hasSavedRule
            ? (savedByKey.get(key) ?? [])
            : staff.filter((person) => {
                const names = `${person.shortName || ""} ${person.fullName || ""}`.toLowerCase();
                return Array.from(suggested).some((name) => new RegExp(`(^|\\s)${name}(\\s|$)`, "i").test(names));
              }).map((person) => person.userProfileId));
          return (
            <section key={key} style={{ background: "#fff", border: "1px solid #e4e7ec", borderRadius: 18, padding: 18, display: "grid", gap: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <span style={{ display: "block", color: "#667085", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em" }}>{meta.group}</span>
                  <h2 style={{ margin: "4px 0 4px", fontSize: 20 }}>{meta.label}</h2>
                  <p style={{ margin: 0, color: "#667085", lineHeight: 1.5 }}>{meta.description}</p>
                </div>
                <span style={{ borderRadius: 999, background: selected.size ? "#ecfdf3" : "#fffbeb", color: selected.size ? "#067647" : "#a16207", padding: "6px 10px", fontSize: 12, fontWeight: 950 }}>
                  {selected.size ? `${selected.size} default ${selected.size === 1 ? "person" : "people"}` : "Unassigned"}
                </span>
              </div>
              <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {staff.map((person) => (
                  <label key={person.userProfileId} style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 38, border: "1px solid #d0d5dd", borderRadius: 999, padding: "0 12px", background: "#fff", color: "#344054", fontWeight: 850, cursor: canEdit ? "pointer" : "default" }}>
                    <input type="checkbox" name={`assignment_${key}`} value={person.userProfileId} defaultChecked={selected.has(person.userProfileId)} />
                    {person.shortName || person.fullName}
                  </label>
                ))}
                {!staff.length ? <span style={{ color: "#b42318" }}>No active staff are available yet.</span> : null}
              </fieldset>
            </section>
          );
        })}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" disabled={!canEdit} style={{ minHeight: 46, border: 0, borderRadius: 13, background: canEdit ? "#0f172a" : "#cbd5e1", color: "#fff", padding: "0 20px", fontWeight: 950, cursor: canEdit ? "pointer" : "not-allowed" }}>Save default assignments</button>
        </div>
      </form>
    </main>
  );
}
