import Link from "next/link";
import { executiveReport } from "@/lib/global-reports";
import { OWNER_AUTH_ENABLED } from "@/lib/owner-auth-policy";
import { Heading, money, monthLabel } from "./ui";
export default async function GlobalOverview() {
  if (!OWNER_AUTH_ENABLED)
    return <p>Ative a gestão para consultar os dados reais.</p>;
  const { totals: t, months } = await executiveReport();
  const cards = [
    [
      "Recebido neste mês",
      money(t.monthReceived),
      "Pix confirmado · data de recebimento",
    ],
    [
      "Receita acumulada",
      money(t.totalReceived),
      "Todas as mensalidades confirmadas",
    ],
    ["Barbearias", t.shops, "Total de estabelecimentos cadastrados"],
    ["Ativas", t.active, "Sem suspensão administrativa"],
    ["Suspensas", t.suspended, "Acesso operacional suspenso"],
    ["Publicadas", t.published, "Estado de publicação do cadastro"],
    [
      "Proprietários vinculados",
      t.owners,
      "Usuários distintos com vínculo OWNER",
    ],
    [
      "Contas cadastradas",
      t.accounts,
      "Contas não globais; não implica propriedade",
    ],
    ["Pix confirmados", t.payments, "Registros únicos de mensalidades"],
  ];
  const max = Math.max(1, ...months.map((m) => Number(m.received)));
  return (
    <div className="space-y-8">
      <Heading
        title="Visão geral"
        description="Acompanhe a operação e as mensalidades efetivamente confirmadas pelo Studio Notreve."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, hint], i) => (
          <article
            key={label}
            className={`rounded-xl border p-5 sm:p-6 ${i === 0 ? "bg-foreground text-background" : "bg-background"}`}
          >
            <h2
              className={`text-sm ${i === 0 ? "opacity-75" : "text-muted-foreground"}`}
            >
              {label}
            </h2>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
            <p
              className={`mt-3 text-xs leading-5 ${i === 0 ? "opacity-65" : "text-muted-foreground"}`}
            >
              {hint}
            </p>
          </article>
        ))}
      </div>
      <section
        className="bg-background rounded-xl border p-5 sm:p-7"
        aria-labelledby="revenue-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="revenue-title" className="font-semibold">
              Evolução da receita recebida
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Últimos seis meses · São Paulo · somente mensalidades Pix
            </p>
          </div>
          <Link
            href="/gestao/pagamentos-pix"
            className="hover:bg-muted rounded-lg border px-3 py-2 text-xs"
          >
            Ver pagamentos
          </Link>
        </div>
        <div
          className="mt-8 grid grid-cols-6 gap-2 sm:gap-5"
          role="img"
          aria-label={months
            .map((m) => `${monthLabel(m.month)}: ${money(m.received)}`)
            .join("; ")}
        >
          {months.map((m) => (
            <div
              key={m.month}
              className="flex min-w-0 flex-col items-center gap-3"
            >
              <span className="text-center text-[10px] tabular-nums sm:text-xs">
                {money(m.received)}
              </span>
              <div className="bg-muted/40 relative h-40 w-full max-w-20 rounded-t-md">
                <div
                  className="bg-foreground absolute inset-x-0 bottom-0 rounded-t-md"
                  style={{ height: `${(Number(m.received) / max) * 100}%` }}
                />
              </div>
              <span className="text-muted-foreground text-center text-[10px] sm:text-xs">
                {monthLabel(m.month)}
              </span>
            </div>
          ))}
        </div>
        {months.every((m) => Number(m.received) === 0) && (
          <p className="text-muted-foreground mt-5 text-center text-sm">
            Nenhuma mensalidade recebida neste período.
          </p>
        )}
      </section>
    </div>
  );
}
