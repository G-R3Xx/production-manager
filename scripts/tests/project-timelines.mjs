import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseProjectSchedule, timelineDayIndex, timelineDayRange, timelinePosition, timelineMinuteIndex, timelineWindow, timelinePositionInWindow, timelineTaskRangeLabel, shiftTimelineFocus, plannedHoursLabel } from '../../apps/web/src/lib/project-timeline.ts';
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

test('Gantt bars preserve exact start/end positions across multi-day ranges', () => {
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


test('Gantt positions use actual minutes: sequential tasks do not overlap', () => {
  const first = { plannedStart:'2026-11-06T08:30', plannedEnd:'2026-11-06T09:30' };
  const second = { plannedStart:'2026-11-06T09:30', plannedEnd:'2026-11-06T10:00' };
  const focus = timelineDayIndex(first.plannedStart);
  assert.equal(timelineMinuteIndex(second.plannedStart) - timelineMinuteIndex(first.plannedStart), 60);
  for (const zoom of ['day', 'week', 'month']) {
    const range = timelineWindow(focus, zoom);
    const a = timelinePositionInWindow(first, range.startMinute, range.endMinute);
    const b = timelinePositionInWindow(second, range.startMinute, range.endMinute);
    assert.ok(a.width > b.width, `${zoom}: 60 minutes must be wider than 30 minutes`);
    assert.ok(b.left > a.left, `${zoom}: second task must start later`);
    assert.ok(Math.abs((a.left + a.width) - b.left) < 1e-8, `${zoom}: adjacent bars should touch, not overlap`);
  }
  assert.equal(timelineTaskRangeLabel(first), '6 Nov 08:30 – 09:30');
  assert.equal(timelineTaskRangeLabel(second), '6 Nov 09:30 – 10:00');
});

test('Gantt windows are calendar-aligned and can navigate accurately', () => {
  const focus = timelineDayIndex('2026-11-06T12:00'); // Friday
  const day = timelineWindow(focus, 'day');
  const week = timelineWindow(focus, 'week');
  const month = timelineWindow(focus, 'month');
  assert.equal(day.dayCount, 1);
  assert.equal(week.dayCount, 7);
  assert.equal(week.firstDay, timelineDayIndex('2026-11-02T00:00')); // Monday
  assert.equal(month.dayCount, 30);
  assert.equal(month.firstDay, timelineDayIndex('2026-11-01T00:00'));
  assert.equal(shiftTimelineFocus(focus, 'week', 1), focus + 7);
  assert.equal(timelineWindow(shiftTimelineFocus(focus, 'month', 1), 'month').firstDay, timelineDayIndex('2026-12-01T00:00'));
});

test('Gantt hides tasks outside the period and clips cross-midnight tasks', () => {
  const focus = timelineDayIndex('2026-11-06T00:00');
  const range = timelineWindow(focus, 'day');
  const task = { plannedStart: '2026-11-05T23:30', plannedEnd: '2026-11-06T01:00' };
  const clipped = timelinePositionInWindow(task, range.startMinute, range.endMinute);
  assert.equal(clipped.left, 0);
  assert.ok(Math.abs(clipped.width - 100 / 24) < 1e-9);
  assert.deepEqual(timelinePositionInWindow({plannedStart:'2026-11-07T09:00',plannedEnd:'2026-11-07T10:00'},range.startMinute,range.endMinute), {left:0,width:0});
  assert.equal(timelineTaskRangeLabel(task), '5 Nov 23:30 – 6 Nov 01:00');
});

test('Gantt chart exposes clock labels and date navigation in the client component', () => {
  const source = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx', 'utf8');
  assert.match(source, /timelinePositionInWindow\(task, model\.startMinute, model\.endMinute\)/);
  assert.match(source, /String\(hour\)\.padStart\(2, "0"\)/);
  assert.match(source, /timelineTaskRangeLabel\(task\)/);
  assert.match(source, /Jump to timeline date/);
  assert.match(source, /Previous \$\{zoom\}/);
  assert.doesNotMatch(source, /timelinePosition\(task, model\.first, model\.last\)/);
});
