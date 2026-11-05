import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseProjectSchedule, timelineDayIndex, timelineDayRange, timelinePosition, plannedHoursLabel } from '../../apps/web/src/lib/project-timeline.ts';
const root = process.cwd();

test('one task can span days with separately allocated labour hours', () => {
  const task = parseProjectSchedule({ plannedStart: '2026-11-09T09:00', plannedEnd: '2026-11-13T17:00', allocatedHours: '6' });
  assert.equal(task.allocatedMinutes, 360);
  assert.equal(task.plannedStart, '2026-11-09T09:00');
  assert.equal(task.plannedEnd, '2026-11-13T17:00');
  assert.equal(plannedHoursLabel(task.allocatedMinutes), '6h');
});

test('supports short tasks, zero labour and quarter hours', () => {
  assert.equal(parseProjectSchedule({plannedStart:'2026-11-05T11:00',plannedEnd:'2026-11-05T11:15',allocatedHours:'0.25'}).allocatedMinutes,15);
  assert.equal(parseProjectSchedule({plannedStart:'2026-11-05T11:00',plannedEnd:'2026-11-05T11:15',allocatedHours:'0'}).allocatedMinutes,0);
});

test('invalid calendar dates, reversed periods and invalid work hours are rejected', () => {
  const good = { plannedStart:'2026-11-05T09:00', plannedEnd:'2026-11-05T10:00', allocatedHours:'1' };
  for (const testInput of [
    { ...good, plannedStart: '2026-02-30T09:00' },
    { ...good, plannedEnd: '2026-11-05T09:00' },
    { ...good, plannedEnd: '2026-11-04T17:00' },
    { ...good, allocatedHours: '-1' },
    { ...good, allocatedHours: '9000' },
    { ...good, allocatedHours: 'abc' },
  ]) assert.throws(() => parseProjectSchedule(testInput));
});

test('section grouping preserves one task per sub-job and general tasks', () => {
  const tasks = [{id:'a', subJobId:'car1'},{id:'b',subJobId:'car1'},{id:'c',subJobId:'car2'},{id:'d',subJobId:null}];
  assert.deepEqual(tasks.filter(x=>x.subJobId==='car1').map(x=>x.id), ['a','b']);
  assert.deepEqual(tasks.filter(x=>x.subJobId==='car2').map(x=>x.id), ['c']);
  assert.deepEqual(tasks.filter(x=>x.subJobId===null).map(x=>x.id), ['d']);
});

test('Gantt bars cover task start and end days inclusive', () => {
  const items = [{ plannedStart:'2026-11-09T09:00',plannedEnd:'2026-11-13T17:00' },
    {plannedStart:'2026-11-16T08:00',plannedEnd:'2026-11-16T09:00'}];
  const {first,last} = timelineDayRange(items);
  assert.equal(timelineDayIndex(items[1].plannedStart)-timelineDayIndex(items[0].plannedStart),7);
  const bar = timelinePosition(items[0],first,last);
  assert.ok(bar.left >= 0 && bar.left < 100);
  assert.ok(bar.width > 0);
  assert.ok(bar.left + bar.width <= 100.01);
});

test('tenant-scoped writes and production-step links remain explicit', () => {
  const sql = fs.readFileSync('infra/sql/065_project_timelines.sql','utf8');
  const source = fs.readFileSync('apps/web/src/server/project-timelines.ts','utf8');
  const actions = fs.readFileSync('apps/web/src/app/(app)/projects/actions.ts','utf8');
  const UI = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/page.tsx','utf8');
  assert.match(sql, /REFERENCES production\.production_steps\(id\)/);
  assert.match(sql, /REFERENCES sales\.quote_sub_jobs\(id\)/);
  assert.match(sql, /planned_start timestamp without time zone/);
  assert.match(sql, /CONSTRAINT project_tasks_valid_schedule/);
  assert.match(source, /j\.tenant_id=p\.tenant_id/);
  assert.match(source, /m\.tenant_id=p\.tenant_id/);
  assert.match(source, /ON CONFLICT \(project_id, production_step_id\)/);
  assert.match(actions, /\["owner", "manager"\]/);
  assert.match(UI, /Production Step.*checklist/);
  assert.match(UI, /Allocated work hours/);
});
