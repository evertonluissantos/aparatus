"use client";

import Link from "next/link";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Avatar } from "./ui/avatar";
import { AvatarImage } from "@radix-ui/react-avatar";
import type { DemoAppointment } from "../admin/agenda/_lib/appointment";
import type { DemoBarbershop } from "../admin/_lib/demo-barbershop";

// Compact JSX/classes recovered from the original BookingItem. No legacy action,
// cancellation, refund or auth import is used to display a local receipt.
export function DemoConfirmedBooking({
  shop,
  appointment,
}: {
  shop: DemoBarbershop;
  appointment: DemoAppointment;
}) {
  const date = new Date(appointment.startsAt);
  const options = { timeZone: appointment.timeZoneSnapshot };
  return (
    <Link
      href={`/demo/barbearias/${shop.id}`}
      prefetch={false}
      className="block"
      aria-label={`Agendamento demonstrativo: ${appointment.serviceName}, ${shop.name}`}
    >
      <Card className="flex h-full w-full min-w-full cursor-pointer flex-row items-center justify-between p-0">
        <div className="flex flex-1 flex-col gap-4 p-4">
          <Badge className="bg-primary/10 text-primary uppercase">
            Confirmado
          </Badge>
          <div className="flex flex-col gap-2">
            <p className="font-bold">{appointment.serviceName}</p>
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={shop.imageUrl} />
              </Avatar>
              <p className="text-sm">{shop.name}</p>
            </div>
          </div>
        </div>
        <div className="flex h-full w-[106px] flex-col items-center justify-center border-l py-3">
          <p className="text-xs capitalize">
            {date.toLocaleDateString("pt-BR", { ...options, month: "long" })}
          </p>
          <p className="text-2xl">
            {date.toLocaleDateString("pt-BR", { ...options, day: "2-digit" })}
          </p>
          <p className="text-xs">
            {date.toLocaleTimeString("pt-BR", {
              ...options,
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </Card>
    </Link>
  );
}
