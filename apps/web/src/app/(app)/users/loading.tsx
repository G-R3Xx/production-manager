import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading users' subtitle='Fetching workspace users and memberships…' cards={4} />;
}
