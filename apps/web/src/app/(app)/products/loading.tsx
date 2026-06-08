import { RouteLoadingShell } from "@/components/RouteLoadingShell";

export default function Loading() {
  return <RouteLoadingShell title='Loading products' subtitle='Fetching products, components, options and material rules…' cards={5} />;
}
