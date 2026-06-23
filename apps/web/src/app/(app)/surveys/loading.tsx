import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function SurveysLoading() {
  return <RouteLoadingShell title="Loading surveys" subtitle="Fetching survey requests, install scheduler status and returned photos…" cards={4} />;
}
