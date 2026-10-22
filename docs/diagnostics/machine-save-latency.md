# Machine save latency diagnosis — V26.10.22.04

## Evidence and cause

The original `.03` Edit handler already closed its `<details>` editor and updated the card synchronously before awaiting Supabase. It did **not** call `router.refresh()`. Optimizing the RPC again would therefore not explain why the full page remained blocked.

The shared `RouteTransitionOverlay` registers `document.addEventListener("submit", handleSubmit, true)`. Its capture handler checks `data-no-global-loader`, then immediately schedules a full-screen overlay with pointer events enabled. Neither machine form provided that attribute. The loader clears on URL change, `pm:loading-done`, `pageshow`, or its 18,000 ms safety timer. Machine Edit does none of the first three; Add's `router.refresh()` also keeps the same URL.

The fix adds `data-no-global-loader="true"` to both client-handled forms. The global loader is unchanged for navigation and ordinary forms. This uses the existing loader contract, rather than reducing the safety timeout or changing database transport.

## Measured local results

Chromium, React development build, real machine components and real global overlay, with an explicitly simulated Supabase transport. The baseline uses the extracted original `.03` components. The fixed measurements below are from the final verification run.

| Measurement | Observed result |
| --- | ---: |
| Original `.03`: submit to overlay disappearance | 18,342 ms |
| Original `.03`: RPC network request | 160 ms |
| Fixed `.04`: click to handler | 8.2 ms |
| Fixed: click to modal close | 9.3 ms |
| Fixed: click to pending React commit | 17.7 ms |
| Fixed: modal-close frame opportunity | 26.0 ms |
| Fixed: RPC duration with intentional 1,500 ms server delay | 1,521.4 ms |
| Fixed: browser request duration | 1,518.3 ms |
| Fixed: RPC resolution to settled React commit | 2.9 ms |
| Fixed: pending / settled Profiler render duration | 0.6 / 0.3 ms |
| Fixed Edit: router refreshes | 0 |
| Fixed Add / Duplicate: router refresh calls | 1 each |

The browser fixture supplies a fabricated 3 ms database field solely to test report plumbing. **It is not a database performance measurement.** The local SQL test separately executes the actual functions and verifies numeric timing fields; its machine is not representative of Supabase production.

Double `requestAnimationFrame` observations are frame opportunities, not physical paint timestamps. The diagnostic report is emitted on a later frame and does not delay saving or the UI.

## Capture a live trace

1. Confirm `.04` in the sidebar. If database timings are wanted, apply `061_machine_editor_timing.sql` after 060 first.
2. Open the Machines route with `?machineTiming=1` appended, e.g. `/machines?machineTiming=1`.
3. Open browser DevTools → Network, enable Preserve log, clear existing requests. Open Console and filter for `machine-timing`.
4. Edit one machine and save. Wait for the saved/error indicator. Then test Add and Duplicate separately to distinguish their server refresh from Edit.
5. Copy the reports from Chrome's console with:

   ```js
   copy(JSON.stringify(window.__pmMachineTimings, null, 2))
   ```

The last 20 reports are kept only in this tab, with no machine names, IDs, form values, tokens, or full request URLs. Removing `machineTiming=1` disables collection. Do not export an unsanitized HAR containing authentication headers; the timing report normally suffices.

