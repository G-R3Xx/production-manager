import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading workspace' subtitle='Preparing your workspace and tenant data…' cards={4} />;
}
