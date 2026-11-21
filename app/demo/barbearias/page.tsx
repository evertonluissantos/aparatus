import { DemoCatalogSearch } from "../../_components/demo-catalog";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { publicCatalog } from "@/lib/mvp-bookings";
import { PersistentProvider } from "@/app/admin/_components/persistent-context";
export const dynamic = "force-dynamic";

export default async function DemoSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string | string[] }>;
}) {
  const { search } = await searchParams;
  if (OWNER_AUTH_ENABLED)
    return (
      <PersistentProvider publicMode publicShops={await publicCatalog()}>
        <DemoCatalogSearch search={typeof search === "string" ? search : ""} />
      </PersistentProvider>
    );
  return (
    <DemoCatalogSearch search={typeof search === "string" ? search : ""} />
  );
}
