import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function EnquiriesLoading() {
  return <RouteLoadingShell title="Loading enquiries" subtitle="Fetching enquiry, quote and survey workflow data…" cards={5} />;
}
