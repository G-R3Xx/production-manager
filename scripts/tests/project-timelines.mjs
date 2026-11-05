import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseProjectSchedule, timelineDayIndex, timelineDayRange, timelinePosition, timelineMinuteIndex, timelineWindow, timelinePositionInWindow, timelineTaskRangeLabel, shiftTimelineFocus, plannedHoursLabel, timelineDragSchedule, timelineDragSnapMinutes } from '../../apps/web/src/lib/project-timeline.ts';
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


test('dragging shifts start and finish by the same snapped wall-clock minutes', () => {
  const task = { plannedStart: '2026-11-06T08:30', plannedEnd: '2026-11-06T09:30', allocatedMinutes: 60 };
  assert.deepEqual(timelineDragSchedule(task, 'move', 60, 'day'), {
    plannedStart: '2026-11-06T09:30', plannedEnd: '2026-11-06T10:30'
  });
  assert.deepEqual(timelineDragSchedule(task, 'move', -16, 'day'), {
    plannedStart: '2026-11-06T08:15', plannedEnd: '2026-11-06T09:15'
  });
  assert.equal(task.allocatedMinutes, 60, 'drag changes schedule, not allocated work');
  assert.equal(timelineDragSnapMinutes('day'), 15);
  assert.equal(timelineDragSnapMinutes('week'), 30);
  assert.equal(timelineDragSnapMinutes('month'), 1440);
});

test('resizing changes only one end, cannot invert or zero a short task', () => {
  const task = { plannedStart: '2026-11-06T08:30', plannedEnd: '2026-11-06T09:30' };
  assert.deepEqual(timelineDragSchedule(task, 'resize-start', 30, 'day'), {
    plannedStart: '2026-11-06T09:00', plannedEnd: '2026-11-06T09:30'
  });
  assert.deepEqual(timelineDragSchedule(task, 'resize-end', 45, 'day'), {
    plannedStart: '2026-11-06T08:30', plannedEnd: '2026-11-06T10:15'
  });
  assert.deepEqual(timelineDragSchedule(task, 'resize-end', -480, 'day'), {
    plannedStart: '2026-11-06T08:30', plannedEnd: '2026-11-06T08:45'
  });
  assert.deepEqual(timelineDragSchedule(task, 'resize-start', 480, 'day'), {
    plannedStart: '2026-11-06T09:15', plannedEnd: '2026-11-06T09:30'
  });
});

test('week and month operations snap correctly across midnight/month boundaries', () => {
  const task = { plannedStart: '2026-11-30T09:15', plannedEnd: '2026-12-01T12:45' };
  assert.deepEqual(timelineDragSchedule(task, 'move', 1440, 'month'), {
    plannedStart: '2026-12-01T09:15', plannedEnd: '2026-12-02T12:45'
  });
  assert.deepEqual(timelineDragSchedule(task, 'resize-start', -60, 'week'), {
    plannedStart: '2026-11-30T08:15', plannedEnd: '2026-12-01T12:45'
  });
});

test('Gantt direct save is permission-scoped and updates only dates, never task labour or completion', () => {
  const source = fs.readFileSync('apps/web/src/server/project-timelines.ts', 'utf8');
  const actions = fs.readFileSync('apps/web/src/app/(app)/projects/actions.ts', 'utf8');
  const chart = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx', 'utf8');
  const page = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/page.tsx', 'utf8');
  const saveQuery = source.split('export async function rescheduleProjectTask(')[1].split('export async function deleteProjectTask(')[0];
  assert.match(saveQuery, /AND p\.tenant_id=\$1::uuid/);
  assert.match(saveQuery, /task\.planned_start=\$6::timestamp AND task\.planned_end=\$7::timestamp/);
  assert.match(saveQuery, /SET planned_start=\$4::timestamp, planned_end=\$5::timestamp/);
  assert.doesNotMatch(saveQuery, /SET .*allocated_minutes|SET .*status=|SET .*assignee/);
  assert.match(actions, /rescheduleProjectTaskAction[\s\S]*requireProjectManager\(\)/);
  assert.match(page, /<GanttTimeline projectId=\{id\} canEdit=\{canEdit\}/);
  assert.match(chart, /onPointerDown=\{event => beginDrag\(event, task\)\}/);
  assert.match(chart, /onPointerMove=\{moveDrag\}/);
  assert.match(chart, /onPointerUp=\{finishDrag\}/);
  assert.match(chart, /setPointerCapture/);
  assert.match(chart, /rescheduleProjectTaskAction\(/);
  assert.match(chart, /setSavedDates\(previous =>/);
});

test('Gantt pointer interactions prioritise moving and do not invoke native link dragging', () => {
  const chart = fs.readFileSync('apps/web/src/app/(app)/projects/[id]/GanttTimeline.tsx','utf8');
  // Native link dragging cancels pointer sequences in Chromium, so disable it.
  assert.match(chart,/draggable=\{false\} onDragStart=\{event => event\.preventDefault\(\)\}/);
  // Only deliberate resize-grip grabs may resize. The centre of a bar moves.
  assert.match(chart,/event\.target instanceof Element \? event\.target\.closest\("\[data-gantt-resize\]"\)/);
  assert.match(chart,/const mode: TimelineDragMode = grip === "start" \? "resize-start" : grip === "end" \? "resize-end" : "move"/);
  assert.doesNotMatch(chart,/bounds\.width >= 24 && x <= edge/);
  // Small bars get a full hit target, without falsely widening their visible time span.
  assert.match(chart,/Math\.max\(barPixels, canEdit \? 38 : 12\)/);
  assert.match(chart,/showResizeGrips = canEdit && barPixels >= 52/);
  assert.match(chart,/pointerEvents: "none"/);
  // A tiny gesture cannot accidentally follow the task link; the drag preserves
  // allocated hours because the rescheduling action only updates dates.
  assert.match(chart,/if \(session\.moved \|\| session\.mode !== "move"\) suppressClickRef\.current/);
  assert.match(chart,/onKeyDown=\{event =>/);
  assert.match(chart,/session\.startScrollLeft/);
  assert.match(chart,/!session\.moved \? 0 : session\.lastX/);
});
