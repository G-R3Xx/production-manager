import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading dashboard' subtitle='Fetching MYOB status, mappings and current record counts…' cards={6} />;
}
