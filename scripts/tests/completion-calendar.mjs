import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseCompletionDate, completionMonthGrid, completionMonthShift } from "../../apps/web/src/lib/completion-dates.ts";
const src = (file)=>readFileSync(new URL(`../../apps/web/src/${file}`, import.meta.url),"utf8");
test("date-only completion deadlines reject invalid days and allow clearing",()=>{
 assert.equal(parseCompletionDate("2026-11-05"),"2026-11-05");
 assert.equal(parseCompletionDate("2028-02-29"),"2028-02-29");
 assert.equal(parseCompletionDate(null),null);
 for(const bad of ["2026-02-29","2026-13-01","2026-11-31","2026-11-05T12:00","11/05/2026",{}])
  assert.throws(()=>parseCompletionDate(bad));
});
test("monthly calendar uses Monday starts and is timezone safe",()=>{
 const days=completionMonthGrid("2026-11-05");
 assert.equal(days.length,42);
 assert.equal(days[0],"2026-10-26");
 assert.equal(days[6],"2026-11-01");
 assert.ok(days.includes("2026-11-30"));
 assert.equal(completionMonthShift("2026-12-08",1),"2027-01-01");
 assert.equal(completionMonthShift("2026-01-05",-1),"2025-12-01");
});
test("calendar reads one production job deadline; no task list or expensive material fetch",()=>{
 const page=src("app/(app)/calendar/page.tsx");
 const server=src("server/production.ts");
 assert.match(page,/listProductionCompletionDeadlines/);
 assert.doesNotMatch(page,/listJobTasksForTenant|listProductionCalendarStepsForTenant|listProjectCalendarTasksForTenant/);
 assert.match(server,/LEFT JOIN production\.project_plans plan/);
 assert.match(server,/IS NOT DISTINCT FROM \$4::date/);
 assert.match(server,/UPDATE app\.jobs w SET due_date=updated\.due_date/);
});
test("calendar and project editing share the same endpoint with manager permission and conflict protection",()=>{
 const calendar=src("app/(app)/calendar/CompletionCalendar.tsx");
 const project=src("app/(app)/projects/[id]/CompletionDateEditor.tsx");
 const route=src("app/api/calendar/deadlines/route.ts");
 const projectPage=src("app/(app)/projects/[id]/page.tsx");
 for(const component of [calendar,project]) {
  assert.match(component,/\/api\/calendar\/deadlines/);
  assert.match(component,/expectedDate/);
  assert.match(component,/pm-completion-date/);
 }
 assert.match(projectPage,/initialDate=\{project\.dueDate\}/);
 assert.match(route,/\["owner","manager"\]/);
 assert.match(route,/status:409/);
 assert.doesNotMatch(calendar,/project-tasks|OperationsCalendar/);
});
test("Gantt still allows direct single staff assignment without changing duration",()=>{
 const gantt=src("app/(app)/projects/[id]/GanttTimeline.tsx");
 const server=src("server/project-timelines.ts");
 assert.match(gantt,/Assign staff to \$\{task.title\}/);
 assert.match(gantt,/assignProjectTaskAction/);
 assert.match(server,/assignProjectTaskForTenant/);
 assert.match(server,/assignee_profile_id IS NOT DISTINCT FROM/);
});
