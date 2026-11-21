"use client";

import { useState } from "react";
import {
  Check,
  Clock3,
  ListFilter,
  Pencil,
  Plus,
  Scissors,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/_components/ui/sheet";
import { useDemoBarbershop } from "../../_components/demo-context";
import type {
  DemoBarbershop,
  ScopedDemoService,
} from "../../_lib/demo-barbershop";
import {
  formatPrice,
  matchesServiceName,
  type DemoService,
  type ServiceValues,
} from "../_lib/service";
import { ServiceForm } from "./service-form";

export function ServicesPanel() {
  const { selectedShop } = useDemoBarbershop();
  return selectedShop ? (
    <ServiceCatalog key={selectedShop.id} shop={selectedShop} />
  ) : null;
}

function ServiceCatalog({ shop }: { shop: DemoBarbershop }) {
  const { updateServices } = useDemoBarbershop();
  const services = shop.services;
  function setServices(
    update: (current: ScopedDemoService[]) => ScopedDemoService[],
  ) {
    return updateServices(shop.id, update);
  }
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<{ service?: DemoService } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const active = services.filter((service) => service.active).length;
  const visible = services.filter(
    (service) =>
      matchesServiceName(service.name, query) &&
      (filter === "all" || service.active === (filter === "active")),
  );
  function feedback(message: string) {
    setAnnouncement(message);
    toast.success(message, {
      description: "Alteração aplicada a esta barbearia.",
    });
  }
  async function save(values: ServiceValues) {
    const editing = editor?.service;
    if (editing)
      await setServices((current) =>
        current.map((service) =>
          service.id === editing.id ? { ...service, ...values } : service,
        ),
      );
    else
      await setServices((current) => [
        { ...values, id: crypto.randomUUID(), barbershopId: shop.id },
        ...current,
      ]);
    setEditor(null);
    feedback(editing ? "Serviço atualizado." : "Serviço adicionado.");
  }
  async function toggle(service: DemoService) {
    await setServices((current) =>
      current.map((item) =>
        item.id === service.id ? { ...item, active: !item.active } : item,
      ),
    );
    feedback(service.active ? "Serviço desativado." : "Serviço ativado.");
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Serviços</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Catálogo de {shop.name}.
          </p>
        </div>
        <Button size="lg" className="rounded-xl" onClick={() => setEditor({})}>
          <Plus className="size-4" aria-hidden="true" />
          Novo serviço
        </Button>
      </div>
      <div className="mb-7 grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "Total de serviços", count: services.length },
          { label: "Ativos", count: active },
          { label: "Inativos", count: services.length - active },
        ].map(({ label, count }) => (
          <div
            key={label}
            className="border-border bg-card rounded-xl border p-3 sm:p-5"
          >
            <p className="text-muted-foreground text-xs sm:text-sm">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">
              {count.toString().padStart(2, "0")}
            </p>
          </div>
        ))}
      </div>
      <section
        aria-labelledby="catalog-title"
        className="border-border bg-card overflow-hidden rounded-2xl border shadow-xs"
      >
        <div className="border-border space-y-5 border-b p-4 sm:p-6">
          <div>
            <h2 id="catalog-title" className="font-semibold">
              Catálogo de serviços
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Preços e durações para uma agenda mais organizada.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="service-search" className="sr-only">
                Buscar serviço por nome
              </label>
              <Search
                className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4"
                aria-hidden="true"
              />
              <Input
                id="service-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome do serviço…"
                className="h-10 pl-10"
              />
            </div>
            <div className="relative">
              <ListFilter
                className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4"
                aria-hidden="true"
              />
              <label htmlFor="service-filter" className="sr-only">
                Filtrar por status
              </label>
              <select
                id="service-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="border-input bg-background focus-visible:ring-ring/50 h-10 w-full rounded-md border pr-8 pl-10 text-sm outline-none focus-visible:ring-2 sm:w-44"
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </div>
          </div>
        </div>
        <p className="sr-only" role="status">
          {visible.length} serviços encontrados. {announcement}
        </p>
        {visible.length > 0 ? (
          <>
            <div
              aria-hidden="true"
              className="bg-muted/40 text-muted-foreground hidden grid-cols-[minmax(0,1fr)_100px_100px_90px_180px] gap-4 border-b px-6 py-3 text-xs font-medium xl:grid"
            >
              <span>Serviço</span>
              <span>Preço</span>
              <span>Duração</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>
            <ul className="divide-border divide-y">
              {visible.map((service) => (
                <li
                  key={service.id}
                  className="hover:bg-muted/20 p-4 transition-colors sm:p-6 xl:grid xl:grid-cols-[minmax(0,1fr)_100px_100px_90px_180px] xl:items-center xl:gap-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="bg-secondary text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <Scissors className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold wrap-break-word">
                        {service.name}
                      </h3>
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed wrap-break-word">
                        {service.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 inline-block text-sm font-semibold tabular-nums xl:mt-0">
                    <span className="sr-only">Preço: </span>
                    {formatPrice(service.priceInCents)}
                  </div>
                  <div className="text-muted-foreground ml-5 inline-flex items-center gap-1.5 text-sm xl:ml-0">
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Duração: </span>
                    {service.durationMinutes} min
                  </div>
                  <div className="mt-3 xl:mt-0">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${service.active ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-secondary text-muted-foreground"}`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${service.active ? "bg-emerald-600" : "bg-muted-foreground"}`}
                      />
                      {service.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1 xl:mt-0 xl:justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar ${service.name}`}
                      onClick={() => setEditor({ service })}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${service.active ? "Desativar" : "Ativar"} ${service.name}`}
                      onClick={() => {
                        void toggle(service).catch(() =>
                          toast.error("Não foi possível alterar o serviço."),
                        );
                      }}
                    >
                      {service.active ? (
                        <X className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Check className="size-3.5" aria-hidden="true" />
                      )}
                      {service.active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-border text-muted-foreground border-t px-4 py-4 text-xs sm:px-6">
              {visible.length} de {services.length} serviços · Catálogo
              demonstrativo
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="bg-secondary mb-4 rounded-2xl p-4">
              <Search
                className="text-muted-foreground size-6"
                aria-hidden="true"
              />
            </div>
            <h3 className="font-semibold">
              {services.length === 0
                ? "Seu catálogo começa aqui"
                : "Nenhum serviço encontrado"}
            </h3>
            <p className="text-muted-foreground mt-2 max-w-sm text-sm">
              {services.length === 0
                ? "Adicione seu primeiro serviço para receber agendamentos."
                : "Tente outro nome ou ajuste o filtro de status."}
            </p>
            <Button
              className="mt-5"
              variant="outline"
              onClick={() => {
                if (services.length === 0) setEditor({});
                else {
                  setQuery("");
                  setFilter("all");
                }
              }}
            >
              {services.length === 0
                ? "Adicionar serviço"
                : "Limpar busca e filtros"}
            </Button>
          </div>
        )}
      </section>
      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="p-6 pr-12">
            <SheetTitle>
              {editor?.service ? "Editar serviço" : "Novo serviço"}
            </SheetTitle>
            <SheetDescription>
              Configure os detalhes do seu serviço.
            </SheetDescription>
          </SheetHeader>
          {editor && (
            <ServiceForm
              key={editor.service?.id ?? "new"}
              service={editor.service}
              onSave={save}
              onCancel={() => setEditor(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
