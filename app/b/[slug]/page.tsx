import type { Metadata } from "next";
import { DemoShopLink } from "./shop-link";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { publicCatalog } from "@/lib/mvp-bookings";
import { PersistentProvider } from "@/app/admin/_components/persistent-context";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cortz · Agendamento demonstrativo",
  robots: { index: false, follow: false },
};

export default async function PublicShopLink({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (OWNER_AUTH_ENABLED)
    return (
      <PersistentProvider publicMode publicShops={await publicCatalog(slug)}>
        <DemoShopLink slug={slug} />
      </PersistentProvider>
    );
  return <DemoShopLink slug={slug} />;
}
