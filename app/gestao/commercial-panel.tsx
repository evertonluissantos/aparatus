"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../_components/ui/input";
import { Button } from "../_components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "../_components/ui/alert-dialog";
import { mvpRequest } from "../admin/_components/persistent-context";
import { Heading, Status, DataTable, Empty, cell } from "./ui";
type Shop = {
  id: string;
  name: string;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  published: boolean;
  suspended: boolean;
};
type Trial = {
  id: string;
  barbershopId: string;
  shopName: string;
  startsAt: string;
  endsAt: string;
  adminName: string;
  updatedByName: string;
  state: string;
};
const approval = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Rejeitada",
};
const trialLabels: Record<string, string> = {
  ACTIVE: "Teste ativo",
  EXPIRED: "Teste expirado",
  SCHEDULED: "Teste agendado",
};
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
function inputDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function CommercialPanel({
  shops,
  trials,
}: {
  shops: Shop[];
  trials: Trial[];
}) {
  const router = useRouter();
  useEffect(() => {
    if (!trials.some((t) => t.state !== "EXPIRED")) return;
    const timer = window.setInterval(() => router.refresh(), 60000);
    return () => window.clearInterval(timer);
  }, [trials, router]);
  const [filter, setFilter] = useState("PENDING"),
    [trialFilter, setTrialFilter] = useState("all"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{
    shop: Shop;
    action: "APPROVE" | "REJECT" | "TRIAL";
    trial?: Trial;
  } | null>(null);
  const [duration, setDuration] = useState("none");
  const rows = shops.filter(
    (s) => filter === "all" || s.approvalStatus === filter,
  );
  function open(
    shop: Shop,
    action: "APPROVE" | "REJECT" | "TRIAL",
    trial?: Trial,
  ) {
    setDuration(action === "TRIAL" ? (trial ? "custom" : "7") : "none");
    setSelected({ shop, action, trial });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    const f = new FormData(event.currentTarget);
    let trial;
    try {
      if (duration !== "none") {
        const start = String(f.get("start") ?? "");
        const end = String(f.get("end") ?? "");
        trial = {
          ...(selected.trial ? { id: selected.trial.id } : {}),
          ...(start &&
          (!selected.trial || start !== inputDate(selected.trial.startsAt))
            ? { startsAt: new Date(start).toISOString() }
            : {}),
          ...(duration === "custom"
            ? {
                endsAt:
                  selected.trial && end === inputDate(selected.trial.endsAt)
                    ? selected.trial.endsAt
                    : new Date(end).toISOString(),
              }
            : { days: Number(duration) }),
        };
      }
    } catch {
      setMessage("Informe datas válidas para o teste.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await mvpRequest("/api/global/commercial", {
        barbershopId: selected.shop.id,
        action: selected.action,
        ...(trial ? { trial } : {}),
      });
      setSelected(null);
      setMessage("Decisão registrada com auditoria. Atualizando a listagem...");
      router.refresh();
    } catch {
      setMessage(
        "Não foi possível concluir. Confira as datas, sua permissão e o estabelecimento selecionado.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visibleTrials = trials.filter(
    (t) => trialFilter === "all" || t.state === trialFilter,
  );
  return (
    <div className="space-y-7">
      <Heading
        title="Aprovações e testes"
        description="Aprove sem pagamento ou conceda um teste gratuito. Aprovação, suspensão, publicação e Pix são independentes. O vencimento não suspende automaticamente."
      />
      {message && (
        <p role="status" className="rounded-xl border p-4 text-sm">
          {message}
        </p>
      )}
      <select
        aria-label="Filtrar aprovação"
        className="bg-background rounded-lg border p-2 text-sm"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">Todas as aprovações</option>
        <option value="PENDING">Pendentes</option>
        <option value="APPROVED">Aprovadas</option>
        <option value="REJECTED">Rejeitadas</option>
      </select>
      {!rows.length ? (
        <Empty>Nenhuma solicitação nesta situação.</Empty>
      ) : (
        <DataTable
          headers={[
            "Barbearia",
            "Aprovação",
            "Operação / publicação",
            "Último teste",
            "Ações",
          ]}
        >
          {rows.map((s) => {
            const last = trials.find((t) => t.barbershopId === s.id);
            return (
              <tr key={s.id}>
                <td className={`${cell} font-medium`}>{s.name}</td>
                <td className={cell}>
                  <Status strong={s.approvalStatus === "APPROVED"}>
                    {approval[s.approvalStatus]}
                  </Status>
                </td>
                <td className={cell}>
                  <p>{s.suspended ? "Suspensa" : "Não suspensa"}</p>
                  <p className="text-muted-foreground text-xs">
                    {s.published ? "Publicada" : "Não publicada"}
                  </p>
                </td>
                <td className={cell}>
                  {last ? trialLabels[last.state] : "Sem período gratuito"}
                </td>
                <td className={cell}>
                  <div className="flex flex-wrap gap-2">
                    {s.approvalStatus !== "APPROVED" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => open(s, "APPROVE")}
                      >
                        Aprovar
                      </Button>
                    )}
                    {s.approvalStatus !== "REJECTED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => open(s, "REJECT")}
                      >
                        Rejeitar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => open(s, "TRIAL")}
                    >
                      Conceder teste
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <section className="space-y-4">
        <h2 className="font-semibold">Períodos gratuitos</h2>
        <select
          aria-label="Filtrar períodos gratuitos"
          className="bg-background rounded-lg border p-2 text-sm"
          value={trialFilter}
          onChange={(e) => setTrialFilter(e.target.value)}
        >
          <option value="all">Todos os períodos</option>
          <option value="ACTIVE">Ativos</option>
          <option value="EXPIRED">Expirados</option>
          <option value="SCHEDULED">Agendados</option>
        </select>
        {!visibleTrials.length ? (
          <Empty>Nenhum período gratuito nesta situação.</Empty>
        ) : (
          <DataTable
            headers={[
              "Barbearia",
              "Início / término (São Paulo)",
              "Situação",
              "Responsável",
              "Prazo",
            ]}
          >
            {visibleTrials.map((t) => (
              <tr key={t.id}>
                <td className={cell}>{t.shopName}</td>
                <td className={cell}>
                  <p>{date(t.startsAt)}</p>
                  <p>{date(t.endsAt)}</p>
                </td>
                <td className={cell}>
                  <Status strong={t.state === "ACTIVE"}>
                    {trialLabels[t.state]}
                  </Status>
                </td>
                <td className={cell}>
                  <p>{t.adminName}</p>
                  <p className="text-muted-foreground text-xs">
                    Última alteração: {t.updatedByName}
                  </p>
                </td>
                <td className={cell}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      const s = shops.find((s) => s.id === t.barbershopId);
                      if (s) open(s, "TRIAL", t);
                    }}
                  >
                    Alterar prazo
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
      <AlertDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected?.action === "REJECT"
                ? "Rejeitar solicitação"
                : selected?.action === "APPROVE"
                  ? "Aprovar barbearia"
                  : "Configurar teste gratuito"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.shop.name}. Nenhum pagamento será criado. A suspensão
              atual será preservada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {selected?.action !== "REJECT" && (
              <>
                <label className="block text-sm">
                  Período gratuito
                  <select
                    className="bg-background mt-1 block w-full rounded-md border p-2"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  >
                    {selected?.action === "APPROVE" && (
                      <option value="none">
                        Aprovar sem teste e sem pagamento
                      </option>
                    )}
                    <option value="3">3 dias</option>
                    <option value="7">7 dias</option>
                    <option value="15">15 dias</option>
                    <option value="custom">Prazo personalizado</option>
                  </select>
                </label>
                {duration !== "none" && (
                  <>
                    <label className="block text-sm">
                      Início (horário local do seu dispositivo)
                      <Input
                        name="start"
                        type="datetime-local"
                        defaultValue={
                          selected?.trial
                            ? inputDate(selected.trial.startsAt)
                            : ""
                        }
                      />
                      <span className="text-muted-foreground text-xs">
                        {selected?.trial
                          ? "Em branco ou sem alteração: mantém o início original."
                          : "Em branco: começa no momento da concessão."}
                      </span>
                    </label>
                    {duration === "custom" && (
                      <label className="block text-sm">
                        Término (horário local)
                        <Input
                          name="end"
                          type="datetime-local"
                          required
                          defaultValue={
                            selected?.trial
                              ? inputDate(selected.trial.endsAt)
                              : ""
                          }
                        />
                      </label>
                    )}
                  </>
                )}
              </>
            )}
            {selected?.action === "REJECT" && (
              <p className="text-sm">
                O proprietário verá que o cadastro não foi aprovado. Seus dados
                não serão excluídos.
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
              <Button type="submit" disabled={busy}>
                {busy ? "Registrando..." : "Confirmar decisão"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
