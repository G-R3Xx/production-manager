import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const actionSource = fs.readFileSync('apps/web/src/app/(app)/projects/actions.ts', 'utf8');
const serverSource = fs.readFileSync('apps/web/src/server/project-timelines.ts', 'utf8');
const pageSource = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/page.tsx', 'utf8');
const formSource = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/ProjectTaskForm.tsx', 'utf8');
const ganttSource = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx', 'utf8');
const tenantId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const input = { title: 'Make signage', subJobId: null, plannedStart: '2026-11-09T08:00',
  plannedEnd: '2026-11-09T09:30', allocatedHours: '1.5', assigneeProfileId: null,
  status: 'planned', notes: null };
const form = taskId => {
  const data = new FormData();
  data.set('projectId', projectId);
  if (taskId) data.set('taskId', taskId);
  for (const [key,value] of Object.entries(input)) if (value!==null) data.set(key, value);
  return data;
};
const exampleTask = id => ({ id, projectId, subJobId: null, productionStepId: null,
  title: input.title, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd,
  allocatedMinutes:90, assigneeProfileId:null, assigneeName:null, status:'planned',
  notes:null, productionStepStatus:null, sortOrder:0 });

function mockActions({ role='manager', databaseSave=true }={}) {
  const calls=[];
  const mocks={
    'node:crypto': { randomUUID },
    'next/navigation': {redirect:()=>{throw Error('Unexpected redirect');}},
    'next/cache': {revalidatePath:()=>{throw Error('Unexpected revalidation');}},
    '@/server/auth/session':{getRequiredSessionUser:async()=>({id:'user',email:null})},
    '@/server/bootstrap/activeTenant':{resolveActiveTenantForAuthUserId:async()=>({tenantId,tenantRole:role,membershipStatus:'active'})},
    '@/server/project-timelines':{
      addProjectTask:async(...args)=>{ calls.push(['add',...args]); return databaseSave; },
      updateProjectTask:async(...args)=>{ calls.push(['edit',...args]); return databaseSave; },
      getProjectTaskForTenant:async(_tenant,_project,id)=>{ calls.push(['read',id]); return exampleTask(id); },
    }
  };
  const c=ts.transpileModule(actionSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const moduleExports={};
  vm.runInNewContext(c.outputText,{exports:moduleExports,require:n=>{
    if (!mocks[n]) throw Error('Unmocked import: '+n);
    return mocks[n];
  },console,performance,FormData});
  return {api:moduleExports,calls};
}

test('create task writes once, returns the saved row, without redirect/revalidation',async()=>{
  const {api,calls}=mockActions();
  const result=await api.saveProjectTaskInlineAction(form());
  assert.equal(result.ok,true);
  assert.equal(result.task.title,input.title);
  assert.match(result.task.id,/^[0-9a-f-]{36}$/);
  assert.deepEqual(calls.map(c=>c[0]),['add','read']);
  assert.equal(calls[0][1],tenantId);
  assert.equal(calls[0][2],projectId);
  assert.equal(calls[0][4],result.task.id);
  for (const field of ['authMs','writeMs','readMs','totalMs']) assert.ok(result.timings[field]>=0);
});
test('edit task uses existing ID, does not create a second task or revalidate the project',async()=>{
  const {api,calls}=mockActions();
  const result=await api.saveProjectTaskInlineAction(form(taskId));
  assert.equal(result.ok,true);
  assert.equal(result.task.id,taskId);
  assert.deepEqual(calls.map(c=>c[0]),['edit','read']);
  assert.equal(calls[0][3],taskId);
});
test('failed save and unauthorised manager return errors without exposing task data',async()=>{
  const rejected=mockActions({databaseSave:false});
  const result=await rejected.api.saveProjectTaskInlineAction(form());
  assert.equal(result.ok,false);
  assert.deepEqual(rejected.calls.map(c=>c[0]),['add']);
  const staff=mockActions({role:'staff'});
  const denied=await staff.api.saveProjectTaskInlineAction(form());
  assert.equal(denied.ok,false);
  assert.equal(staff.calls.length,0);
});
test('new task UUID and tenant-scoped single-row read use indexed lookups',async()=>{
  const calls=[];
  const moduleExports={};
  const output=ts.transpileModule(serverSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(output,{exports:moduleExports, require:n=>{
    if (n==='server-only') return {};
    if (n==='@production-manager/db') return {pool:{query:async (sql,args)=>{
      calls.push({sql,args});
      return {rowCount:1,rows:[exampleTask(taskId)]};
    }}};
    if (n==='@/lib/project-timeline') return {parseProjectSchedule:d=>({plannedStart:d.plannedStart,plannedEnd:d.plannedEnd,allocatedMinutes:90})};
    throw Error(n);
  }});
  assert.equal(await moduleExports.addProjectTask(tenantId,projectId,input,taskId),true);
  assert.equal(calls[0].args.at(-1),taskId);
  assert.match(calls[0].sql,/COALESCE\(\$11::uuid, gen_random_uuid\(\)\)/);
  const result=await moduleExports.getProjectTaskForTenant(tenantId,projectId,taskId);
  assert.equal(result.id,taskId);
  assert.deepEqual(Array.from(calls[1].args),[tenantId,projectId,taskId]);
  assert.match(calls[1].sql,/task\.id = \$3::uuid/);
  assert.match(calls[1].sql,/p\.tenant_id = \$1::uuid/);
  assert.match(calls[1].sql,/LIMIT 1/);
});
test('client form confirms save before background refresh; Gantt receives a confirmed task event',()=>{
  assert.match(pageSource,/<ProjectTaskForm projectId=\{id\} mode="create">/);
  assert.match(pageSource,/<ProjectTaskForm projectId=\{id\} taskId=\{task\.id\} mode="edit">/);
  assert.doesNotMatch(pageSource,/action=\{(?:addProjectTaskAction|updateProjectTaskAction)\}/);
  assert.match(formSource,/await saveProjectTaskInlineAction\(form\)/);
  assert.match(formSource,/setFeedback\(\{ success: true/);
  assert.match(formSource,/window\.dispatchEvent\(new CustomEvent\("pm-project-task-saved"/);
  assert.match(formSource,/startRefresh\(\(\) => router\.refresh\(\)\)/);
  assert.doesNotMatch(formSource,/new BroadcastChannel\(/, 'avoid a duplicate same-tab full-project refresh');
  assert.match(ganttSource,/window\.addEventListener\("pm-project-task-saved", receive\)/);
  assert.match(ganttSource,/Object\.values\(inlineTaskChanges\)\.filter/);
  assert.match(ganttSource,/orderedTasks\.length === 0/);
});
