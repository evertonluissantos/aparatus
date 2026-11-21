import { listFreeTrials } from "@/lib/global-commercial";
import { CommercialPanel } from "../commercial-panel";
import { notFound } from "next/navigation";
import { globalSections } from "../sections";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { listOwners, listManagedShops } from "@/lib/global-management";
import { listSubscriptions } from "@/lib/manual-pix";
import { paymentHistory } from "@/lib/global-reports";
import { OwnersPanel } from "../owners-panel";
import { ShopsPanel } from "../shops-panel";
import { SubscriptionsPanel } from "../subscriptions-panel";
import { PixPanel } from "../pix-panel";
export default async function GlobalSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(globalSections, section)) notFound();
  if (!OWNER_AUTH_ENABLED)
    return <p>Gestão não ativada. Nenhum dado real disponível.</p>;
  if (section === "aprovacoes") {
    const [shops, trials] = await Promise.all([
      listManagedShops(),
      listFreeTrials(),
    ]);
    return <CommercialPanel shops={shops} trials={trials} />;
  }
  if (section === "proprietarios")
    return <OwnersPanel owners={await listOwners()} />;
  if (section === "barbearias" || section === "ativacoes-suspensoes")
    return (
      <ShopsPanel
        shops={await listManagedShops()}
        controls={section === "ativacoes-suspensoes"}
      />
    );
  if (section === "assinaturas") return <SubscriptionsPanel />;
  if (section === "pagamentos-pix") {
    const [shops, history] = await Promise.all([
      listSubscriptions(),
      paymentHistory(),
    ]);
    return (
      <PixPanel
        shops={shops.map((s) => ({
          ...s,
          paidUntil: s.paidUntil?.toISOString() ?? null,
        }))}
        history={history}
      />
    );
  }
  notFound();
}
