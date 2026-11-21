"use client";

import { useEffect, useState } from "react";
import { Search, Plus, Users, Pencil } from "lucide-react";
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
import { appointmentLabels, agendaTime } from "../../agenda/_lib/appointment";
import {
  clientHistory,
  clientMetrics,
  matchesDemoClient,
  type ClientInput,
} from "../_lib/client";
import { ClientForm } from "./client-form";

const displayDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export function ClientsPanel() {
  const { selectedShop } = useDemoBarbershop();
  return selectedShop ? (
    <ClientWorkspace key={selectedShop.id} shop={selectedShop} />
  ) : null;
}
function ClientWorkspace({ shop }: { shop: DemoBarbershop }) {
  const { saveClient } = useDemoBarbershop();
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<{
    mode: "new" | "edit" | "view";
    id?: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const now = new Date(clock);
  const clients = shop.clients.filter(
    (client) => client.barbershopId === shop.id,
  );
  const visible = clients.filter((client) => matchesDemoClient(client, query));
  const selected = clients.find((client) => client.id === panel?.id);
  const history = selected ? clientHistory(shop, selected.id) : [];
  const metrics = selected ? clientMetrics(shop, selected.id, now) : null;
  async function save(input: ClientInput) {
    await saveClient(
      shop.id,
      panel?.mode === "edit" ? selected?.id : undefined,
      input,
    );
    const text = selected ? "Cliente atualizado." : "Cliente adicionado.";
    setMessage(text);
    toast.success(text);
    setPanel(null);
  }
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-2 text-sm wrap-break-word">
            Carteira de clientes de {shop.name}.
          </p>
        </div>
        <Button onClick={() => setPanel({ mode: "new" })}>
          <Plus className="size-4" aria-hidden="true" />
          Novo cliente
        </Button>
      </div>
      <div className="border-border bg-card mb-6 rounded-xl border p-5">
        <p className="text-sm">
          <strong>{clients.length}</strong> clientes nesta barbearia
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          Reservas incluem confirmados, cancelados e concluídos. Frequência e
          último atendimento consideram apenas conclusões registradas após o
          término previsto.
        </p>
      </div>
      <div className="relative mb-5">
        <label htmlFor="clients-search" className="sr-only">
          Buscar por nome ou telefone
        </label>
        <Search
          className="text-muted-foreground absolute top-3 left-3 size-4"
          aria-hidden="true"
        />
        <Input
          id="clients-search"
          type="search"
          className="h-10 pl-10"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou telefone…"
        />
      </div>
      <p role="status" className="text-muted-foreground mb-4 text-sm">
        {visible.length} clientes encontrados. {message}
      </p>
      {visible.length ? (
        <ul className="grid gap-4 xl:grid-cols-2">
          {visible.map((client) => {
            const summary = clientMetrics(shop, client.id, now);
            return (
              <li
                key={client.id}
                className="border-border bg-card min-w-0 rounded-2xl border p-5"
              >
                <h2 className="font-semibold wrap-break-word">{client.name}</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {client.phone ? `+${client.phone}` : "Telefone não informado"}
                </p>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Atendimentos concluídos
                    </dt>
                    <dd className="mt-1 font-semibold">{summary.completed}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Reservas no histórico
                    </dt>
                    <dd className="mt-1 font-semibold">
                      {summary.reservations}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">
                      Último atendimento concluído
                    </dt>
                    <dd className="mt-1">
                      {summary.lastCompletedAt
                        ? displayDate(summary.lastCompletedAt)
                        : "Nenhum atendimento concluído"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPanel({ mode: "view", id: client.id })}
                    aria-label={`Ver detalhes de ${client.name}`}
                  >
                    Ver detalhes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPanel({ mode: "edit", id: client.id })}
                    aria-label={`Editar ${client.name}`}
                  >
                    <Pencil className="size-3" aria-hidden="true" />
                    Editar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-border bg-card rounded-2xl border p-10 text-center">
          <Users
            className="text-muted-foreground mx-auto mb-4 size-8"
            aria-hidden="true"
          />
          <h2 className="font-semibold">
            {clients.length
              ? "Nenhum cliente encontrado"
              : "Sua carteira começa aqui"}
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm">
            {clients.length
              ? "Tente outro nome ou telefone."
              : "Adicione um cliente ou crie um agendamento. Os agendamentos públicos também alimentam esta carteira."}
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() =>
              clients.length ? setQuery("") : setPanel({ mode: "new" })
            }
          >
            {clients.length ? "Limpar busca" : "Adicionar primeiro cliente"}
          </Button>
        </div>
      )}
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="p-6 pr-12">
            <SheetTitle>
              {panel?.mode === "view"
                ? "Detalhes do cliente"
                : panel?.mode === "edit"
                  ? "Editar cliente"
                  : "Novo cliente"}
            </SheetTitle>
            <SheetDescription>
              Dados fictícios em memória, sem cadastro ou histórico
              persistentes.
            </SheetDescription>
          </SheetHeader>
          {panel &&
            (panel.mode === "view" && selected && metrics ? (
              <div className="space-y-6 p-6">
                <div>
                  <h2 className="text-xl font-semibold wrap-break-word">
                    {selected.name}
                  </h2>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {selected.phone
                      ? `+${selected.phone}`
                      : "Telefone não informado"}
                  </p>
                  <p className="text-muted-foreground mt-4 text-sm wrap-break-word whitespace-pre-line">
                    {selected.notes || "Sem observações."}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setPanel({ mode: "edit", id: selected.id })}
                  >
                    Editar cadastro
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm">
                  {metrics.completed} atendimentos concluídos ·{" "}
                  {metrics.confirmed} reservas confirmadas · {metrics.cancelled}{" "}
                  canceladas
                </p>
                <section>
                  <h3 className="font-semibold">Histórico desta barbearia</h3>
                  {history.length ? (
                    <ul className="divide-border mt-4 divide-y">
                      {history.map((appointment) => (
                        <li
                          key={appointment.id}
                          className="space-y-2 py-4 text-sm"
                        >
                          <p className="font-medium wrap-break-word">
                            {appointment.serviceName}
                          </p>
                          <p className="text-muted-foreground">
                            {displayDate(appointment.startsAt)}–
                            {agendaTime(appointment.endsAt)} ·{" "}
                            {appointment.durationMinutesSnapshot} min
                          </p>
                          <p className="text-muted-foreground wrap-break-word">
                            Profissional: {appointment.professionalName}
                          </p>
                          <span className="bg-secondary inline-block rounded-full px-2 py-1 text-xs">
                            {appointmentLabels[appointment.status]}
                          </span>
                          {appointment.clientName !== selected.name && (
                            <p className="text-muted-foreground text-xs wrap-break-word">
                              Nome informado no agendamento:{" "}
                              {appointment.clientName}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground mt-3 text-sm">
                      Nenhum agendamento associado a este cadastro.
                    </p>
                  )}
                </section>
                <p className="text-muted-foreground text-xs">
                  Histórico derivado da agenda, sem cópia independente. Reservas
                  futuras ou canceladas não são atendimentos concluídos.
                </p>
              </div>
            ) : (
              <ClientForm
                key={panel.id ?? "new"}
                client={panel.mode === "edit" ? selected : undefined}
                onSave={save}
                onCancel={() => setPanel(null)}
              />
            ))}
        </SheetContent>
      </Sheet>
    </section>
  );
}
