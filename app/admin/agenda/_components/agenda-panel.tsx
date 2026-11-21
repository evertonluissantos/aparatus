"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/app/_components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/app/_components/ui/alert-dialog";
import { useDemoBarbershop } from "../../_components/demo-context";
import type { DemoBarbershop } from "../../_lib/demo-barbershop";
import { DEMO_TIME_ZONE } from "../../horarios/_lib/schedule";
import { localDateAt } from "../../../../lib/bookings/timezone";
import {
  AgendaError,
  appointmentLabels,
  agendaTime,
  dailyDemoAppointments,
  shiftAgendaDate,
  type AppointmentInput,
  type DemoAppointment,
} from "../_lib/appointment";
import { AppointmentForm } from "./appointment-form";

export function AgendaPanel({ initialDate }: { initialDate?: string }) {
  const { selectedShop } = useDemoBarbershop();
  return selectedShop ? (
    <DailyAgenda
      key={`${selectedShop.id}:${initialDate ?? "today"}`}
      shop={selectedShop}
      initialDate={initialDate}
    />
  ) : null;
}
function DailyAgenda({
  shop,
  initialDate,
}: {
  shop: DemoBarbershop;
  initialDate?: string;
}) {
  const { createAppointment, changeAppointmentStatus } = useDemoBarbershop();
  const [date, setDate] = useState(() => {
    if (initialDate) {
      try {
        return shiftAgendaDate(initialDate, 0);
      } catch {
        /* Invalid query dates fall back to today; no booking rules change. */
      }
    }
    return localDateAt(new Date(), DEMO_TIME_ZONE);
  });
  const [professional, setProfessional] = useState("");
  const [editor, setEditor] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  let appointments: DemoAppointment[] = [],
    invalidDate = false;
  try {
    appointments = dailyDemoAppointments(shop, date, professional);
  } catch {
    invalidDate = true;
  }
  const counts = {
    all: appointments.length,
    confirmed: appointments.filter((item) => item.status === "CONFIRMED")
      .length,
    completed: appointments.filter((item) => item.status === "COMPLETED")
      .length,
    cancelled: appointments.filter((item) => item.status === "CANCELLED")
      .length,
  };
  async function save(input: AppointmentInput) {
    await createAppointment(shop.id, input);
    setDate(input.localDate);
    setProfessional(input.professionalId);
    setEditor(false);
    setError("");
    setMessage("Atendimento criado.");
    toast.success("Atendimento criado.");
  }
  async function change(id: string, status: "CANCELLED" | "COMPLETED") {
    try {
      await changeAppointmentStatus(shop.id, id, status);
      const text =
        status === "CANCELLED"
          ? "Atendimento cancelado; deixou de bloquear o horário."
          : "Atendimento marcado como concluído.";
      setMessage(text);
      setError("");
      toast.success(text);
    } catch (failure) {
      const text =
        failure instanceof AgendaError
          ? failure.message
          : "Não foi possível alterar o atendimento.";
      setError(text);
      toast.error(text);
    }
  }
  function navigate(offset: number) {
    try {
      setDate(shiftAgendaDate(date, offset));
      setError("");
      setMessage("");
    } catch {
      setError("Selecione uma data válida para navegar.");
    }
  }
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground mt-2 text-sm wrap-break-word">
            Atendimentos de {shop.name}.
          </p>
        </div>
        <Button onClick={() => setEditor(true)} disabled={invalidDate}>
          <Plus className="size-4" aria-hidden="true" />
          Novo atendimento
        </Button>
      </div>
      <div className="border-border bg-card mb-6 rounded-xl border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="agenda-date"
              className="mb-2 block text-sm font-medium"
            >
              Dia da agenda · São Paulo
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Dia anterior"
                disabled={invalidDate}
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <Input
                id="agenda-date"
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setMessage("");
                  setError("");
                }}
                className="w-40 sm:w-44"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Próximo dia"
                disabled={invalidDate}
                onClick={() => navigate(1)}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setDate(localDateAt(new Date(), DEMO_TIME_ZONE));
              setMessage("");
              setError("");
            }}
          >
            Hoje
          </Button>
          <div className="min-w-0 flex-1 sm:min-w-52">
            <label
              htmlFor="agenda-professional"
              className="mb-2 block text-sm font-medium"
            >
              Profissional
            </label>
            <select
              id="agenda-professional"
              value={professional}
              onChange={(event) => {
                setProfessional(event.target.value);
                setMessage("");
                setError("");
              }}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">Todos os profissionais</option>
              {shop.professionals
                .filter((item) => item.barbershopId === shop.id)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                    {item.active ? "" : " · Inativo"}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          Cancelados e concluídos permanecem no histórico. Conclusão disponível
          apenas após o término previsto.
        </p>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Atendimentos", value: counts.all },
          { label: "Confirmados", value: counts.confirmed },
          { label: "Concluídos", value: counts.completed },
          { label: "Cancelados", value: counts.cancelled },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="border-border bg-card rounded-xl border p-4"
          >
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p role="status" className="text-muted-foreground mb-4 text-sm">
        Resumo do dia e do filtro selecionados. {message}
      </p>
      {error && (
        <p role="alert" className="text-destructive mb-4 text-sm">
          {error}
        </p>
      )}
      {invalidDate ? (
        <p role="alert" className="text-destructive text-sm">
          Selecione uma data válida para visualizar a agenda.
        </p>
      ) : appointments.length ? (
        <ul className="space-y-4">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="border-border bg-card rounded-2xl border p-5 sm:flex sm:items-start sm:gap-6"
            >
              <div className="mb-4 shrink-0 sm:mb-0 sm:w-28">
                <p className="text-xl font-semibold tabular-nums">
                  {agendaTime(appointment.startsAt)}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  até {agendaTime(appointment.endsAt)}
                </p>
                <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                  <Clock3 className="size-3" aria-hidden="true" />
                  {appointment.durationMinutesSnapshot} min
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-semibold wrap-break-word">
                    {appointment.clientName}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${appointment.status === "CONFIRMED" ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : appointment.status === "COMPLETED" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-secondary text-muted-foreground"}`}
                  >
                    {appointmentLabels[appointment.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm wrap-break-word">
                  {appointment.serviceName}
                </p>
                <p className="text-muted-foreground mt-1 text-sm wrap-break-word">
                  Profissional: {appointment.professionalName}
                </p>
                {appointment.status !== "CONFIRMED" && (
                  <p className="text-muted-foreground mt-3 text-xs">
                    Mantido no histórico.
                  </p>
                )}
                {appointment.status === "CONFIRMED" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={new Date(appointment.endsAt).getTime() > clock}
                      title={
                        new Date(appointment.endsAt).getTime() > clock
                          ? "Aguarde o término previsto para concluir."
                          : "Registrar conclusão"
                      }
                      onClick={() => change(appointment.id, "COMPLETED")}
                      aria-label={`Concluir atendimento de ${appointment.clientName}`}
                    >
                      Concluir
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Cancelar atendimento de ${appointment.clientName}`}
                        >
                          Cancelar atendimento
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Cancelar este atendimento demo?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            O atendimento de {appointment.clientName} será
                            mantido como cancelado e deixará de bloquear o
                            horário. Não haverá cobrança ou reembolso.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Voltar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => change(appointment.id, "CANCELLED")}
                          >
                            Confirmar cancelamento
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border bg-card rounded-2xl border px-6 py-12 text-center">
          <CalendarDays
            className="text-muted-foreground mx-auto mb-4 size-9"
            aria-hidden="true"
          />
          <h2 className="font-semibold">Nenhum atendimento nesta seleção</h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg text-sm">
            Confira o dia e o profissional ou adicione um atendimento. Antes,
            configure serviços, profissionais e expedientes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => setEditor(true)}>
              Criar atendimento demo
            </Button>
            <Button asChild variant="ghost">
              <Link prefetch={false} href="/painel/horarios">
                Configurar horários
              </Link>
            </Button>
          </div>
        </div>
      )}
      <Sheet open={editor} onOpenChange={setEditor}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
          <SheetHeader className="p-6 pr-12">
            <SheetTitle>Novo atendimento demo</SheetTitle>
            <SheetDescription>
              Sem persistência, checkout ou integração com reservas reais.
            </SheetDescription>
          </SheetHeader>
          {editor && (
            <AppointmentForm
              shop={shop}
              date={date}
              professionalId={professional}
              onSave={save}
              onCancel={() => setEditor(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
