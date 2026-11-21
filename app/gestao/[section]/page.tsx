import { notFound } from "next/navigation";
import { globalSections } from "../sections";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { listSubscriptions } from "@/lib/manual-pix";
import { PixPanel } from "../pix-panel";
import { listOwners, listManagedShops } from "@/lib/global-management";
import { ShopsPanel } from "../shops-panel";

export default async function GlobalSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(globalSections, section)) notFound();
  if (OWNER_AUTH_ENABLED && section === "proprietarios") {
    const owners = await listOwners();
    return (
      <section className="space-y-5">
        <h1 className="text-2xl font-semibold">Proprietários</h1>
        <p>
          Contas sem vínculo OWNER ainda não têm barbearia atribuída. O
          histórico de clientes não define propriedade.
        </p>
        {!owners.length && (
          <p>Nenhum proprietário ou conta sem vínculo encontrado.</p>
        )}
        <ul className="space-y-3">
          {owners.map((owner) => (
            <li key={owner.id} className="space-y-2 rounded-xl border p-5">
              <h2 className="font-semibold">{owner.name}</h2>
              <p>{owner.email}</p>
              <p>{owner.shopName ?? "Sem barbearia vinculada"}</p>
              <p>
                Vínculo:{" "}
                {owner.membershipActive === null
                  ? "Não estabelecido"
                  : owner.membershipActive
                    ? "Ativo"
                    : "Inativo"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (
    OWNER_AUTH_ENABLED &&
    (section === "barbearias" || section === "ativacoes-suspensoes")
  ) {
    return (
      <ShopsPanel
        shops={await listManagedShops()}
        controls={section === "ativacoes-suspensoes"}
      />
    );
  }
  if (
    OWNER_AUTH_ENABLED &&
    (section === "assinaturas" || section === "pagamentos-pix")
  ) {
    const shops = await listSubscriptions();
    return (
      <PixPanel
        shops={shops.map((s) => ({
          ...s,
          paidUntil: s.paidUntil?.toISOString() ?? null,
        }))}
      />
    );
  }
  const item = globalSections[section as keyof typeof globalSections];
  return (
    <section className="border-border bg-card space-y-4 rounded-xl border p-6">
      <h1 className="text-2xl font-semibold">{item.title}</h1>
      <p className="text-muted-foreground">{item.description}</p>
      <p className="text-muted-foreground text-sm">
        Somente estrutura de navegação; sem operações reais.
      </p>
    </section>
  );
}
