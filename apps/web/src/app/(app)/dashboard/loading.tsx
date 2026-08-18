import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading dashboard' subtitle='Building the live job list, tasks and current workflow stages…' cards={6} />;
}
