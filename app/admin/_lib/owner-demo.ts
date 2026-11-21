import {
  createDemoBarbershop,
  type BarbershopInput,
  type DemoBarbershop,
} from "./demo-barbershop";

export function barbershopPublicSlug(shop: DemoBarbershop) {
  return (
    shop.publicSlug ??
    (shop.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") ||
      "barbearia")
  );
}

// Demonstration rule only. Production must enforce owner uniqueness server-side.
export function registerOwnerDemoShop(
  shops: DemoBarbershop[],
  input: BarbershopInput,
  id: string,
  reservedShops: DemoBarbershop[],
) {
  if (shops.length)
    throw new Error(
      "O proprietário já possui uma barbearia nesta demonstração.",
    );
  const shop = createDemoBarbershop(input, id);
  const base = barbershopPublicSlug(shop);
  const reserved = new Set(reservedShops.map(barbershopPublicSlug));
  let slug = base;
  for (let suffix = 2; reserved.has(slug); suffix++) slug = `${base}-${suffix}`;
  return { ...shop, publicSlug: slug };
}

export function findPublishedShopBySlug(shops: DemoBarbershop[], slug: string) {
  const matches = shops.filter(
    (shop) => shop.published && barbershopPublicSlug(shop) === slug,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
