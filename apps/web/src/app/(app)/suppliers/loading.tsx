import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading suppliers' subtitle='Fetching supplier records and linked supplier data…' cards={4} />;
}
