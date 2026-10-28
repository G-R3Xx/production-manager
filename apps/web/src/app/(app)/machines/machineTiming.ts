"use client";

import { useLayoutEffect, useRef, type ProfilerOnRenderCallback } from "react";

// Opt in with /machines?machineTiming=1. No names, IDs, values or tokens are logged.
// Timings are local to this tab; nothing is sent to an analytics service.
export type MachineTrace = ReturnType<typeof startMachineTrace>;
export function startMachineTrace(operation: string, eventTime?: number) {
  const enabled =
    new URLSearchParams(window.location.search).get("machineTiming") === "1";
  const started = performance.now();
  const origin =
    eventTime && eventTime > 0 && eventTime <= started ? eventTime : started;
  const marks: Record<string, number> = { handlerStarted: started - origin };
  const details: Record<string, unknown> = {
    reactRenderNote:
      "Profiler durations require a development/profiling build; commit/frame timings also work in production.",
  };
  const renders: { phase: string; atMs: number; durationMs: number }[] = [];
  let finished = false;
  let reported = false;
  function mark(name: string) {
    if (enabled && !reported) marks[name] = performance.now() - origin;
  }
  function paint(name: string) {
    // A frame opportunity, not a claim to measure the physical screen's paint.
    if (enabled)
      requestAnimationFrame(() => requestAnimationFrame(() => mark(name)));
  }
  return {
    enabled,
    mark,
    paint,
    detail(name: string, value: unknown) {
      if (enabled && !reported) details[name] = value;
    },
    render(phase: string, durationMs: number) {
      if (enabled && !reported)
        renders.push({ phase, atMs: performance.now() - origin, durationMs });
    },
    finish(outcome: string) {
      if (!enabled || finished) return;
      finished = true;
      // A third frame lets the commit hooks finish their two-frame observations.
      // This delays the diagnostic report only; it never delays the UI or RPC.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            mark("reportFrame");
            const resources = performance.getEntriesByType(
              "resource",
            ) as PerformanceResourceTiming[];
            const network = resources
              .filter(
                (r) =>
                  r.startTime >= started &&
                  (r.name.includes(
                    `/rest/v1/rpc/pm_${operation === "edit" ? "update" : operation}_machine`,
                  ) ||
                    (new URL(r.name).origin === location.origin &&
                      new URL(r.name).searchParams.has("_rsc"))),
              )
              .map((r) => ({
                kind: r.name.includes("/rest/v1/rpc/")
                  ? "supabase-rpc"
                  : "next-rsc",
                startMs: r.startTime - origin,
                durationMs: r.duration,
                // Cross-origin detail is zero without Timing-Allow-Origin. Report null,
                // never zero, when the browser has hidden these phases.
                requestStartMs: r.requestStart ? r.requestStart - origin : null,
                ttfbMs:
                  r.requestStart && r.responseStart
                    ? r.responseStart - r.requestStart
                    : null,
                downloadMs: r.responseStart
                  ? r.responseEnd - r.responseStart
                  : null,
              }));
            const report = {
              version: "V26.10.28.01",
              operation,
              outcome,
              marksMs: { ...marks },
              reactRenders: [...renders],
              ...details,
              network,
            };
            reported = true;
            const target = window as Window & {
              __pmMachineTimings?: unknown[];
            };
            target.__pmMachineTimings = [
              ...(target.__pmMachineTimings ?? []).slice(-19),
              report,
            ];
            console.info("[machine-timing]", report);
            window.dispatchEvent(
              new CustomEvent("pm:machine-timing", { detail: report }),
            );
          }),
        ),
      );
    },
  };
}

export function useMachineTiming(pending: boolean) {
  const trace = useRef<MachineTrace | null>(null);
  const interaction = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    trace.current?.mark(pending ? "pendingReactCommit" : "settledReactCommit");
    trace.current?.paint(
      pending ? "pendingFrameOpportunity" : "settledFrameOpportunity",
    );
  }, [pending]);
  const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
    trace.current?.render(phase, actualDuration);
  };
  return {
    trace,
    onRender,
    interaction,
    begin(operation: string, eventTime: number) {
      // Click/Enter is captured before native validation and submit dispatch.
      const captured = interaction.current;
      interaction.current = undefined;
      trace.current = startMachineTrace(
        operation,
        captured && eventTime - captured < 1000 ? captured : eventTime,
      );
      return trace.current;
    },
  };
}
