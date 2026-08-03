export const dynamic = "force-dynamic";

import { ProductionPageContent } from "../page";

type ProductionJobPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductionJobPage({ params, searchParams }: ProductionJobPageProps) {
  const [{ id }, currentSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({})
  ]);

  return ProductionPageContent({
    searchParams: Promise.resolve({
      ...currentSearchParams,
      selected: id,
      detail: "1"
    })
  });
}
