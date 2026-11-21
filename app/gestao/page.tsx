import Link from "next/link";
import { globalSections } from "./sections";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { listSubscriptions } from "@/lib/manual-pix";
import { PixPanel } from "./pix-panel";

export default async function GlobalOverview() {
  if (OWNER_AUTH_ENABLED) {
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
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold">Visão geral</h1>
      <p className="text-muted-foreground">
        Estrutura inicial de gestão do Studio Notreve. Não há indicadores, dados
        de proprietários ou resultados financeiros conectados.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(globalSections).map(([path, item]) => (
          <Link
            key={path}
            href={`/gestao/${path}`}
            className="border-border bg-card hover:bg-secondary space-y-3 rounded-xl border p-5"
          >
            <h2 className="font-semibold">{item.title}</h2>
            <p className="text-muted-foreground text-sm">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
