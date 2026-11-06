import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const source = fs.readFileSync('apps/web/src/server/project-timelines.ts','utf8');
const schema = fs.readFileSync('infra/sql/066_manual_project_plans.sql','utf8');

function getModule(pool) {
  const compiled = ts.transpileModule(source,{compilerOptions:{module: ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  assert.equal(compiled.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error).length ?? 0,0);
  const exports={};
  const sandbox={ exports, require: (name) => {
    if (name==='server-only') return {};
    if (name==='@production-manager/db') return {pool};
    if (name==='@/lib/project-timeline') return {parseProjectSchedule: v => {
      if (v.plannedEnd <= v.plannedStart) throw new Error('End must be after start');
      return {plannedStart:v.plannedStart,plannedEnd:v.plannedEnd,allocatedMinutes:Math.round(Number(v.allocatedHours)*60)};
    }};
    throw new Error(name);
  }, console};
  vm.runInNewContext(compiled.outputText,sandbox);
  return exports;
}
const tenant = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const section = '33333333-3333-4333-8333-333333333333';
const task = '44444444-4444-4444-8444-444444444444';

test('schema separates manual projects/sections from quote sub jobs and retains existing FK',()=>{
  assert.match(schema,/ALTER COLUMN production_job_id DROP NOT NULL/);
  assert.match(schema,/manual_title varchar\(200\)/);
  assert.match(schema,/project_manual_sections/);
  assert.match(schema,/manual_section_same_project FOREIGN KEY \(project_id, manual_section_id\)/);
  assert.match(schema,/ON DELETE SET NULL \(manual_section_id\)/);
  assert.match(schema,/NOT \(sub_job_id IS NOT NULL AND manual_section_id IS NOT NULL\)/);
  assert.doesNotMatch(schema,/ALTER TABLE sales\.quote_sub_jobs/);
});

test('manual project creation inserts only project plan, no quote/production job/MYOB writes',async()=>{
  const calls=[];
  const api=getModule({query:async (sql,params)=>{calls.push({sql,params});return {rows:[{id:project}],rowCount:1};}});
  assert.equal(await api.createManualProjectPlan(tenant,'  NGA installation  ',' National Gallery  '),project);
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/INSERT INTO production\.project_plans\(tenant_id, manual_title, manual_client_name\)/);
  assert.deepEqual(Array.from(calls[0].params),[tenant,'NGA installation','National Gallery']);
  await assert.rejects(api.createManualProjectPlan(tenant,' '.repeat(3),'Client'),/Project name/);
  assert.equal(calls.length,1);
});

test('section creation/rename/removal are project scoped and preserve tasks on delete',async()=>{
  const calls=[];
  const api=getModule({query:async (sql,params)=>{calls.push({sql,params});return {rowCount:1};}});
  assert.equal(await api.addManualProjectSection(tenant,project,' Wall 1 '),true);
  assert.equal(await api.renameManualProjectSection(tenant,project,section,' Wall 2 '),true);
  assert.equal(await api.removeManualProjectSection(tenant,project,section),true);
  assert.equal(calls.length,3);
  for (const {sql} of calls) {
    assert.match(sql,/tenant_id=\$1::uuid/);
    assert.match(sql,/production_job_id IS NULL/);
    assert.match(sql,/project_manual_sections/);
  }
  assert.doesNotMatch(calls[2].sql,/DELETE FROM production\.project_timeline_tasks/);
  assert.deepEqual(Array.from(calls[0].params),[tenant,project,'Wall 1']);
});

test('manual tasks validate manual section or quote section by project kind, keep assignee checks',async()=>{
  let sql=''; let params=[];
  const api=getModule({query:async (text,values)=>{sql=text;params=values;return {rowCount:1};}});
  assert.equal(await api.addProjectTask(tenant,project,{title:'Print artwork',subJobId:section,
    plannedStart:'2026-11-09T08:00',plannedEnd:'2026-11-09T10:00',allocatedHours:'2',assigneeProfileId:null,status:'planned',notes:null}),true);
  assert.match(sql,/FROM production\.project_manual_sections ms WHERE ms\.id=\$4::uuid AND ms\.project_id=p\.id/);
  assert.match(sql,/CASE WHEN scope\.production_job_id IS NULL THEN \$4::uuid ELSE NULL END/);
  assert.match(sql,/m\.status='active'/);
  assert.equal(params[3],section);
  assert.equal(params[6],120);
  assert.equal(await api.updateProjectTask(tenant,project,task,{title:'Finish artwork',subJobId:null,
    plannedStart:'2026-11-09T08:00',plannedEnd:'2026-11-09T10:00',allocatedHours:'1',assigneeProfileId:null,status:'completed',notes:null}),true);
  assert.match(sql,/manual_section_id=CASE WHEN scope\.production_job_id IS NULL THEN \$5::uuid ELSE NULL END/);
  assert.equal(params[4],null);
});

test('Gantt schedule writes, assignment and revision allow standalone plans, reject deleted linked jobs',async()=>{
  const calls=[];
  const api=getModule({query:async (sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[{revision:'2026-11-07T12:00:00'}]};}});
  assert.equal(await api.rescheduleProjectTask(tenant,project,task,{plannedStart:'2026-11-09T09:00',plannedEnd:'2026-11-09T10:00',expectedStart:'2026-11-09T08:00',expectedEnd:'2026-11-09T09:00'}),true);
  assert.equal(await api.assignProjectTaskForTenant(tenant,project,task,null,null),true);
  assert.equal(await api.getProjectRevision(tenant,project),'2026-11-07T12:00:00');
  for(const {sql} of calls) assert.match(sql,/production_job_id IS NULL/);
  assert.match(calls[0].sql,/task\.planned_start=\$6::timestamp AND task\.planned_end=\$7::timestamp/);
  assert.doesNotMatch(calls[0].sql,/SET allocated_minutes/);
});

test('UI offers explicit standalone create, editable manual Sub Jobs and preserves linked job actions',()=>{
  const home = fs.readFileSync('apps/web/src/app/(app)/projects/page.tsx','utf8');
  const page = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/page.tsx','utf8');
  const actions = fs.readFileSync('apps/web/src/app/(app)/projects/actions.ts','utf8');
  assert.match(home,/action=\{createManualProjectPlanAction\}/);
  assert.match(home,/action=\{createProjectPlanAction\}/);
  assert.match(page,/action=\{addManualProjectSectionAction\}/);
  assert.match(page,/action=\{renameManualProjectSectionAction\}/);
  assert.match(page,/action=\{removeManualProjectSectionAction\}/);
  assert.match(page,/project\.isManual/);
  assert.match(actions,/requireProjectManager\(\)/);
  assert.match(page,/\<GanttTimeline/);
});
