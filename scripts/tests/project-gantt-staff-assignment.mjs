import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const actionsSource = fs.readFileSync('apps/web/src/app/(app)/projects/actions.ts', 'utf8');
const serverSource = fs.readFileSync('apps/web/src/server/project-timelines.ts', 'utf8');
const gantt = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx', 'utf8');
const sections = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/ProjectTaskSections.tsx', 'utf8');
const tenant = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const personId = '44444444-4444-4444-8444-444444444444';
const snapshot = assignedTo => ({ id: taskId, projectId: project, title: 'Print Graphics',
  plannedStart: '2026-11-09T09:00', plannedEnd: '2026-11-09T17:00', allocatedMinutes: 60,
  subJobId: null, productionStepId: null, assigneeProfileId: assignedTo,
  assigneeName: assignedTo ? 'Connor' : null, status: 'planned', productionStepStatus: null,
  notes: null, sortOrder: 0 });
function mocks({ role='manager', accepted=true, savedAssignee=personId }={}) {
  const calls=[];
  const dependencies={
    'node:crypto': { randomUUID },
    'next/navigation': { redirect:()=>{throw Error('Unexpected redirect');} },
    'next/cache': { revalidatePath:()=>{throw Error('Unexpected revalidation');} },
    '@/server/auth/session': {getRequiredSessionUser:async()=>({id:'test-user'})},
    '@/server/bootstrap/activeTenant': {resolveActiveTenantForAuthUserId:async()=>({tenantId:tenant,tenantRole:role,membershipStatus:'active'})},
    '@/server/project-timelines': {
      assignProjectTaskForTenant:async(...args)=>{calls.push(['write',...args]);return accepted;},
      getProjectTaskForTenant:async(...args)=>{calls.push(['read',...args]);return snapshot(savedAssignee);},
      getProjectRevision:async(...args)=>{calls.push(['revision',...args]);return '2026-11-10 10:00:00+11';}
    }
  };
  const output = ts.transpileModule(actionsSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require:name=>{if(!dependencies[name])throw Error('Unmocked '+name);return dependencies[name];},console,performance,FormData });
  return {api:exports,calls};
}

test('Gantt assignment returns the actual confirmed task and revision, without navigation',async()=>{
  const {api,calls}=mocks();
  const result = await api.assignProjectTaskAction({projectId:project,taskId,assigneeProfileId:personId,expectedAssigneeProfileId:null});
  assert.equal(result.ok,true);
  assert.equal(result.task.assigneeProfileId,personId);
  assert.equal(result.task.assigneeName,'Connor');
  assert.equal(result.revision,'2026-11-10 10:00:00+11');
  assert.deepEqual(calls.map(row=>row[0]),['write','read','revision']);
  assert.deepEqual(Array.from(calls[0].slice(1)),[tenant,project,taskId,personId,null]);
});
test('removing an assignee returns the unassigned task',async()=>{
  const {api}=mocks({savedAssignee:null});
  const result=await api.assignProjectTaskAction({projectId:project,taskId,assigneeProfileId:null,expectedAssigneeProfileId:personId});
  assert.equal(result.ok,true);
  assert.equal(result.task.assigneeProfileId,null);
  assert.equal(result.task.assigneeName,null);
});
test('stale assignment rejects without claiming success or reading a different task',async()=>{
  const {api,calls}=mocks({accepted:false});
  const result=await api.assignProjectTaskAction({projectId:project,taskId,assigneeProfileId:personId,expectedAssigneeProfileId:null});
  assert.equal(result.ok,false);
  assert.deepEqual(calls.map(row=>row[0]),['write']);
});
test('ordinary staff cannot assign on the server',async()=>{
  const {api,calls}=mocks({role:'staff'});
  await assert.rejects(api.assignProjectTaskAction({projectId:project,taskId,assigneeProfileId:personId,expectedAssigneeProfileId:null}),/Only workspace owners and managers/);
  assert.equal(calls.length,0);
});
test('DB assignment uses compare-and-swap with tenant and active membership checks',()=>{
  assert.match(serverSource,/assignProjectTaskForTenant\(/);
  assert.match(serverSource,/task\.assignee_profile_id IS NOT DISTINCT FROM \$5::uuid/);
  assert.match(serverSource,/m\.tenant_id=\$1::uuid AND m\.user_profile_id=\$4::uuid AND m\.status='active'/);
});
test('Gantt assignment updates confirmed in-page snapshot instead of refreshing stale task data',()=>{
  const assignStart=gantt.indexOf('async function saveAssignee(');
  const assignEnd=gantt.indexOf('async function saveDates(', assignStart);
  const section=gantt.slice(assignStart,assignEnd);
  assert.match(section,/setSavedAssignees\(previous => \(\{\.\.\.previous, \[task\.id\]: nextAssignee\}\)\)/);
  assert.match(section,/window\.dispatchEvent\(new CustomEvent\("pm-project-task-saved"/);
  assert.match(section,/task: result\.task, revision: result\.revision/);
  assert.doesNotMatch(section,/router\.refresh\(/);
  assert.match(gantt,/setInlineTaskChanges\(previous => \(\{ \.\.\.previous, \[detail\.task\.id\]: detail\.task \}\)\)/);
  assert.match(sections,/window\.addEventListener\("pm-project-task-saved", receive\)/);
});
