# Production Manager V26.11.05.06 — Gantt time-scale correction

Based on V26.11.05.05, retaining the optional Projects area, Sub Job groupings, linked Production Steps and the existing quote/material changes.

## Problem addressed

Project Gantt bars were calculated from date-only values. Two tasks on the same date (for example, 08:30–09:30 and 09:30–10:00) therefore began at the same position and appeared to occupy a full-day block. The week header also had too little time-scale information.

## Changes

- **Minute-accurate bars:** use the saved start and finish date/times to calculate every bar's horizontal position and length. Adjacent tasks end-to-start instead of overlapping visually; tasks crossing midnight are clipped to the visible period.
- **Day:** real 24-hour timeline with hour grid and labelled two-hour ticks, with enough width to distinguish a 30-minute job from a one-hour job.
- **Week:** Monday–Sunday with day headings and 06:00, 12:00, 18:00 sub-ticks; sub-day bar offsets are still maintained.
- **Month:** calendar-month window with day markings; short tasks are thin at this scale, so use Day for exact hour-by-hour planning.
- **Always-visible time:** each task row shows its local start and finish time as well as separately allocated work hours. Bar tooltips and accessible labels include the same schedule.
- **Navigation:** previous/next day/week/month, date picker, Today and First task shortcuts. Day is initially selected when all tasks are on one date; otherwise Week.
- **Visibility:** horizontal scroll initially focuses the first task in the visible period. Only tasks intersecting the selected period appear in the chart; all tasks remain editable below the timeline.
- **Current-time marker:** red marker is positioned by the current Sydney local wall-clock minute at render, rather than the start of the current day.

The timeline's stored `timestamp without time zone` values remain workspace-local schedule times; no database structure or saved data has changed. No SQL migration is required beyond the prior project-timeline migration 065.

## Verification performed

- `tsc --noEmit --strict` passed for the date/time helper.
- Isolated strict TypeScript check of `GanttTimeline.tsx` and its helper passed using local declaration stubs for the dependencies unavailable in the archive.
- `node --experimental-strip-types --test scripts/tests/project-timelines.mjs` passed, including same-day 08:30/09:30 tasks, clipping, day/week/month ranges and calendar navigation.
- Existing Sub Job, quick quote-line actions, finishing add-ons and Courier/Delivery pricing regression scripts passed.
- ZIP integrity and SHA-256 verified.

The **full monorepo `pnpm typecheck` and live browser/Supabase tests could not be completed** here because the source archive does not include installed workspace dependencies or access to the running environment. Run `pnpm typecheck` in the existing Windows checkout before deploying.

## Deployment

1. Extract the new source into the existing Production Manager workspace, preserving your environment variables and deployment settings.
2. Run `pnpm typecheck` (and your normal build/deployment checks).
3. Deploy V26.11.05.06; no new SQL migration is required.
4. Test a timeline with an 08:30–09:30 task and a 09:30–10:00 task. Both should display at separate time offsets in Day and Week views, with their exact times shown beneath the names.
