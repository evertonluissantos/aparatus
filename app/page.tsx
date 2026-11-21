import { DemoCatalog } from "./_components/demo-catalog";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { publicCatalog } from "@/lib/mvp-bookings";
import { PersistentProvider } from "./admin/_components/persistent-context";
export const dynamic = "force-dynamic";

export default async function Home() {
  if (OWNER_AUTH_ENABLED)
    return (
      <PersistentProvider publicMode publicShops={await publicCatalog()}>
        <DemoCatalog />
      </PersistentProvider>
    );
  return <DemoCatalog />;
}
