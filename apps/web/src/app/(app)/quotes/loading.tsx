import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading quotes' subtitle='Preparing quote workspace…' cards={3} />;
}
