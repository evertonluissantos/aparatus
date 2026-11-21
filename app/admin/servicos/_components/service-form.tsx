"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import {
  parseService,
  type DemoService,
  type ServiceFormValues,
  type ServiceValues,
} from "../_lib/service";

interface Props {
  service?: DemoService;
  onSave: (values: ServiceValues) => void | Promise<void>;
  onCancel: () => void;
}

export function ServiceForm({ service, onSave, onCancel }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<ServiceFormValues>({
    name: service?.name ?? "",
    description: service?.description ?? "",
    price: service
      ? (service.priceInCents / 100).toFixed(2).replace(".", ",")
      : "",
    duration: service ? String(service.durationMinutes) : "",
    active: service?.active ?? true,
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof ServiceFormValues, string[]>>
  >({});
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = parseService(values);
    if (!result.success) {
      setErrors(result.errors);
      const field = Object.keys(result.errors)[0];
      if (field)
        form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
      return;
    }
    try {
      await onSave(result.service);
    } catch {
      setErrors({
        name: ["Não foi possível salvar. Confira os dados e tente novamente."],
      });
    }
  }
  function update<Key extends keyof ServiceFormValues>(
    key: Key,
    value: ServiceFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }
  const error = (field: keyof ServiceFormValues) =>
    errors[field]?.[0] && (
      <p id={`service-${field}-error`} className="text-destructive text-sm">
        {errors[field]?.[0]}
      </p>
    );

  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      className="flex flex-1 flex-col"
    >
      <div className="space-y-6 p-6">
        <p className="text-muted-foreground text-sm">
          Todos os campos de texto e valor são obrigatórios.
        </p>
        <div className="space-y-2">
          <label htmlFor="service-name" className="text-sm font-medium">
            Nome do serviço
          </label>
          <Input
            id="service-name"
            name="name"
            required
            maxLength={80}
            autoFocus
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Ex.: Corte clássico"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "service-name-error" : undefined}
          />
          {error("name")}
        </div>
        <div className="space-y-2">
          <label htmlFor="service-description" className="text-sm font-medium">
            Descrição
          </label>
          <textarea
            id="service-description"
            name="description"
            required
            maxLength={300}
            rows={4}
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Conte o que está incluído no atendimento."
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? "service-description-error" : undefined
            }
            className="border-input focus-visible:ring-ring/50 aria-invalid:border-destructive w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2"
          />
          <div className="flex justify-between gap-3 text-sm">
            {error("description")}
            <span className="text-muted-foreground ml-auto">
              {values.description.length}/300
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="service-price" className="text-sm font-medium">
              Preço (R$)
            </label>
            <Input
              id="service-price"
              name="price"
              required
              inputMode="decimal"
              value={values.price}
              onChange={(event) => update("price", event.target.value)}
              placeholder="45,00"
              aria-invalid={Boolean(errors.price)}
              aria-describedby={
                errors.price ? "service-price-error" : undefined
              }
            />
            {error("price")}
          </div>
          <div className="space-y-2">
            <label htmlFor="service-duration" className="text-sm font-medium">
              Duração (min)
            </label>
            <Input
              id="service-duration"
              name="duration"
              required
              inputMode="numeric"
              value={values.duration}
              onChange={(event) => update("duration", event.target.value)}
              placeholder="30"
              aria-invalid={Boolean(errors.duration)}
              aria-describedby={
                errors.duration ? "service-duration-error" : undefined
              }
            />
            {error("duration")}
          </div>
        </div>
        <label className="border-border flex cursor-pointer items-start gap-3 rounded-xl border p-4">
          <input
            name="active"
            type="checkbox"
            checked={values.active}
            onChange={(event) => update("active", event.target.checked)}
            className="accent-primary mt-1 size-4 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium">Serviço ativo</span>
            <span className="text-muted-foreground mt-1 block text-sm">
              Altera apenas o status neste catálogo demonstrativo.
            </span>
          </span>
        </label>
      </div>
      <div className="border-border bg-background sticky bottom-0 mt-auto space-y-3 border-t p-6">
        <p className="text-muted-foreground text-xs">
          Alterações temporárias. Recarregar a página apaga o contexto
          demonstrativo.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">
            {service ? "Aplicar alterações" : "Adicionar serviço"}
          </Button>
        </div>
      </div>
    </form>
  );
}
