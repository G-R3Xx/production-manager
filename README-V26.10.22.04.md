# Production Manager V26.10.22.04

Built directly from V26.10.22.03. Fixes the blocking global loader on machine Add/Edit and adds opt-in diagnostics for the full interaction.

## What caused the delay

`RouteTransitionOverlay` listens to every form submit in the document capture phase. The machine forms used client-side RPCs but had not opted out of this listener. The listener therefore displayed its full-screen “Saving your changes…” overlay before the form handler ran. The RPC completed and Edit closed, but neither operation changed the URL or dismissed that overlay. Its 18-second safety timeout eventually released the page.

A local browser test with the original .03 components reproduced 18.34 seconds of blocking while the simulated RPC request took 160 ms. The fixed components closed Edit in 9 ms and reached a frame opportunity in 26 ms, even with a deliberately delayed 1.52-second RPC. These are local regression measurements, not live Supabase benchmarks.

## Install

1. Deploy the contents of `production-manager/` using your normal workflow. Confirm **V26.10.22.04** in the sidebar and reload the Machines page.
2. **No new SQL is required for the UI latency fix.** Existing migration `060_machine_editor_rpc.sql` remains required and unchanged.
3. To capture database execution phases, optionally run `infra/sql/061_machine_editor_timing.sql` in Supabase after 060. It replaces the same four functions with additive timing fields; signatures, authorization, writes and delete safeguards are retained. It is safe to re-run.

## Changes

- Add/Edit explicitly opt out of the global navigation loader and use their own save feedback.
- Edit retains immediate card update/modal close, waits for RPC before reporting “saved”, and restores the old card/reopens the editor on failure.
- Empty names are rejected before a write. Edit cannot reopen while its save is pending.
- Add/Duplicate still refresh their server-rendered cards. Their “Updating list…” state now tracks the router transition separately from the RPC.
- `?machineTiming=1` captures click/submit, RPC, React commit/render, modal/reset, network and refresh timings. Optional SQL adds function/auth/write timing. See the diagnostic guide.
- Permanent deletion, linked active Production Step protection, duplication of settings and hiding inactive machines are preserved.
- Added the published integrity hash for the existing `pantoner@1.1.2` tarball so dependency verification succeeds. No dependency version changed.

## Verification

- Full web TypeScript check: PASS (`tsc --noEmit --incremental false`).
- Chromium: baseline loader reproduced; fixed slow save, rollback, validation, create, duplicate, delete success/failure and ordinary loader behaviour pass.
- PGlite PostgreSQL: 060 + 061 execute; repeat 061 succeeds; all four RPCs return numeric timings; settings/capabilities retained; cross-tenant/anonymous access rejected; linked delete rejected; unlinked deletion permanent.

The browser fixture uses simulated transport/router, and the SQL fixture is local. Live Supabase execution, authentication/network overhead and real Next server refresh timing have not been measured here. No live database migration or deployment was performed.

Details: `docs/diagnostics/machine-save-latency.md`.
