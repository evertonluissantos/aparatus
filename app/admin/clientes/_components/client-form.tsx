"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import {
  clientSchema,
  ClientError,
  type ClientInput,
  type DemoClient,
} from "../_lib/client";

export function ClientForm({
  client,
  onSave,
  onCancel,
}: {
  client?: DemoClient;
  onSave: (input: ClientInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ClientInput>({
    name: client?.name ?? "",
    phone: client?.phone ?? "",
    notes: client?.notes ?? "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof ClientInput, string[]>>
  >({});
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = clientSchema.safeParse(values);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      setErrors(fields);
      form.current
        ?.querySelector<HTMLElement>(`[name="${Object.keys(fields)[0]}"]`)
        ?.focus();
      return;
    }
    try {
      await onSave(values);
    } catch (failure) {
      setError(
        failure instanceof ClientError
          ? failure.message
          : "Não foi possível aplicar o cadastro.",
      );
    }
  }
  return (
    <form
      ref={form}
      onSubmit={submit}
      noValidate
      className="flex flex-1 flex-col"
    >
      <div className="space-y-6 p-6">
        <p className="text-muted-foreground text-sm">
          Nome é obrigatório; telefone e observações são opcionais.
        </p>
        {(
          [
            {
              key: "name",
              label: "Nome",
              max: 80,
              placeholder: "Ex.: Cliente Exemplo",
            },
            {
              key: "phone",
              label: "Telefone com DDD (opcional)",
              max: 25,
              placeholder: "(11) 90000-0000",
            },
            {
              key: "notes",
              label: "Observações (opcional)",
              max: 500,
              placeholder: "Informações úteis para o atendimento.",
            },
          ] as const
        ).map(({ key, label, max, placeholder }) => {
          const props = {
            id: `client-${key}`,
            name: key,
            value: values[key],
            maxLength: max,
            placeholder,
            required: key === "name",
            "aria-invalid": Boolean(errors[key]),
            "aria-describedby": errors[key] ? `client-${key}-error` : undefined,
            onChange: (
              event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => {
              setValues((current) => ({
                ...current,
                [key]: event.target.value,
              }));
              setErrors((current) => ({ ...current, [key]: undefined }));
              setError("");
            },
          };
          return (
            <div key={key} className="space-y-2">
              <label htmlFor={props.id} className="text-sm font-medium">
                {label}
              </label>
              {key === "notes" ? (
                <textarea
                  {...props}
                  rows={4}
                  className="border-input aria-invalid:border-destructive focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2"
                />
              ) : (
                <Input
                  {...props}
                  type={key === "phone" ? "tel" : "text"}
                  autoFocus={key === "name"}
                />
              )}
              {errors[key] && (
                <p
                  id={`client-${key}-error`}
                  className="text-destructive text-sm"
                >
                  {errors[key]?.[0]}
                </p>
              )}
            </div>
          );
        })}
        <p className="text-muted-foreground text-xs">
          DDD e telefone são normalizados com código 55. Um telefone não pode
          pertencer a dois cadastros desta barbearia. Nomes iguais, por si só,
          não identificam a mesma pessoa.
        </p>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      <div className="border-border bg-background sticky bottom-0 mt-auto space-y-3 border-t p-6">
        <p className="text-muted-foreground text-xs">
          Cadastro temporário. Editar os dados não reescreve os nomes
          registrados nos agendamentos anteriores.
        </p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">
            {client ? "Aplicar alterações" : "Adicionar cliente"}
          </Button>
        </div>
      </div>
    </form>
  );
}
