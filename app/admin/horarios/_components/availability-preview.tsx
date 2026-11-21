"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import { DEMO_TIME_ZONE, previewDemoAvailability } from "../_lib/schedule";
import { eligibleDemoProfessionals } from "../../profissionais/_lib/professional";

export function AvailabilityPreview({ shop }: { shop: DemoBarbershop }) {
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState<{
    key: string;
    shop: DemoBarbershop;
    slots: { start: string; end: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const professionals = eligibleDemoProfessionals(shop, serviceId);
  // Any schedule/service/staff change makes the previous snapshot visibly stale.
  const key = JSON.stringify([serviceId, professionalId, date]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !serviceId ||
      !date ||
      !professionals.some((professional) => professional.id === professionalId)
    ) {
      setError("Selecione serviço ativo, profissional elegível e data.");
      setResult(null);
      return;
    }
    try {
      const formatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: DEMO_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      const slots = previewDemoAvailability(
        shop,
        professionalId,
        serviceId,
        date,
        new Date(),
      );
      setResult({
        key,
        shop,
        slots: slots.map((slot) => ({
          start: formatter.format(slot.startsAt),
          end: formatter.format(slot.endsAt),
        })),
      });
      setError("");
    } catch {
      setResult(null);
      setError(
        "Não foi possível calcular a prévia. Confira data e configuração de horários.",
      );
    }
  }
  return (
    <section className="border-border bg-card rounded-2xl border p-5 sm:p-6">
      <h2 className="font-semibold">
        Prévia de disponibilidade · sem reservas
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Usa os horários e atendimentos demonstrativos desta aba. Considera
        pausas, bloqueios e duração; cancelados não bloqueiam. Não consulta
        reservas reais e não garante vagas.
      </p>
      <form
        noValidate
        onSubmit={submit}
        className="mt-5 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div className="space-y-2">
          <label htmlFor="preview-service" className="text-sm font-medium">
            Serviço
          </label>
          <select
            id="preview-service"
            className="border-input bg-background h-10 w-full rounded-md border px-2 text-sm"
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setProfessionalId("");
              setResult(null);
              setError("");
            }}
          >
            <option value="">Selecione um serviço</option>
            {shop.services
              .filter(
                (service) => service.barbershopId === shop.id && service.active,
              )
              .map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.durationMinutes} min
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="preview-professional" className="text-sm font-medium">
            Profissional
          </label>
          <select
            id="preview-professional"
            disabled={!professionals.length}
            className="border-input bg-background h-10 w-full rounded-md border px-2 text-sm disabled:opacity-50"
            value={professionalId}
            onChange={(event) => {
              setProfessionalId(event.target.value);
              setResult(null);
              setError("");
            }}
          >
            <option value="">
              {serviceId && !professionals.length
                ? "Sem profissional elegível"
                : "Selecione um profissional"}
            </option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="preview-date" className="text-sm font-medium">
            Data em São Paulo
          </label>
          <Input
            id="preview-date"
            type="date"
            required
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setResult(null);
              setError("");
            }}
          />
        </div>
        <Button type="submit">Calcular prévia</Button>
      </form>
      {error && (
        <p role="alert" className="text-destructive mt-4 text-sm">
          {error}
        </p>
      )}
      <div role="status" className="mt-5">
        {result && (result.key !== key || result.shop !== shop) ? (
          <p className="text-muted-foreground text-sm">
            A configuração mudou. Recalcule a prévia.
          </p>
        ) : result ? (
          result.slots.length ? (
            <>
              <p className="text-muted-foreground mb-3 text-sm">
                {result.slots.length} sugestões demonstrativas, com inícios a
                cada 30 minutos. Fuso de São Paulo.
              </p>
              <ul className="flex flex-wrap gap-2">
                {result.slots.map((slot) => (
                  <li
                    key={slot.start}
                    className="bg-secondary rounded-lg px-3 py-2 text-sm tabular-nums"
                  >
                    {slot.start}–{slot.end}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Sem sugestões nesta data. Confira expediente do profissional,
              pausas, bloqueios e duração. Horários passados não são sugeridos.
            </p>
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            Selecione os dados para conferir uma prévia local.
          </p>
        )}
      </div>
    </section>
  );
}
