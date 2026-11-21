"use client";
import { useState } from "react";
import { mvpRequest } from "../admin/_components/persistent-context";
import { Button } from "../_components/ui/button";
import { Input } from "../_components/ui/input";
export function PixPanel({
  shops,
}: {
  shops: { id: string; name: string; paidUntil: string | null }[];
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">Mensalidades · Pix manual</h1>
      <p>
        Registre somente pagamentos recebidos e conferidos pelo Studio Notreve.
        Nenhuma cobrança ou transferência é realizada pelo Cortz.
      </p>
      <form
        className="max-w-lg space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const data = new FormData(form);
          const amount = String(data.get("amount"));
          if (!/^\d{1,6}([,.]\d{1,2})?$/.test(amount)) {
            setMessage("Informe um valor válido.");
            return;
          }
          setBusy(true);
          setMessage("");
          try {
            await mvpRequest("/api/global/pix", {
              barbershopId: data.get("shop"),
              competence: data.get("month"),
              amountInCents: Math.round(Number(amount.replace(",", ".")) * 100),
            });
            setMessage(
              "Pagamento confirmado. Atualize a página para consultar a cobertura.",
            );
          } catch {
            setMessage(
              "Não foi possível confirmar. Confira a competência, o valor e sua permissão.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          Barbearia
          <select
            name="shop"
            required
            className="bg-background block w-full rounded-md border p-2"
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Competência
          <Input name="month" type="month" required />
        </label>
        <label className="block">
          Valor recebido (R$)
          <Input name="amount" inputMode="decimal" required />
        </label>
        <Button disabled={busy || !shops.length}>Confirmar Pix recebido</Button>
      </form>
      <p role="status">{message}</p>
      <ul className="space-y-3">
        {shops.map((s) => (
          <li key={s.id} className="rounded-lg border p-3">
            <strong>{s.name}</strong>
            <p>
              {s.paidUntil
                ? `Cobertura registrada até ${new Date(s.paidUntil).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
                : "Sem confirmação Pix registrada"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
