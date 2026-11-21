"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { CoverInput } from "../../_components/cover-input";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import {
  parseProfessional,
  type DemoProfessional,
  type ProfessionalInput,
} from "../_lib/professional";

export function ProfessionalForm({
  shop,
  professional,
  onSave,
  onCancel,
}: {
  shop: DemoBarbershop;
  professional?: DemoProfessional;
  onSave: (input: ProfessionalInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ProfessionalInput>({
    name: professional?.name ?? "",
    phone: professional?.phone ?? "",
    description: professional?.description ?? "",
    photoUrl: professional?.photoUrl ?? "",
    active: professional?.active ?? true,
    serviceIds: [...(professional?.serviceIds ?? [])],
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof ProfessionalInput, string[]>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  function update<Key extends keyof ProfessionalInput>(
    key: Key,
    value: ProfessionalInput[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = parseProfessional(values, shop, professional);
    if (!result.success) {
      setErrors(result.errors);
      form.current
        ?.querySelector<HTMLElement>(
          `[name="${Object.keys(result.errors)[0]}"]`,
        )
        ?.focus();
      return;
    }
    try {
      await onSave(values);
    } catch {
      setSubmitError(
        "Não foi possível aplicar as alterações. Confira os serviços e tente novamente.",
      );
    }
  }
  const choices = shop.services.filter(
    (service) =>
      service.barbershopId === shop.id &&
      (service.active || professional?.serviceIds.includes(service.id)),
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
          Dados de {shop.name}. Nome e descrição são obrigatórios.
        </p>
        <CoverInput
          label="Foto do profissional (opcional)"
          inputId="professional-photo"
          optional
          value={values.photoUrl}
          onChange={(value) => update("photoUrl", value)}
          onBusyChange={setBusy}
        />
        {errors.photoUrl && (
          <p className="text-destructive text-sm" role="alert">
            {errors.photoUrl[0]}
          </p>
        )}
        {(
          [
            {
              key: "name",
              label: "Nome",
              placeholder: "Ex.: Alex Exemplo",
              max: 80,
            },
            {
              key: "phone",
              label: "Telefone com DDD (opcional)",
              placeholder: "(11) 90000-0000",
              max: 25,
            },
            {
              key: "description",
              label: "Descrição",
              placeholder: "Conte as especialidades deste profissional.",
              max: 300,
            },
          ] as const
        ).map(({ key, label, placeholder, max }) => {
          const props = {
            id: `professional-${key}`,
            name: key,
            value: values[key],
            placeholder,
            maxLength: max,
            required: key !== "phone",
            "aria-invalid": Boolean(errors[key]),
            "aria-describedby": errors[key]
              ? `professional-${key}-error`
              : undefined,
            onChange: (
              event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => update(key, event.target.value),
          };
          return (
            <div key={key} className="space-y-2">
              <label htmlFor={props.id} className="text-sm font-medium">
                {label}
              </label>
              {key === "description" ? (
                <textarea
                  {...props}
                  rows={3}
                  className="border-input aria-invalid:border-destructive focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2"
                />
              ) : (
                <Input
                  {...props}
                  autoFocus={key === "name"}
                  type={key === "phone" ? "tel" : "text"}
                />
              )}
              {errors[key] && (
                <p
                  id={`professional-${key}-error`}
                  className="text-destructive text-sm"
                >
                  {errors[key]?.[0]}
                </p>
              )}
            </div>
          );
        })}
        <fieldset
          name="serviceIds"
          tabIndex={-1}
          aria-describedby="professional-services-help professional-services-error"
          className="border-border space-y-3 rounded-xl border p-4"
        >
          <legend className="px-1 text-sm font-medium">
            Serviços que realiza
          </legend>
          <p
            id="professional-services-help"
            className="text-muted-foreground text-xs"
          >
            Selecione os serviços ativos desta barbearia. Sem associações, o
            profissional não será elegível para novos atendimentos.
          </p>
          {choices.length ? (
            choices.map((service) => (
              <label
                key={service.id}
                className="flex items-start gap-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-primary mt-1 size-4 shrink-0"
                  checked={values.serviceIds.includes(service.id)}
                  disabled={
                    !service.active && !values.serviceIds.includes(service.id)
                  }
                  onChange={(event) =>
                    update(
                      "serviceIds",
                      event.target.checked
                        ? [...values.serviceIds, service.id]
                        : values.serviceIds.filter((id) => id !== service.id),
                    )
                  }
                />
                <span className="wrap-break-word">
                  {service.name}
                  {!service.active && (
                    <span className="text-muted-foreground mt-1 block text-xs">
                      Inativo · vínculo anterior, pode ser removido
                    </span>
                  )}
                </span>
              </label>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum serviço ativo. Você pode cadastrar o profissional agora e
              associar serviços depois.
            </p>
          )}
          <p
            id="professional-services-error"
            className="text-destructive text-sm"
          >
            {errors.serviceIds?.[0]}
          </p>
        </fieldset>
        <label className="border-border flex items-start gap-3 rounded-xl border p-4 text-sm">
          <input
            type="checkbox"
            className="accent-primary mt-1 size-4 shrink-0"
            checked={values.active}
            onChange={(event) => update("active", event.target.checked)}
          />
          <span>
            <span className="font-medium">Profissional ativo</span>
            <span className="text-muted-foreground mt-1 block">
              Inativos mantêm seus dados e vínculos, mas não são elegíveis para
              novos agendamentos.
            </span>
          </span>
        </label>
        {submitError && (
          <p role="alert" className="text-destructive text-sm">
            {submitError}
          </p>
        )}
      </div>
      <div className="border-border bg-background sticky bottom-0 mt-auto space-y-3 border-t p-6">
        <p className="text-muted-foreground text-xs">
          Somente. Configure o expediente individual na seção Horários.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy
              ? "Preparando foto…"
              : professional
                ? "Aplicar alterações"
                : "Adicionar profissional"}
          </Button>
        </div>
      </div>
    </form>
  );
}
