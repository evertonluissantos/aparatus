import { notFound } from "next/navigation";
import { globalSections } from "../sections";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { listSubscriptions } from "@/lib/manual-pix";
import { PixPanel } from "../pix-panel";

export default async function GlobalSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(globalSections, section)) notFound();
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
