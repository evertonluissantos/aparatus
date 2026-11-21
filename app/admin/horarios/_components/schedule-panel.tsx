"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { useDemoBarbershop } from "../../_components/demo-context";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import {
  effectiveWindows,
  minuteLabel,
  weekdays,
  emptyWeek,
} from "../_lib/schedule";
import { WeeklyEditor } from "./weekly-editor";
import { BlockEditor } from "./block-editor";
import { AvailabilityPreview } from "./availability-preview";

export function SchedulePanel() {
  const { selectedShop } = useDemoBarbershop();
  return selectedShop ? (
    <ScheduleWorkspace key={selectedShop.id} shop={selectedShop} />
  ) : null;
}
function ScheduleWorkspace({ shop }: { shop: DemoBarbershop }) {
  const [scope, setScope] = useState("");
  const professionalId = scope || null;
  const week =
    professionalId === null
      ? shop.schedule.shopWeek
      : (shop.schedule.professionalWeeks[professionalId] ?? emptyWeek());
  const professional = shop.professionals.find(
    (item) => item.id === professionalId,
  );
  return (
    <section className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Horários e disponibilidade
        </h1>
        <p className="text-muted-foreground mt-2 text-sm wrap-break-word">
          {shop.name} · Configuração demonstrativa em memória.
        </p>
      </div>
      <div className="border-border bg-card rounded-xl border p-5">
        <label htmlFor="schedule-scope" className="block text-sm font-medium">
          Configurar horários de
        </label>
        <select
          id="schedule-scope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          className="border-input bg-background mt-3 h-11 w-full rounded-md border px-3 text-sm"
        >
          <option value="">Barbearia · funcionamento geral</option>
          {shop.professionals
            .filter((item) => item.barbershopId === shop.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {!item.active ? " · Inativo" : ""}
              </option>
            ))}
        </select>
        <p className="text-muted-foreground mt-3 text-xs">
          Configure primeiro a barbearia, depois cada profissional.
          Profissionais sem expediente configurado não recebem sugestões. Trocar
          de escopo descarta o rascunho não aplicado.
        </p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <WeeklyEditor
          key={scope || "shop"}
          shop={shop}
          professionalId={professionalId}
        />
        <aside className="border-border bg-card rounded-2xl border p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock3 className="size-4" aria-hidden="true" />
            Resumo aplicado
          </h2>
          <p className="text-muted-foreground mt-2 text-sm wrap-break-word">
            {professional?.name ?? "Funcionamento da barbearia"}
          </p>
          <ul className="divide-border mt-4 divide-y">
            {[...week]
              .sort((a, b) => a.weekday - b.weekday)
              .map((day) => {
                let windows = effectiveWindows(day);
                if (professionalId !== null) {
                  const shopDay = shop.schedule.shopWeek.find(
                    (item) => item.weekday === day.weekday,
                  );
                  const open = shopDay ? effectiveWindows(shopDay) : [];
                  windows = windows.flatMap((window) =>
                    open
                      .map((range) => ({
                        start: Math.max(range.start, window.start),
                        end: Math.min(range.end, window.end),
                      }))
                      .filter((range) => range.start < range.end),
                  );
                }
                return (
                  <li key={day.weekday} className="py-3 text-sm">
                    <p className="font-medium">{weekdays[day.weekday]}</p>
                    <p className="text-muted-foreground mt-1">
                      {windows.length
                        ? windows
                            .map(
                              (range) =>
                                `${minuteLabel(range.start)}–${minuteLabel(range.end)}`,
                            )
                            .join(" · ")
                        : "Sem expediente disponível"}
                    </p>
                  </li>
                );
              })}
          </ul>
          <p className="text-muted-foreground mt-4 text-xs">
            Resumo semanal após pausas, sem bloqueios por data. Bloqueios
            pontuais e duração são considerados na prévia abaixo. Fuso
            América/São Paulo.
          </p>
          {professional && !professional.active && (
            <p className="mt-3 text-xs font-medium">
              Profissional inativo, sem elegibilidade para novos agendamentos.
            </p>
          )}
        </aside>
      </div>
      <BlockEditor shop={shop} />
      <AvailabilityPreview shop={shop} />
    </section>
  );
}
