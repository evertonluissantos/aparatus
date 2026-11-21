"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import { eligibleDemoProfessionals } from "../../profissionais/_lib/professional";
import { ClientError } from "../../clientes/_lib/client";
import {
  appointmentSchema,
  AgendaError,
  type AppointmentInput,
} from "../_lib/appointment";

export function AppointmentForm({
  shop,
  date,
  professionalId,
  onSave,
  onCancel,
}: {
  shop: DemoBarbershop;
  date: string;
  professionalId: string;
  onSave: (input: AppointmentInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<AppointmentInput>({
    clientName: "",
    clientPhone: "",
    serviceId: "",
    professionalId: "",
    localDate: date,
    localTime: "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof AppointmentInput, string[]>>
  >({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const services = shop.services.filter(
    (service) => service.barbershopId === shop.id && service.active,
  );
  const professionals = eligibleDemoProfessionals(shop, values.serviceId);
  function update<Key extends keyof AppointmentInput>(
    key: Key,
    value: AppointmentInput[Key],
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === "serviceId"
        ? {
            professionalId: eligibleDemoProfessionals(
              shop,
              typeof value === "string" ? value : "",
            ).some((item) => item.id === professionalId)
              ? professionalId
              : "",
          }
        : {}),
    }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    const result = appointmentSchema.safeParse(values);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      setErrors(fields);
      form.current
        ?.querySelector<HTMLElement>(`[name="${Object.keys(fields)[0]}"]`)
        ?.focus();
      return;
    }
    locked.current = true;
    setSaving(true);
    try {
      await onSave(values);
    } catch (failure) {
      setError(
        failure instanceof AgendaError || failure instanceof ClientError
          ? failure.message
          : "Não foi possível criar o atendimento.",
      );
      locked.current = false;
      setSaving(false);
    }
  }
  const fieldError = (key: keyof AppointmentInput) =>
    errors[key]?.[0] ? (
      <p id={`appointment-${key}-error`} className="text-destructive text-sm">
        {errors[key]?.[0]}
      </p>
    ) : null;
  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      className="flex flex-1 flex-col"
    >
      <div className="space-y-6 p-6">
        <p className="text-muted-foreground text-sm">
          Confira os dados do cliente. Este cadastro não processa pagamentos.
        </p>
        <div className="space-y-2">
          <label htmlFor="appointment-clientId" className="text-sm font-medium">
            Cliente da barbearia
          </label>
          <select
            id="appointment-clientId"
            value={values.clientId ?? ""}
            onChange={(event) => {
              const client = shop.clients.find(
                (item) =>
                  item.id === event.target.value &&
                  item.barbershopId === shop.id,
              );
              setValues((current) => ({
                ...current,
                clientId: client?.id,
                clientName: client?.name ?? "",
                clientPhone: client?.phone ?? "",
              }));
              setErrors({});
              setError("");
            }}
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Novo cliente</option>
            {shop.clients
              .filter((client) => client.barbershopId === shop.id)
              .map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.phone ? ` · ${client.phone}` : " · Sem telefone"}
                </option>
              ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Selecione um cadastro existente para reutilizar seu histórico. Novos
            cadastros com telefone existente são vinculados à mesma carteira.
          </p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="appointment-clientName"
            className="text-sm font-medium"
          >
            Nome do cliente
          </label>
          <Input
            id="appointment-clientName"
            name="clientName"
            required
            autoFocus
            maxLength={80}
            value={values.clientName}
            readOnly={Boolean(values.clientId)}
            onChange={(event) => update("clientName", event.target.value)}
            placeholder="Ex.: Cliente Exemplo"
            aria-invalid={Boolean(errors.clientName)}
            aria-describedby="appointment-clientName-error"
          />
          {fieldError("clientName")}
        </div>
        <div className="space-y-2">
          <label
            htmlFor="appointment-clientPhone"
            className="text-sm font-medium"
          >
            Telefone (opcional)
          </label>
          <Input
            id="appointment-clientPhone"
            name="clientPhone"
            type="tel"
            maxLength={25}
            value={values.clientPhone ?? ""}
            readOnly={Boolean(values.clientId)}
            onChange={(event) => update("clientPhone", event.target.value)}
            placeholder="(11) 90000-0000"
            aria-invalid={Boolean(errors.clientPhone)}
            aria-describedby="appointment-clientPhone-error"
          />
          {fieldError("clientPhone")}
        </div>
        <div className="space-y-2">
          <label
            htmlFor="appointment-serviceId"
            className="text-sm font-medium"
          >
            Serviço
          </label>
          <select
            id="appointment-serviceId"
            name="serviceId"
            required
            value={values.serviceId}
            onChange={(event) => update("serviceId", event.target.value)}
            aria-invalid={Boolean(errors.serviceId)}
            aria-describedby="appointment-serviceId-error"
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Selecione um serviço</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} · {service.durationMinutes} min
              </option>
            ))}
          </select>
          {fieldError("serviceId")}
          {!services.length && (
            <p className="text-muted-foreground text-sm">
              Cadastre ou ative um serviço antes de criar atendimentos.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label
            htmlFor="appointment-professionalId"
            className="text-sm font-medium"
          >
            Profissional
          </label>
          <select
            id="appointment-professionalId"
            name="professionalId"
            required
            disabled={!professionals.length}
            value={values.professionalId}
            onChange={(event) => update("professionalId", event.target.value)}
            aria-invalid={Boolean(errors.professionalId)}
            aria-describedby="appointment-professionalId-error"
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm disabled:opacity-50"
          >
            <option value="">Selecione um profissional</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
          {fieldError("professionalId")}
          {values.serviceId && !professionals.length && (
            <p className="text-muted-foreground text-sm">
              Nenhum profissional ativo está associado a este serviço.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              { key: "localDate", label: "Data", type: "date" },
              { key: "localTime", label: "Início", type: "time" },
            ] as const
          ).map(({ key, label, type }) => (
            <div key={key} className="space-y-2">
              <label
                htmlFor={`appointment-${key}`}
                className="text-sm font-medium"
              >
                {label}
              </label>
              <Input
                id={`appointment-${key}`}
                name={key}
                required
                type={type}
                value={values[key]}
                onChange={(event) => update(key, event.target.value)}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={`appointment-${key}-error`}
              />
              {fieldError(key)}
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Fuso de São Paulo. O término é calculado pela duração do serviço.
          Funcionamento, expediente, pausas, bloqueios e conflitos são
          verificados ao criar.
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      <div className="border-border bg-background sticky bottom-0 mt-auto space-y-3 border-t p-6">
        <p className="text-muted-foreground text-xs">
          Atendimento temporário. Recarregar apaga os dados.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Criando…" : "Criar atendimento demo"}
          </Button>
        </div>
      </div>
    </form>
  );
}
