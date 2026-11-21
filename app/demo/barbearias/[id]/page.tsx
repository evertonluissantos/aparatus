import type { Metadata } from "next";
import { DemoBarbershopPage } from "../../../_components/demo-barbershop-page";

export const metadata: Metadata = {
  title: "Barbearia · Cortz Demo",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DemoBarbershopPage id={id} />;
}
