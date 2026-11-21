"use client";

import { DemoBarbershopPage } from "../../_components/demo-barbershop-page";
import { useDemoBarbershop } from "../../admin/_components/demo-context";
import { publicDemoCatalog } from "../../_lib/demo-catalog";
import { findPublishedShopBySlug } from "../../admin/_lib/owner-demo";

export function DemoShopLink({ slug }: { slug: string }) {
  const { shops, persistent } = useDemoBarbershop();
  const shop = findPublishedShopBySlug(
    persistent ? shops : publicDemoCatalog(shops),
    slug,
  );
  // Reuse the exact detail and calendar. Unavailable/draft/ambiguous links fail closed.
  return <DemoBarbershopPage id={shop?.id ?? "unavailable-public-link"} />;
}
