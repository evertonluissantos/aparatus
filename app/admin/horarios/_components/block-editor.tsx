"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { useDemoBarbershop } from "../../_components/demo-context";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import {
  DEMO_TIME_ZONE,
  ScheduleError,
  type BlockInput,
} from "../_lib/schedule";

const initial: BlockInput = {
  professionalId: null,
  start: "",
  end: "",
  allDay: true,
  kind: "EXTRAORDINARY",
  reason: "",
};
const displayDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: DEMO_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export function BlockEditor({ shop }: { shop: DemoBarbershop }) {
  const { addBlock, removeBlock } = useDemoBarbershop();
  const [input, setInput] = useState(initial);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  function update<Key extends keyof BlockInput>(
    key: Key,
    value: BlockInput[Key],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
    setError("");
    setStatus("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await addBlock(shop.id, input);
      setInput(initial);
      setError("");
      setStatus("Bloqueio adicionado.");
      toast.success("Bloqueio adicionado.");
    } catch (failure) {
      setError(
        failure instanceof ScheduleError
          ? failure.message
          : "Não foi possível adicionar o bloqueio.",
      );
    }
  }
  return (
    <section className="border-border bg-card rounded-2xl border p-5 sm:p-6">
      <h2 className="font-semibold">Folgas, férias e bloqueios pontuais</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Bloqueie toda a barbearia ou um profissional. Os períodos reduzem a
        prévia de disponibilidade, sem alterar reservas. Para mudar um bloqueio,
        remova-o e cadastre outro.
      </p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="block-scope" className="text-sm font-medium">
              Aplicar a
            </label>
            <select
              id="block-scope"
              value={input.professionalId ?? ""}
              onChange={(event) =>
                update("professionalId", event.target.value || null)
              }
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Toda a barbearia</option>
              {shop.professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                  {!professional.active ? " · Inativo" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="block-kind" className="text-sm font-medium">
              Tipo
            </label>
            <select
              id="block-kind"
              value={input.kind}
              onChange={(event) =>
                update("kind", event.target.value as BlockInput["kind"])
              }
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              <option value="EXTRAORDINARY">Feriado ou fechamento</option>
              <option value="ABSENCE">Folga ou férias</option>
              <option value="BREAK">Pausa pontual</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            className="accent-primary size-4"
            type="checkbox"
            checked={input.allDay}
            onChange={(event) => {
              setInput((current) => ({
                ...current,
                allDay: event.target.checked,
                start: "",
                end: "",
              }));
              setError("");
            }}
          />
          Bloquear dias inteiros
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["start", "end"] as const).map((bound) => (
            <div key={bound} className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`block-${bound}`}>
                {bound === "start" ? "Início" : "Fim"}
                {input.allDay && bound === "end" ? " (data incluída)" : ""}
              </label>
              <Input
                id={`block-${bound}`}
                required
                type={input.allDay ? "date" : "datetime-local"}
                value={input[bound]}
                onChange={(event) => update(bound, event.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <label htmlFor="block-reason" className="text-sm font-medium">
            Motivo
          </label>
          <Input
            id="block-reason"
            required
            maxLength={160}
            value={input.reason}
            placeholder="Ex.: Feriado de exemplo ou férias"
            onChange={(event) => update("reason", event.target.value)}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Fuso: América/São Paulo. Em dias inteiros, ambas as datas são
          incluídas. Períodos parciais usam fim exclusivo; períodos adjacentes
          são permitidos.
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <p role="status" className="text-muted-foreground text-sm">
          {status}
        </p>
        <Button type="submit">Adicionar bloqueio demo</Button>
      </form>
      <h3 className="mt-8 font-medium">
        Bloqueios aplicados ({shop.schedule.blocks.length})
      </h3>
      {shop.schedule.blocks.length ? (
        <ul className="divide-border mt-3 divide-y">
          {[...shop.schedule.blocks]
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .map((block) => (
              <li
                key={block.id}
                className="flex items-start justify-between gap-4 py-4"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium wrap-break-word">{block.reason}</p>
                  <p className="text-muted-foreground mt-1 wrap-break-word">
                    {block.professionalId === null
                      ? "Toda a barbearia"
                      : (shop.professionals.find(
                          (professional) =>
                            professional.id === block.professionalId,
                        )?.name ?? "Profissional")}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {displayDate(block.startsAt)} → {displayDate(block.endsAt)}{" "}
                    (fim exclusivo)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover bloqueio: ${block.reason}`}
                  onClick={async () => {
                    try {
                      await removeBlock(shop.id, block.id);
                      setStatus("Bloqueio removido.");
                      setError("");
                      toast.success("Bloqueio removido.");
                    } catch {
                      setError("Não foi possível remover o bloqueio.");
                    }
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">
          Nenhuma data bloqueada nesta barbearia.
        </p>
      )}
    </section>
  );
}
