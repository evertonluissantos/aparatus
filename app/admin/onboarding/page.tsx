"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Building2, CheckCircle2 } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import { useDemoBarbershop } from "../_components/demo-context";
import { CoverInput } from "../_components/cover-input";
import { PublicationControls } from "../_components/publication-controls";
import {
  barbershopSchema,
  type BarbershopInput,
  type DemoBarbershop,
} from "../_lib/demo-barbershop";

const initial: BarbershopInput = {
  name: "",
  phone: "",
  address: "",
  description: "",
  imageUrl: "/banner.png",
};
export default function OnboardingPage() {
  const router = useRouter();
  const { addShop, selectedShop, shops, persistent } = useDemoBarbershop();
  const [registrationError, setRegistrationError] = useState("");
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<
    Partial<Record<keyof BarbershopInput, string[]>>
  >({});
  const [created, setCreated] = useState<DemoBarbershop | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (coverBusy) return;
    const result = barbershopSchema.safeParse(values);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      setErrors(fields);
      form.current
        ?.querySelector<HTMLElement>(`[name="${Object.keys(fields)[0]}"]`)
        ?.focus();
      return;
    }
    try {
      setCreated(await addShop(values));
      if (persistent) router.refresh();
    } catch (error) {
      setRegistrationError(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar a barbearia demonstrativa.",
      );
    }
  }
  if (created)
    return (
      <section
        aria-labelledby="confirmation-title"
        className="border-border bg-card mx-auto max-w-2xl rounded-2xl border p-7 sm:p-10"
      >
        <CheckCircle2
          className="mb-6 size-12 text-emerald-600"
          aria-hidden="true"
        />
        <p className="text-muted-foreground mb-2 text-sm">
          {persistent
            ? "Barbearia cadastrada"
            : "Etapa 2 de 2 · Confirmação demonstrativa"}
        </p>
        <h1
          id="confirmation-title"
          className="text-2xl font-semibold tracking-tight"
        >
          {persistent
            ? "Cadastro recebido. Aguarde a aprovação."
            : "Sua barbearia de exemplo está pronta!"}
        </h1>
        <p className="text-muted-foreground mt-3">
          Confira os dados antes de explorar o painel.
        </p>
        <dl className="border-border my-7 space-y-4 rounded-xl border p-5">
          {[
            ["Nome", created.name],
            ["Telefone", created.phone],
            ["Endereço", created.address],
            ["Descrição", created.description],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="mt-1 text-sm wrap-break-word">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mb-6 text-sm">
          {persistent
            ? "O Studio Notreve precisa aprovar seu cadastro antes de liberar os recursos operacionais. Nenhum pagamento foi criado."
            : "Criamos apenas um contexto temporário no navegador, com serviços fictícios de exemplo. Nenhuma conta, membership ou mensalidade foi criada."}
        </p>
        {!persistent && <PublicationControls shopId={created.id} />}
        <Button asChild>
          <Link prefetch={false} href="/painel">
            {persistent ? "Consultar aprovação" : "Explorar painel"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </section>
    );
  if (shops.length)
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">
          Sua barbearia já está cadastrada
        </h1>
        <p>
          Esta experiência permite no máximo uma barbearia por proprietário. Os
          dados existentes foram preservados.
        </p>
        <Button asChild>
          <Link href="/painel" prefetch={false}>
            Voltar ao painel
          </Link>
        </Button>
      </section>
    );
  const fields = [
    {
      key: "name",
      label: "Nome da barbearia",
      placeholder: "Ex.: Barbearia Exemplo",
      max: 80,
      type: "text",
    },
    {
      key: "phone",
      label: "Telefone com DDD",
      placeholder: "(11) 90000-0000",
      max: 25,
      type: "tel",
    },
    {
      key: "address",
      label: "Endereço",
      placeholder: "Rua de Exemplo, 100 · Bairro · Cidade/UF",
      max: 200,
      type: "text",
    },
    {
      key: "description",
      label: "Descrição",
      placeholder: "Conte como seria a experiência na sua barbearia fictícia.",
      max: 500,
      type: "textarea",
    },
  ] as const;
  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-7">
        <Building2 className="mb-5 size-8" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          Etapa 1 de 2 · Dados básicos
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Vamos conhecer sua barbearia?
        </h1>
        <p className="text-muted-foreground mt-3">
          {persistent
            ? "Preencha os dados da sua barbearia para começar."
            : "Preencha os dados fictícios para experimentar a gestão do Cortz."}
        </p>
      </div>
      <form
        ref={form}
        noValidate
        onSubmit={submit}
        className="border-border bg-card space-y-6 rounded-2xl border p-5 sm:p-8"
      >
        {registrationError && (
          <p role="alert" className="text-destructive text-sm">
            {registrationError}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Todos os campos são obrigatórios. Use apenas informações de exemplo.
        </p>
        <CoverInput
          value={values.imageUrl ?? "/banner.png"}
          onChange={(imageUrl) =>
            setValues((current) => ({ ...current, imageUrl }))
          }
          onBusyChange={setCoverBusy}
        />
        {fields.map(({ key, label, placeholder, max, type }) => {
          const props = {
            id: `shop-${key}`,
            name: key,
            required: true,
            maxLength: max,
            value: values[key],
            placeholder,
            onChange: (
              event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => {
              setValues((current) => ({
                ...current,
                [key]: event.target.value,
              }));
              setErrors((current) => ({ ...current, [key]: undefined }));
            },
            "aria-invalid": Boolean(errors[key]),
            "aria-describedby": errors[key] ? `shop-${key}-error` : undefined,
          };
          return (
            <div key={key} className="space-y-2">
              <label htmlFor={props.id} className="text-sm font-medium">
                {label}
              </label>
              {type === "textarea" ? (
                <textarea
                  {...props}
                  rows={4}
                  className="border-input aria-invalid:border-destructive focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2"
                />
              ) : (
                <Input {...props} type={type} autoComplete="off" />
              )}
              {errors[key] && (
                <p
                  id={`shop-${key}-error`}
                  className="text-destructive text-sm"
                >
                  {errors[key]?.[0]}
                </p>
              )}
            </div>
          );
        })}
        <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          {selectedShop ? (
            <Button asChild variant="ghost">
              <Link prefetch={false} href="/painel">
                Voltar ao painel
              </Link>
            </Button>
          ) : (
            <p className="text-muted-foreground text-xs">
              Sem criar conta ou contratar plano.
            </p>
          )}
          <Button type="submit" disabled={coverBusy}>
            {coverBusy ? "Preparando capa…" : "Criar barbearia demo"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </section>
  );
}
