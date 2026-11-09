import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  projectSectionDateRange, projectSectionDateRangeLabel
} from '../../apps/web/src/lib/project-timeline.ts';

const page = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/page.tsx', 'utf8');
const actions = fs.readFileSync('apps/web/src/app/(app)/projects/actions.ts', 'utf8');
const gantt = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx', 'utf8');
const cards = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/ProjectTaskSections.tsx', 'utf8');

const task = (plannedStart, plannedEnd) => ({plannedStart, plannedEnd});

test('section range includes earliest start and latest finish, regardless of task order', () => {
  const values = [
    task('2026-11-14T10:30', '2026-11-14T11:00'),
    task('2026-11-09T08:30', '2026-11-09T09:30'),
    task('2026-11-12T15:00', '2026-11-16T17:15'),
  ];
  assert.deepEqual(projectSectionDateRange(values), {
    start: '2026-11-09T08:30', finish: '2026-11-16T17:15'
  });
  assert.match(projectSectionDateRangeLabel(values), /^Start 9 Nov 2026 08:30 · Finish 16 Nov 2026 17:15$/);
});

test('empty manual Sub Jobs have an honest unscheduled label', () => {
  assert.equal(projectSectionDateRange([]), null);
  assert.equal(projectSectionDateRangeLabel([]), 'No dates scheduled');
});

test('manual sub-job management is collapsed by default and reopens after add/rename/delete', () => {
  assert.match(page, /<details style=\{card\} open=\{expandManualSections\}>/);
  assert.match(page, /Manual Sub Jobs \(\{subJobs\.length\}\)/);
  assert.match(page, /paramsValue\.manageSubJobs === "1"/);
  assert.match(actions, /query\.set\("manageSubJobs", "1"\)/);
  for (const label of ['Sub Job added','Sub Job renamed','Sub Job removed; its tasks are now in General / Unassigned']) {
    assert.ok(actions.includes(`projectRedirect(projectId, "${label}", false, true)`));
  }
  for (const name of ['addManualProjectSectionAction','renameManualProjectSectionAction','removeManualProjectSectionAction']) {
    assert.ok(page.includes(`action={${name}}`));
  }
});

test('Gantt section controls are independent and do not call schedule actions', () => {
  assert.match(gantt, /useState<Record<string, boolean>>\(\{\}\)/);
  assert.match(gantt, /group\.id \?\? "general"/);
  assert.match(gantt, /aria-expanded=\{!collapsed\}/);
  assert.match(gantt, /setCollapsedGroups\(previous =>/);
  assert.match(gantt, /!collapsed \? group\.tasks\.map/);
  assert.match(gantt, /group\.allTasks\.length/);
  assert.match(gantt, /projectSectionDateRangeLabel\(group\.allTasks\)/);
  assert.match(gantt, /allTasks: orderedTasks\.filter/);
  assert.doesNotMatch(gantt.slice(gantt.indexOf('onClick={() => setCollapsedGroups'),gantt.indexOf('onClick={() => setCollapsedGroups')+180), /saveDates|router\.refresh|rescheduleProject/);
});

test('manual section listing and task cards expose full section dates', () => {
  assert.match(page, /projectSectionDateRangeLabel\(tasks\.filter\(task => task\.subJobId === section\.id\)\)/);
  assert.match(cards, /projectSectionDateRangeLabel\(sectionTasks\)/);
});
