"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Clock3, Pencil, Plus, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/app/_components/ui/sheet";
import { useDemoBarbershop } from "../../_components/demo-context";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import { matchesServiceName } from "../../servicos/_lib/service";
import type { DemoProfessional, ProfessionalInput } from "../_lib/professional";
import { ProfessionalForm } from "./professional-form";

export function ProfessionalsPanel() {
  const { selectedShop } = useDemoBarbershop();
  return selectedShop ? (
    <ProfessionalList key={selectedShop.id} shop={selectedShop} />
  ) : null;
}
function ProfessionalList({ shop }: { shop: DemoBarbershop }) {
  const { saveProfessional, setProfessionalActive } = useDemoBarbershop();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<{
    professional?: DemoProfessional;
  } | null>(null);
  const [message, setMessage] = useState("");
  const professionals = shop.professionals.filter(
    (item) => item.barbershopId === shop.id,
  );
  const visible = professionals.filter(
    (item) =>
      matchesServiceName(item.name, query) &&
      (status === "all" || item.active === (status === "active")),
  );
  function feedback(text: string) {
    setMessage(text);
    toast.success(text, {
      description: "Alteração aplicada a esta barbearia.",
    });
  }
  async function save(input: ProfessionalInput) {
    await saveProfessional(shop.id, editor?.professional?.id, input);
    feedback(
      editor?.professional
        ? "Profissional atualizado."
        : "Profissional adicionado.",
    );
    setEditor(null);
  }
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Profissionais
          </h1>
          <p className="text-muted-foreground mt-2 text-sm wrap-break-word">
            Equipe de {shop.name}.
          </p>
        </div>
        <Button onClick={() => setEditor({})}>
          <Plus className="size-4" aria-hidden="true" />
          Novo profissional
        </Button>
      </div>
      <div className="border-border bg-card mb-6 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border p-5 text-sm">
        <span>
          <strong>{professionals.length}</strong> profissionais
        </span>
        <span>
          <strong>{professionals.filter((item) => item.active).length}</strong>{" "}
          ativos
        </span>
        <span>
          <strong>{professionals.filter((item) => !item.active).length}</strong>{" "}
          inativos
        </span>
      </div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="professional-search" className="sr-only">
            Buscar profissional por nome
          </label>
          <Search
            className="text-muted-foreground absolute top-3 left-3 size-4"
            aria-hidden="true"
          />
          <Input
            id="professional-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar profissional por nome…"
            className="h-10 pl-10"
          />
        </div>
        <label className="sr-only" htmlFor="professional-filter">
          Filtrar por status
        </label>
        <select
          id="professional-filter"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="border-input bg-background focus-visible:ring-ring/50 h-10 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
        >
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </div>
      <p role="status" className="text-muted-foreground mb-4 text-sm">
        {visible.length} profissionais encontrados. {message}
      </p>
      {visible.length ? (
        <ul className="grid gap-4 xl:grid-cols-2">
          {visible.map((professional) => (
            <li
              key={professional.id}
              className="border-border bg-card flex min-w-0 flex-col rounded-2xl border p-5"
            >
              <div className="flex items-start gap-3">
                <div className="bg-secondary relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                  {professional.photoUrl ? (
                    <Image
                      src={professional.photoUrl}
                      alt={`Foto de ${professional.name}`}
                      fill
                      unoptimized
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <UserRound
                      className="text-muted-foreground size-6"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold wrap-break-word">
                    {professional.name}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {professional.phone || "Telefone não informado"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${professional.active ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-secondary text-muted-foreground"}`}
                >
                  {professional.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-muted-foreground mt-4 text-sm leading-relaxed wrap-break-word whitespace-pre-line">
                {professional.description}
              </p>
              <h3 className="mt-5 text-xs font-semibold uppercase">
                Serviços associados
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {professional.serviceIds.length ? (
                  professional.serviceIds.map((id) => {
                    const service = shop.services.find(
                      (item) => item.id === id && item.barbershopId === shop.id,
                    );
                    return (
                      <span
                        key={id}
                        className="bg-secondary max-w-full rounded-md px-2 py-1 text-xs wrap-break-word"
                      >
                        {service?.name ?? "Serviço indisponível"}
                        {service && !service.active ? " · Inativo" : ""}
                      </span>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Sem serviços associados.
                  </p>
                )}
              </div>
              <p className="text-muted-foreground mt-4 flex items-start gap-2 text-xs">
                <Clock3 className="size-4 shrink-0" aria-hidden="true" />
                Configure o expediente semanal na seção Horários. A prévia não
                cria reservas.
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Button asChild variant="outline" size="sm">
                  <Link prefetch={false} href="/painel/horarios">
                    Horários
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditor({ professional })}
                  aria-label={`Editar ${professional.name}`}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${professional.active ? "Desativar" : "Ativar"} ${professional.name}`}
                  onClick={async () => {
                    try {
                      await setProfessionalActive(
                        shop.id,
                        professional.id,
                        !professional.active,
                      );
                      feedback(
                        professional.active
                          ? "Profissional desativado."
                          : "Profissional ativado.",
                      );
                    } catch {
                      setMessage("Não foi possível alterar o status.");
                      toast.error("Não foi possível alterar o status.");
                    }
                  }}
                >
                  {professional.active ? "Desativar" : "Ativar"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border bg-card rounded-2xl border p-10 text-center">
          <UserRound
            className="text-muted-foreground mx-auto mb-4 size-8"
            aria-hidden="true"
          />
          <h2 className="font-semibold">
            {professionals.length
              ? "Nenhum profissional encontrado"
              : "Sua equipe começa aqui"}
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-md text-sm">
            {professionals.length
              ? "Ajuste a busca ou o filtro de status."
              : "Cadastre um profissional e selecione os serviços que ele realiza nesta barbearia."}
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => {
              if (!professionals.length) setEditor({});
              else {
                setQuery("");
                setStatus("all");
              }
            }}
          >
            {professionals.length
              ? "Limpar busca e filtro"
              : "Adicionar primeiro profissional"}
          </Button>
        </div>
      )}
      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="p-6 pr-12">
            <SheetTitle>
              {editor?.professional
                ? "Editar profissional"
                : "Novo profissional"}
            </SheetTitle>
            <SheetDescription>
              Confira os dados e os serviços associados antes de salvar.
            </SheetDescription>
          </SheetHeader>
          {editor && (
            <ProfessionalForm
              key={editor.professional?.id ?? "new"}
              shop={shop}
              professional={editor.professional}
              onSave={save}
              onCancel={() => setEditor(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