| Report field | Meaning |
| --- | --- |
| `marksMs.handlerStarted` | Input event to submit/click handler; includes pre-handler scheduling/validation work |
| `marksMs.formRead` | Input event to FormData/card preparation completion |
| `marksMs.modalClosed` / `formReset` | Edit close command / Add form reset |
| `marksMs.pendingReactCommit` | Input event to committed saving UI |
| `marksMs.settledReactCommit` | Input event to committed completion UI |
| `reactRenders[]` | React Profiler actual render durations in development/profiling builds; empty in standard production builds |
| `rpcDurationMs` | Browser client setup through Supabase promise resolution, including session/client wait, network and response processing |
| `network[].startMs` / `durationMs` | Browser resource request start and elapsed network time |
| `requestStartMs`, `ttfbMs`, `downloadMs` | Detailed network phases when the browser exposes them; otherwise null, never a fabricated zero |
| `marksMs.routerRefreshRequested` | Add/Duplicate refresh requested after successful RPC |
| `marksMs.settledReactEffect` | End of pending/refresh transition observed in React; compare to refresh request mark |
| `network[].kind = next-rsc` | Next server-component requests observed in the same operation window |
| `database.functionMs` | PostgreSQL function wall time, including authorization and SQL lock waits |
| `database.authorizationMs` | Membership check and function initialization |
| `database.beforeWriteMs` | Validation and any lookups before the write; Delete includes checking Production Steps |
| `database.writeMs` | INSERT / UPDATE / DELETE execution, including its lock/trigger waits |

A standard production React build does not expose Profiler render durations. Commit and frame observations still work there. To inspect individual component render CPU time, use a local development/profiling build or record the browser Performance panel. Resource Timing details can be hidden by browser policy/Timing-Allow-Origin; use the Network request's Timing tab for queueing, DNS, connection, request and response phases. An empty resource list means unavailable/unretained entries, not proof of zero requests.

The report's RSC entries cover the operation window; avoid concurrent operations while diagnosing so another request is not mistaken for this refresh. Background-tab frame throttling can delay reports, so collect with the tab visible.

## Interpreting remaining delays

- High click → handler or commit time: inspect the browser Performance recording for a blocked main thread, hydration or expensive React work.
- Fast modal close but delayed visual response: inspect frame timing and overlays; this release removes the known machine-submit overlay.
- RPC much longer than its browser request: investigate client/session work before fetch and response processing after fetch.
- Browser request long but `database.functionMs` short: inspect network, Supabase/PostgREST queue/auth/connection time and transaction commit. Those are not included in the function timer.
- `database.authorizationMs` or `writeMs` long: correlate the operation with Supabase database logs/query performance and lock activity. Do not infer that network time is SQL execution time.
- Add/Duplicate RPC fast but list slow: compare refresh-request mark, RSC request and final transition commit. Edit/Delete do not request a refresh.

`SafeAppAutoRefresh` has no pulse scope for `/machines`, so it does not schedule periodic router refreshes there. Machine client components invoke the four existing Supabase RPCs directly; their old server actions/revalidation code are not called by this path.

SQL function timing ends before response serialization/transaction commit and excludes request queueing. Failed RPCs raise as before and return no `_timing`; use the error response and Supabase logs for those. Without 061 the app works and reports `database: null`. Reapplying 060 removes the extra SQL timing fields without affecting the `.04` UI fix.

## Reproduce the regression tests

From the repository root, with dependencies installed:

```sh
cd apps/web
node ../../node_modules/typescript/bin/tsc --noEmit --incremental false
```

Browser fixture: install Playwright/Chromium in your test environment, then run `node scripts/tests/machine-latency.mjs` from the repository root. Optional `PM_BASELINE_DIR` selects a directory containing the original .03 machine components; it adds the 18-second baseline reproduction. `PM_TEST_OUTPUT` writes the measured JSON. The test never accesses a live Supabase database.

SQL fixture: install `@electric-sql/pglite` in the test environment, then run `node scripts/tests/machine-rpc-timing.cjs`. `PM_PGLITE_MODULE` may specify its absolute module path. This creates an isolated database with the actual machine/operation table definitions and both RPC migrations.

The browser test checks real client rendering and error recovery with simulated RPC outcomes; it does not establish real Next RSC timings. The SQL test verifies migration syntax, authentication, value retention and deletion guards in local PostgreSQL; it does not establish live Supabase performance. Full production deployment/build and live database measurements remain outside the verified scope.
