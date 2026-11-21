"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { useDemoBarbershop } from "../../_components/demo-context";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import {
  cloneWeek,
  emptyWeek,
  weekdays,
  ScheduleError,
  type TimeRange,
} from "../_lib/schedule";

export function WeeklyEditor({
  shop,
  professionalId,
}: {
  shop: DemoBarbershop;
  professionalId: string | null;
}) {
  const { saveWeek } = useDemoBarbershop();
  const saved =
    professionalId === null
      ? shop.schedule.shopWeek
      : (shop.schedule.professionalWeeks[professionalId] ?? emptyWeek());
  const [week, setWeek] = useState(() => cloneWeek(saved));
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const professional = shop.professionals.find(
    (item) => item.id === professionalId,
  );
  function change(
    weekday: number,
    update: (day: (typeof week)[number]) => (typeof week)[number],
  ) {
    setWeek((current) =>
      current.map((day) => (day.weekday === weekday ? update(day) : day)),
    );
    setError("");
    setStatus("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await saveWeek(shop.id, professionalId, week);
      setError("");
      setStatus("Horários aplicados.");
      toast.success("Horários atualizados.");
    } catch (failure) {
      setStatus("");
      setError(
        failure instanceof ScheduleError
          ? failure.message
          : "Não foi possível aplicar os horários.",
      );
    }
  }
  const rangeEditor = (
    weekday: number,
    type: "windows" | "breaks",
    range: TimeRange,
    index: number,
  ) => (
    <div key={`${type}-${index}`} className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground w-12 text-xs">
        {type === "windows" ? "Aberto" : "Pausa"}
      </span>
      {(["start", "end"] as const).map((bound) => (
        <div key={bound} className="flex items-center gap-2">
          {bound === "end" && (
            <span className="text-muted-foreground text-xs">até</span>
          )}
          <Input
            type="time"
            required
            value={range[bound]}
            onChange={(event) =>
              change(weekday, (day) => ({
                ...day,
                [type]: day[type].map((item, i) =>
                  i === index ? { ...item, [bound]: event.target.value } : item,
                ),
              }))
            }
            aria-label={`${weekdays[weekday]}: ${type === "windows" ? "período" : "pausa"} ${index + 1}, ${bound === "start" ? "início" : "fim"}`}
            className="w-29 text-sm"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remover ${type === "windows" ? "período" : "pausa"} ${index + 1} de ${weekdays[weekday]}`}
        onClick={() =>
          change(weekday, (day) => ({
            ...day,
            [type]: day[type].filter((_, i) => i !== index),
            ...(type === "windows" && day.windows.length === 1
              ? { breaks: [] }
              : {}),
          }))
        }
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
  return (
    <form
      onSubmit={submit}
      noValidate
      className="border-border bg-card overflow-hidden rounded-2xl border"
    >
      <div className="border-border border-b p-5">
        <h2 className="font-semibold">
          {professionalId === null
            ? "Funcionamento da barbearia"
            : `Expediente de ${professional?.name}`}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Todos os horários usam o fuso de São Paulo. Pausas do estabelecimento
          se aplicam também à equipe. Os dias começam fechados, sem horários
          presumidos.
        </p>
        {professional && !professional.active && (
          <p className="mt-3 text-sm font-medium">
            Profissional inativo: pode configurar o expediente, mas ele não será
            elegível para novos atendimentos.
          </p>
        )}
      </div>
      <div className="divide-border divide-y">
        {week.map((day) => {
          const establishmentClosed =
            professionalId !== null &&
            !shop.schedule.shopWeek.find((open) => open.weekday === day.weekday)
              ?.windows.length;
          return (
            <fieldset key={day.weekday} className="space-y-3 p-5">
              <legend className="sr-only">{weekdays[day.weekday]}</legend>
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={day.windows.length > 0}
                  disabled={establishmentClosed && !day.windows.length}
                  onChange={(event) =>
                    change(day.weekday, (current) => ({
                      ...current,
                      windows: event.target.checked
                        ? [
                            {
                              ...(shop.schedule.shopWeek.find(
                                (item) => item.weekday === day.weekday,
                              )?.windows[0] ?? {
                                start: "09:00",
                                end: "18:00",
                              }),
                            },
                          ]
                        : [],
                      breaks: [],
                    }))
                  }
                />
                {weekdays[day.weekday]}
                <span className="text-muted-foreground ml-auto text-xs font-normal">
                  {day.windows.length
                    ? "Aberto"
                    : establishmentClosed
                      ? "Barbearia fechada"
                      : professionalId === null
                        ? "Fechado"
                        : "Não trabalha"}
                </span>
              </label>
              {day.windows.map((range, index) =>
                rangeEditor(day.weekday, "windows", range, index),
              )}
              {day.breaks.map((range, index) =>
                rangeEditor(day.weekday, "breaks", range, index),
              )}
              {day.windows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      change(day.weekday, (current) => ({
                        ...current,
                        windows: [...current.windows, { start: "", end: "" }],
                      }))
                    }
                  >
                    <Plus className="size-3" aria-hidden="true" />
                    Período
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      change(day.weekday, (current) => ({
                        ...current,
                        breaks: [...current.breaks, { start: "", end: "" }],
                      }))
                    }
                  >
                    <Plus className="size-3" aria-hidden="true" />
                    Pausa
                  </Button>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <div className="border-border space-y-3 border-t p-5">
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <p role="status" className="text-muted-foreground text-sm">
          {status}
        </p>
        <p className="text-muted-foreground text-xs">
          Alterações deste formulário só entram no resumo e na prévia depois de
          aplicar. Recarregar descarta tudo.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setWeek(cloneWeek(saved));
              setError("");
              setStatus("Rascunho descartado.");
            }}
          >
            Descartar rascunho
          </Button>
          <Button type="submit">Aplicar horários demo</Button>
        </div>
      </div>
    </form>
  );
}
