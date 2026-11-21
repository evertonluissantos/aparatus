"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  LayoutDashboard,
  Scissors,
  Settings,
  Users,
  UserRound,
  FlaskConical,
  ArrowRight,
  Clock3,
} from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { useDemoBarbershop } from "./demo-context";

const sections = [
  { href: "/painel", title: "Visão geral", icon: LayoutDashboard },
  { href: "/painel/servicos", title: "Serviços", icon: Scissors },
  { href: "/painel/profissionais", title: "Profissionais", icon: UserRound },
  { href: "/painel/horarios", title: "Horários", icon: Clock3 },
  { href: "/painel/agenda", title: "Agenda", icon: CalendarDays },
  { href: "/painel/clientes", title: "Clientes", icon: Users },
  { href: "/painel/configuracoes", title: "Configurações", icon: Settings },
];
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { shops, selectedShop, persistent } = useDemoBarbershop();
  const ownerPath = pathname.replace(/^\/admin(?=\/|$)/, "/painel");
  const onboarding = ownerPath === "/painel/onboarding";
  return (
    <div lang="pt-BR" className="bg-muted/30 min-h-screen">
      <header className="border-border bg-background flex min-h-18 flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-8">
        <Link
          prefetch={false}
          href="/painel"
          className="flex items-center gap-3"
        >
          <span className="bg-primary text-primary-foreground rounded-xl p-2">
            <Scissors className="size-5" aria-hidden="true" />
          </span>
          <span className="text-xl font-black tracking-tight">cortz.</span>
          <span className="text-muted-foreground text-xs">Gestão</span>
        </Link>
        <span className="text-muted-foreground flex items-center gap-2 text-xs">
          <FlaskConical className="size-4" aria-hidden="true" />
          {persistent ? "Painel do proprietário" : "Demonstração local"}
          <Link
            href="/acesso/proprietario"
            className="underline"
            prefetch={false}
          >
            Acesso do proprietário
          </Link>
        </span>
      </header>
      <div className="mx-auto max-w-[1500px] lg:flex">
        {!onboarding && selectedShop && (
          <aside className="border-border bg-background border-b p-4 lg:min-h-[calc(100vh-4.5rem)] lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0 lg:p-6">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium">
              <Building2 className="size-4" aria-hidden="true" />
              {persistent ? "Sua barbearia" : "Sua barbearia demonstrativa"}
            </div>
            <p className="text-sm font-medium wrap-break-word">
              {selectedShop.name}
            </p>
            {shops.length > 1 && (
              <p role="status" className="mt-3 text-xs">
                Há {shops.length - 1} cadastros anteriores adicionais
                preservados em memória:{" "}
                {shops
                  .filter((shop) => shop.id !== selectedShop.id)
                  .map((shop) => shop.name)
                  .join(", ")}
                . O painel permite administrar uma barbearia e novos cadastros
                estão bloqueados. Nenhum dado foi excluído.
              </p>
            )}
            <nav
              aria-label="Painel administrativo demonstrativo"
              className="mt-5 flex gap-1 overflow-x-auto pb-1 lg:flex-col"
            >
              {sections.map(({ href, title, icon: Icon }) => (
                <Link
                  prefetch={false}
                  key={href}
                  href={href}
                  aria-current={ownerPath === href ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${ownerPath === href ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {title}
                </Link>
              ))}
            </nav>
          </aside>
        )}
        <main className="min-w-0 flex-1 px-4 py-6 sm:p-8 lg:p-10">
          {!persistent && (
            <div className="mb-7 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <FlaskConical
                className="mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">
                  Modo demonstrativo · nada é salvo definitivamente
                </p>
                <p className="mt-1 leading-relaxed">
                  Use apenas dados fictícios. Recarregar a página apaga
                  barbearias e alterações. Este fluxo não cria conta, vínculo de
                  acesso ou assinatura. As rotas ainda não possuem controle de
                  acesso.
                </p>
              </div>
            </div>
          )}
          {!onboarding && !selectedShop ? (
            <section className="border-border bg-card mx-auto max-w-2xl rounded-2xl border p-7 sm:p-12">
              <Building2 className="mb-6 size-10" aria-hidden="true" />
              <p className="text-muted-foreground mb-2 text-sm">
                Boas-vindas ao Cortz
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Seu negócio começa por aqui.
              </h1>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                {persistent
                  ? "Cadastre sua barbearia e configure serviços, profissionais e horários para receber agendamentos."
                  : "Monte uma barbearia de exemplo para explorar o painel. Depois, organize os serviços e conheça as próximas seções da gestão."}
              </p>
              <Button asChild className="mt-7">
                <Link prefetch={false} href="/painel/onboarding">
                  {persistent
                    ? "Cadastrar barbearia"
                    : "Cadastrar barbearia demo"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <p className="text-muted-foreground mt-4 text-xs">
                {persistent
                  ? "Cada proprietário pode cadastrar uma barbearia."
                  : "Nenhum cadastro real será realizado."}
              </p>
            </section>
          ) : (
            <div key={onboarding ? "onboarding" : selectedShop?.id}>
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
