"use client";

import Link from "next/link";
import { Button } from "@/app/_components/ui/button";
import { useDemoBarbershop } from "./demo-context";
import { PublicationControls } from "./publication-controls";

export function SectionPreview({
  section,
  title,
}: {
  section: string;
  title: string;
}) {
  const { selectedShop: shop } = useDemoBarbershop();
  if (!shop) return null;
  return (
    <section>
      <p className="text-muted-foreground text-sm wrap-break-word">
        {shop.name} · Demonstração
      </p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      {section === "configuracoes" ? (
        <div className="border-border bg-card mt-7 rounded-xl border p-6">
          <h2 className="font-semibold">Dados do estabelecimento</h2>
          <PublicationControls shopId={shop.id} />
          <p className="text-muted-foreground mt-2 text-sm">
            Somente visualização dos dados desta sessão demonstrativa.
          </p>
          <dl className="mt-6 space-y-5">
            {[
              ["Nome", shop.name],
              ["Telefone", shop.phone],
              ["Endereço", shop.address],
              ["Descrição", shop.description],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="mt-1 text-sm wrap-break-word">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="border-border bg-card mt-7 rounded-xl border p-8 text-center">
          <h2 className="font-semibold">Uma próxima parte da sua gestão</h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">
            Esta seção está reservada na navegação. Cadastros e operações de{" "}
            {title.toLocaleLowerCase("pt-BR")} ainda não foram implementados.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link prefetch={false} href="/painel/servicos">
              Explorar serviços demonstrativos
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}
