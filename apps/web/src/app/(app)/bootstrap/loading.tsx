import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function BootstrapLoading() {
  return <RouteLoadingShell title="Loading workspace setup" subtitle="Preparing workspace creation and membership details…" cards={3} />;
}
