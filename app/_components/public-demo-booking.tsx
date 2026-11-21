"use client";

import { demoServiceImage } from "../_lib/demo-service-images";
import { useState, useRef } from "react";
import Image from "next/image";
import type {
  DemoBarbershop,
  ScopedDemoService,
} from "../admin/_lib/demo-barbershop";
import { CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "./ui/sheet";
import { useDemoBarbershop } from "../admin/_components/demo-context";
import { formatPrice } from "../admin/servicos/_lib/service";
import {
  agendaTime,
  type AppointmentInput,
  type DemoAppointment,
} from "../admin/agenda/_lib/appointment";
import { localDateAt } from "../../lib/bookings/timezone";
import { PublicBookingForm } from "./public-booking-form";
import { mvpRequest } from "../admin/_components/persistent-context";

export function PublicDemoBooking({
  shop,
  service,
}: {
  shop: DemoBarbershop;
  service: ScopedDemoService;
}) {
  const shopId = shop.id;
  const imageUrl = demoServiceImage(service.name, shop.imageUrl);
  const {
    publicBookingShops,
    createPublicAppointment,
    persistent,
    rememberConfirmation,
  } = useDemoBarbershop();
  const requestKey = useRef<string | null>(null);
  const requestInput = useRef("");
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<{
    shopName: string;
    appointment: DemoAppointment;
  } | null>(null);
  const bookingShop = publicBookingShops.find(
    (item) => item.id === shopId && item.published,
  );
  const configured = Boolean(bookingShop);
  const shopName = shop.name;
  async function confirm(input: AppointmentInput) {
    let appointment: DemoAppointment;
    if (persistent) {
      const serialized = JSON.stringify(input);
      if (requestInput.current !== serialized) {
        requestKey.current = null;
        requestInput.current = serialized;
      }
      requestKey.current ??= crypto.randomUUID();
      const result = await mvpRequest<{
        id: string;
        appointment: DemoAppointment;
      }>("/api/public", {
        barbershopId: shopId,
        appointment: input,
        requestKey: requestKey.current,
      });
      appointment = result.appointment;
      rememberConfirmation?.(shop, appointment);
    } else appointment = await createPublicAppointment(shopId, input);
    setReceipt({ shopName, appointment });
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="border-border bg-card flex items-center justify-center gap-3 rounded-2xl border border-solid p-3">
        <div className="relative size-[110px] shrink-0 overflow-hidden rounded-[10px]">
          <Image
            src={imageUrl}
            unoptimized={imageUrl.startsWith("data:")}
            sizes="110px"
            alt={service.name}
            fill
            className="object-cover"
          />
        </div>

        <div className="flex grow basis-0 flex-row items-center self-stretch">
          <div className="relative flex h-full min-h-0 min-w-0 grow basis-0 flex-col items-start justify-between">
            <div className="flex h-[67.5px] w-full flex-col items-start gap-1 text-sm leading-[1.4]">
              <p className="text-card-foreground w-full font-bold">
                {service.name}
              </p>
              <p className="text-muted-foreground w-full font-normal">
                {service.description}
              </p>
            </div>

            <div className="flex w-full items-center justify-between">
              <p className="text-card-foreground text-sm leading-[1.4] font-bold whitespace-pre">
                {formatPrice(service.priceInCents)}
              </p>

              <SheetTrigger asChild>
                <Button
                  className="rounded-full px-4 py-2"
                  onClick={() => {
                    setReceipt(null);
                    requestKey.current = null;
                  }}
                >
                  Reservar
                </Button>
              </SheetTrigger>
            </div>
          </div>
        </div>
      </div>

      <SheetContent className="w-[370px] overflow-y-auto p-0">
        <div className="flex h-full flex-col gap-6">
          <SheetHeader className="px-5 pt-6">
            <SheetTitle className="text-lg font-bold">
              {receipt
                ? persistent
                  ? "Agendamento confirmado"
                  : "Simulação registrada nesta aba"
                : "Fazer Reserva"}
            </SheetTitle>
            <SheetDescription>
              {persistent
                ? "Pagamento do serviço diretamente à barbearia, sem checkout."
                : "Não é uma reserva real. Recarregar ou abrir outra aba descarta o contexto local."}
            </SheetDescription>
          </SheetHeader>
          {!configured && (
            <p className="text-muted-foreground px-5 text-sm">
              Exemplo de catálogo sem agenda configurada. Não há disponibilidade
              demonstrativa para reservar.
            </p>
          )}
          {open &&
            configured &&
            (receipt ? (
              <div className="space-y-6 p-6">
                <CheckCircle2
                  className="size-10 text-emerald-600"
                  aria-hidden="true"
                />
                <p role="status" className="text-sm">
                  {persistent
                    ? "Agendamento registrado na agenda da barbearia. Nenhum pagamento foi criado."
                    : "O atendimento demonstrativo foi adicionado à agenda local da barbearia. Nenhum pagamento foi criado."}
                </p>
                <dl className="border-border space-y-4 rounded-xl border p-4">
                  {[
                    ["Barbearia", receipt.shopName],
                    ["Serviço", receipt.appointment.serviceName],
                    ["Profissional", receipt.appointment.professionalName],
                    [
                      persistent ? "Cliente" : "Cliente fictício",
                      receipt.appointment.clientName,
                    ],
                    [
                      "Data em São Paulo",
                      localDateAt(
                        new Date(receipt.appointment.startsAt),
                        receipt.appointment.timeZoneSnapshot,
                      )
                        .split("-")
                        .reverse()
                        .join("/"),
                    ],
                    [
                      "Horário",
                      `${agendaTime(receipt.appointment.startsAt)}–${agendaTime(receipt.appointment.endsAt)}`,
                    ],
                    [
                      "Duração",
                      `${receipt.appointment.durationMinutesSnapshot} min`,
                    ],
                    [
                      "Preço informativo · sem cobrança",
                      formatPrice(receipt.appointment.priceInCentsSnapshot),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground text-xs">{label}</dt>
                      <dd className="mt-1 text-sm wrap-break-word">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted-foreground text-sm">
                  {persistent
                    ? "Guarde os dados da confirmação. Para alterações, entre em contato com a barbearia."
                    : "Os dados existem somente na memória desta aba. Este resultado não garante atendimento ou vaga real."}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" onClick={() => setOpen(false)}>
                    Fechar
                  </Button>
                </div>
              </div>
            ) : (
              <PublicBookingForm
                shop={bookingShop!}
                initialServiceId={service.id}
                onConfirm={confirm}
                onCancel={() => setOpen(false)}
              />
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
