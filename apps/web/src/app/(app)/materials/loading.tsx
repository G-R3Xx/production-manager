import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading materials' subtitle='Fetching purchased stock, supplier links and allocation data…' cards={5} />;
}
