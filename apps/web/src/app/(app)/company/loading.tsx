import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading company' subtitle='Fetching workspace company settings…' cards={3} />;
}
