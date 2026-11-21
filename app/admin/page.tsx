"use client";

import Link from "next/link";
import {
  ArrowRight,
  Scissors,
  CalendarDays,
  Users,
  UserRound,
  Settings,
  Clock3,
} from "lucide-react";
import { useDemoBarbershop } from "./_components/demo-context";

export default function AdminPage() {
  const { selectedShop: shop } = useDemoBarbershop();
  if (!shop) return null;
  return (
    <section>
      <p className="text-muted-foreground text-sm">Visão geral</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight wrap-break-word">
        Bem-vindo à {shop.name}.
      </h1>
      <p className="text-muted-foreground mt-3">
        Seu espaço para organizar a rotina da barbearia. Comece pelo catálogo de
        serviços.
      </p>
      <div className="my-7 grid gap-4 sm:grid-cols-2">
        <div className="border-border bg-card rounded-xl border p-6">
          <p className="text-muted-foreground text-sm">Serviços</p>
          <p className="mt-2 text-3xl font-semibold">{shop.services.length}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            {shop.services.filter((service) => service.active).length} ativos
            neste catálogo
          </p>
        </div>
        <div className="border-border bg-card rounded-xl border p-6">
          <p className="text-muted-foreground text-sm">
            Estabelecimento selecionado
          </p>
          <p className="mt-2 font-semibold wrap-break-word">{shop.name}</p>
          <p className="text-muted-foreground mt-2 text-sm wrap-break-word">
            {shop.address}
          </p>
        </div>
      </div>
      <h2 className="mb-4 font-semibold">Explore a gestão</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            path: "servicos",
            title: "Serviços",
            description: "Crie, edite e organize seu catálogo.",
            icon: Scissors,
            ready: true,
          },
          {
            path: "profissionais",
            title: "Profissionais",
            description:
              "Cadastre a equipe e associe os serviços de cada profissional.",
            icon: UserRound,
            ready: true,
          },
          {
            path: "agenda",
            title: "Agenda",
            description: "Organize atendimentos manuais na agenda.",
            icon: CalendarDays,
            ready: true,
          },
          {
            path: "horarios",
            title: "Horários",
            description:
              "Configure funcionamento, expedientes, pausas e bloqueios.",
            icon: Clock3,
            ready: true,
          },
          {
            path: "clientes",
            title: "Clientes",
            description:
              "Gerencie a carteira e acompanhe o histórico demonstrativo.",
            icon: Users,
            ready: true,
          },
          {
            path: "configuracoes",
            title: "Configurações",
            description: "Confira os dados temporários da barbearia.",
            icon: Settings,
          },
        ].map(({ path, title, description, icon: Icon, ready }) => (
          <Link
            prefetch={false}
            href={`/painel/${path}`}
            key={path}
            className="border-border bg-card hover:bg-secondary/60 focus-visible:ring-ring rounded-xl border p-5 outline-none focus-visible:ring-2"
          >
            <div className="flex items-center justify-between">
              <Icon className="size-5" aria-hidden="true" />
              <ArrowRight
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
            </div>
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
            <span className="text-muted-foreground mt-4 inline-block text-xs">
              {ready ? "Interativo · modo demo" : "Prévia · sem operações"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
