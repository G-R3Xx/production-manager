import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function ArtworkApprovalsLoading() {
  return <RouteLoadingShell title="Loading artwork approvals" subtitle="Preparing approval packs, proof pages and client links…" cards={4} />;
}
