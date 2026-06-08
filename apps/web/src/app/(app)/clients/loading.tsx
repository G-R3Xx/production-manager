import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading clients' subtitle='Fetching client records and MYOB mapping data…' cards={4} />;
}
