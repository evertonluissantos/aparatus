"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "./ui/calendar";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useDemoBarbershop } from "../admin/_components/demo-context";
import type { DemoBarbershop } from "../admin/_lib/demo-barbershop";
import { eligibleDemoProfessionals } from "../admin/profissionais/_lib/professional";
import { formatPrice } from "../admin/servicos/_lib/service";
import {
  AgendaError,
  agendaTime,
  appointmentSchema,
  type AppointmentInput,
} from "../admin/agenda/_lib/appointment";
import { DEMO_TIME_ZONE } from "../admin/horarios/_lib/schedule";
import { localDateAt } from "../../lib/bookings/timezone";
import { publicDemoAvailability } from "../_lib/public-demo-booking";
import { clientPhoneSchema, ClientError } from "../admin/clientes/_lib/client";
import { mvpRequest } from "../admin/_components/persistent-context";
import type { Interval } from "@/lib/bookings/types";

export function PublicBookingForm({
  shop,
  initialServiceId,
  onConfirm,
  onCancel,
}: {
  shop: DemoBarbershop;
  initialServiceId: string;
  onConfirm: (input: AppointmentInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { publicBookingShops: shops, persistent } = useDemoBarbershop();
  const [remote, setRemote] = useState<{
    key: string;
    slots: Interval[];
    error: string;
  }>({ key: "", slots: [], error: "" });
  const [serviceId] = useState(initialServiceId);
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [selectedStart, setSelectedStart] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const services = shop.services.filter(
    (item) => item.active && item.barbershopId === shop.id,
  );
  const service = services.find((item) => item.id === serviceId);
  const professionals = eligibleDemoProfessionals(shop, serviceId);
  const professional = professionals.find((item) => item.id === professionalId);
  const preview = useMemo(() => {
    if (!serviceId || !professionalId || !date) return { slots: [], error: "" };
    try {
      return {
        slots: publicDemoAvailability(
          shops,
          shop.id,
          professionalId,
          serviceId,
          date,
          new Date(clock),
        ),
        error: "",
      };
    } catch {
      return {
        slots: [],
        error:
          "Não foi possível consultar a prévia. Confira a data e a configuração demonstrativa.",
      };
    }
  }, [shops, shop.id, serviceId, professionalId, date, clock]);
  const availabilityKey = [
    shop.id,
    serviceId,
    professionalId,
    date,
    clock,
  ].join(":");
  useEffect(() => {
    if (!persistent || !professionalId || !date) return;
    let current = true;
    const params = new URLSearchParams({
      barbershopId: shop.id,
      serviceId,
      professionalId,
      localDate: date,
    });
    void mvpRequest<{ startsAt: string; endsAt: string }[]>(
      `/api/public?${params}`,
    )
      .then((slots) => {
        if (current)
          setRemote({
            key: availabilityKey,
            slots: slots.map((s) => ({
              startsAt: new Date(s.startsAt),
              endsAt: new Date(s.endsAt),
            })),
            error: "",
          });
      })
      .catch(() => {
        if (current)
          setRemote({
            key: availabilityKey,
            slots: [],
            error:
              "Não foi possível consultar horários. Selecione novamente a data.",
          });
      });
    return () => {
      current = false;
    };
  }, [
    persistent,
    shop.id,
    serviceId,
    professionalId,
    date,
    clock,
    availabilityKey,
  ]);
  const availability = persistent
    ? remote.key === availabilityKey
      ? remote
      : { slots: [], error: "Consultando disponibilidade…" }
    : preview;
  const chosen = availability.slots.find(
    (slot) => slot.startsAt.toISOString() === selectedStart,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    const name = appointmentSchema.shape.clientName.safeParse(clientName);
    if (!name.success) {
      setError(name.error.issues[0].message);
      return;
    }
    const phone = clientPhoneSchema.safeParse(clientPhone);
    if (!phone.success) {
      setError(phone.error.issues[0].message);
      return;
    }
    if (!chosen || !service || !professional) {
      setError(
        "Escolha serviço, profissional, data e um horário disponível na prévia.",
      );
      return;
    }
    locked.current = true;
    setSaving(true);
    try {
      await onConfirm({
        clientName: name.data,
        clientPhone: phone.data,
        serviceId,
        professionalId,
        localDate: date,
        localTime: agendaTime(chosen.startsAt),
      });
    } catch (failure) {
      setError(
        failure instanceof AgendaError || failure instanceof ClientError
          ? failure.message
          : "Não foi possível registrar a simulação. Confira os dados e tente novamente.",
      );
      setSelectedStart("");
      locked.current = false;
      setSaving(false);
    }
  }
  return (
    <form noValidate onSubmit={submit} className="flex flex-1 flex-col">
      <div className="flex flex-col gap-6 px-5">
        <p className="text-muted-foreground text-sm wrap-break-word">
          {persistent
            ? `Agendamento para ${shop.name}. O pagamento do serviço é feito diretamente à barbearia.`
            : `Agendamento fictício para ${shop.name}. Use somente dados de exemplo.`}
        </p>
        <p className="text-card-foreground text-sm font-bold">
          {service?.name ?? "Serviço indisponível"}
        </p>
        <div className="space-y-2">
          <label
            htmlFor="public-demo-professional"
            className="text-sm font-medium"
          >
            Profissional
          </label>
          <select
            id="public-demo-professional"
            required
            disabled={!professionals.length}
            value={professionalId}
            onChange={(event) => {
              setProfessionalId(event.target.value);
              setSelectedStart("");
              setError("");
            }}
            className="border-input bg-background h-11 w-full rounded-md border px-2 text-sm disabled:opacity-50"
          >
            <option value="">Selecione um profissional</option>
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {serviceId && !professionals.length && (
            <p className="text-muted-foreground text-sm">
              Nenhum profissional ativo realiza este serviço na demonstração.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Data em São Paulo</p>
          <Calendar
            mode="single"
            selected={date ? new Date(date + "T12:00:00") : undefined}
            onSelect={(value) => {
              setDate(value ? format(value, "yyyy-MM-dd") : "");
              setSelectedStart("");
              setError("");
            }}
            disabled={{
              before: new Date(
                localDateAt(new Date(clock), DEMO_TIME_ZONE) + "T00:00:00",
              ),
            }}
            className="w-full p-0"
            locale={ptBR}
          />
          <p className="text-muted-foreground text-xs">
            Hoje ou uma data futura, sempre com início futuro. Todos os horários
            usam o fuso de São Paulo.
          </p>
        </div>
        <Separator />
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">
            Horário demonstrativo
          </legend>
          <div role="status" className="text-muted-foreground text-sm">
            {availability.error ||
              (!date || !professionalId
                ? "Selecione serviço, profissional e data para ver os horários."
                : availability.slots.length
                  ? `${availability.slots.length} sugestões. A disponibilidade é revalidada ao confirmar.`
                  : "Nenhum horário disponível nesta data. Tente outro dia ou profissional; o expediente pode não estar configurado.")}
          </div>
          <div className="flex gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {availability.slots.map((slot) => {
              const start = slot.startsAt.toISOString();
              return (
                <Button
                  key={start}
                  type="button"
                  variant={selectedStart === start ? "default" : "outline"}
                  aria-pressed={selectedStart === start}
                  onClick={() => {
                    setSelectedStart(start);
                    setError("");
                  }}
                  className="shrink-0 rounded-full px-4 py-2"
                >
                  {agendaTime(slot.startsAt)}
                </Button>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-2">
          <label htmlFor="public-demo-client" className="text-sm font-medium">
            Nome fictício do cliente
          </label>
          <Input
            id="public-demo-client"
            required
            maxLength={80}
            value={clientName}
            onChange={(event) => {
              setClientName(event.target.value);
              setError("");
            }}
            placeholder="Ex.: Cliente Exemplo"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="public-demo-phone" className="text-sm font-medium">
            Telefone fictício (opcional)
          </label>
          <Input
            id="public-demo-phone"
            type="tel"
            maxLength={25}
            value={clientPhone}
            onChange={(event) => {
              setClientPhone(event.target.value);
              setError("");
            }}
            placeholder="(11) 90000-0000"
          />
          <p className="text-muted-foreground text-xs">
            Ajuda a evitar cadastros duplicados nesta barbearia. Sem telefone,
            será criado um novo cliente demonstrativo, mesmo que o nome se
            repita.
          </p>
        </div>
        {chosen && service && professional && (
          <div className="border-border bg-card flex w-full flex-col gap-3 rounded-[10px] border border-solid p-3">
            <div className="flex items-center justify-between">
              <p className="text-card-foreground text-base font-bold">
                {service.name}
              </p>
              <p className="text-card-foreground text-sm font-bold">
                {formatPrice(service.priceInCents)}
              </p>
            </div>
            {[
              ["Data", date.split("-").reverse().join("/")],
              ["Horário", agendaTime(chosen.startsAt)],
              ["Duração", service.durationMinutes + " min"],
              ["Profissional", professional.name],
              ["Barbearia", shop.name],
            ].map(([label, value]) => (
              <div
                key={label}
                className="text-muted-foreground flex items-center justify-between text-sm"
              >
                <p>{label}</p>
                <p>{value}</p>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      <div className="mt-auto space-y-3 px-5 pt-6 pb-6">
        <p className="text-muted-foreground text-xs">
          Somente uma simulação temporária nesta aba. Nenhuma vaga real será
          reservada e nenhum pagamento será solicitado.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Voltar
          </Button>
          <Button
            className="w-full rounded-full"
            type="submit"
            disabled={saving || !chosen || !service || !professional}
          >
            {saving ? "Registrando…" : "Confirmar simulação"}
          </Button>
        </div>
      </div>
    </form>
  );
}
