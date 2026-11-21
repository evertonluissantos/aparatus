"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heading, DataTable, Empty, cell, money, monthLabel } from "./ui";
import { mvpRequest } from "../admin/_components/persistent-context";
import { Button } from "../_components/ui/button";
import { Input } from "../_components/ui/input";
export function PixPanel({
  shops,
  history,
}: {
  shops: { id: string; name: string; paidUntil: string | null }[];
  history: {
    id: string;
    shopName: string;
    competence: string;
    amountInCents: number;
    confirmedAt: string;
    adminName: string;
  }[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-5">
      <Heading
        title="Pagamentos Pix"
        description="Registre mensalidades recebidas e conferidas pelo Studio Notreve. O Cortz não realiza cobranças ou transferências."
      />
      <div className="bg-background max-w-xl rounded-xl border p-5 sm:p-6">
        <h2 className="mb-5 font-semibold">Confirmar recebimento</h2>
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
                amountInCents: Math.round(
                  Number(amount.replace(",", ".")) * 100,
                ),
              });
              setMessage(
                "Pagamento confirmado. Atualize a página para consultar a cobertura.",
              );
              router.refresh();
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
          <Button disabled={busy || !shops.length}>
            Confirmar Pix recebido
          </Button>
        </form>
      </div>
      <p role="status">{message}</p>
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold">Histórico de confirmações</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Registros de recebimento manual, sem pagamentos dos serviços das
            barbearias.
          </p>
        </div>
        {!history.length ? (
          <Empty>Nenhum pagamento Pix confirmado até o momento.</Empty>
        ) : (
          <DataTable
            headers={[
              "Barbearia",
              "Competência",
              "Valor recebido",
              "Confirmado em",
              "Administrador",
            ]}
          >
            {history.map((p) => (
              <tr key={p.id} className="hover:bg-muted/20">
                <td className={`${cell} font-medium`}>{p.shopName}</td>
                <td className={cell}>{monthLabel(p.competence)}</td>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>
                  {money(p.amountInCents)}
                </td>
                <td className={cell}>
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Sao_Paulo",
                  }).format(new Date(p.confirmedAt))}
                </td>
                <td className={cell}>{p.adminName}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </section>
  );
}
