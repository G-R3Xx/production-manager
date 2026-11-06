import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareProjectTaskOrder, reorderProjectTaskIds } from '../../apps/web/src/lib/project-timeline.ts';

test('row reordering moves a task up or down, including the end of a section', () => {
  const ids = ['one', 'two', 'three', 'four'];
  assert.deepEqual(reorderProjectTaskIds(ids, 'four', 'two'), ['one', 'four', 'two', 'three']);
  assert.deepEqual(reorderProjectTaskIds(ids, 'one', 'three', true), ['two', 'three', 'one', 'four']);
  assert.deepEqual(reorderProjectTaskIds(ids, 'two', 'four', true), ['one', 'three', 'four', 'two']);
  assert.deepEqual(ids, ['one', 'two', 'three', 'four']);
});
test('invalid drag source/target and same-row drag leave order untouched', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(reorderProjectTaskIds(ids, 'missing', 'b'), ids);
  assert.deepEqual(reorderProjectTaskIds(ids, 'a', 'missing'), ids);
  assert.deepEqual(reorderProjectTaskIds(ids, 'a', 'a'), ids);
});
test('saved order takes priority over start date while initial same-order tasks use dates', () => {
  const tasks = [
    {id:'late',sortOrder:0,plannedStart:'2026-11-05T12:00'},
    {id:'early',sortOrder:0,plannedStart:'2026-11-05T08:00'},
  ];
  assert.deepEqual([...tasks].sort(compareProjectTaskOrder).map(t=>t.id), ['early','late']);
  assert.deepEqual([...tasks.map(t=>({...t,sortOrder:t.id==='late'?0:1}))].sort(compareProjectTaskOrder).map(t=>t.id),['late','early']);
});
test('reordering is tenant-scoped, atomic, optimistic and does not modify scheduling or production status', () => {
  const source=fs.readFileSync('apps/web/src/server/project-timelines.ts','utf8');
  const fragment=source.slice(source.indexOf('export async function reorderProjectTasksForTenant('));
  const actions=fs.readFileSync('apps/web/src/app/(app)/projects/actions.ts','utf8');
  assert.match(fragment,/p\.tenant_id=\$1::uuid/);
  assert.match(fragment,/COALESCE\(task\.manual_section_id, task\.sub_job_id\) IS NOT DISTINCT FROM \$2::uuid/);
  assert.match(fragment,/FOR UPDATE OF p/);
  assert.match(fragment,/FOR UPDATE/);
  assert.match(fragment,/ROLLBACK/);
  assert.match(fragment,/currentIds\.some\(\(id, i\) => id !== expectedTaskIds\[i\]\)/);
  assert.match(fragment,/SET sort_order=ordered\.ordinality/);
  assert.doesNotMatch(fragment,/SET (?:planned_start|planned_end|allocated_minutes|assignee_profile_id|status)=/);
  assert.match(actions,/requireProjectManager\(\)/);
  assert.match(actions,/reorderProjectTasksForTenant/);
});
test('chart exposes a drag handle plus keyboard-accessible move controls',()=>{
  const ui=fs.readFileSync('apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx','utf8');
  assert.match(ui,/draggable=\{savingId === null\}/);
  assert.match(ui,/onDragOver=/);
  assert.match(ui,/onDrop=/);
  assert.match(ui,/Move \$\{task\.title\}/);
  assert.match(ui,/reorderProjectTasksAction/);
});
test('new tasks append to their own Sub Job order',()=>{
  const src=fs.readFileSync('apps/web/src/server/project-timelines.ts','utf8');
  assert.match(src,/MAX\(previous\.sort_order\) \+ 1/);
  assert.match(src,/COALESCE\(previous\.manual_section_id, previous\.sub_job_id\) IS NOT DISTINCT FROM \$4::uuid/);
  assert.match(src,/previous\.sub_job_id IS NOT DISTINCT FROM source\.sub_job_id/);
});
