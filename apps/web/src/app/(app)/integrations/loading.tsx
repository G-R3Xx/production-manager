import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading integrations' subtitle='Checking MYOB connection, company file and sync history…' cards={5} />;
}
