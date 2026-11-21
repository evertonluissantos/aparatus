"use client";
import { useRef, useState, useContext, type ReactNode } from "react";
import { DemoContext, type DemoContextValue } from "./demo-context";
import type { DemoBarbershop } from "../_lib/demo-barbershop";

export async function mvpRequest<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : method,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok)
    throw new Error(
      "Não foi possível salvar. Atualize a página, confira os dados e tente novamente.",
    );
  return response.json();
}
export function PersistentProvider({
  children,
  initialShop,
  initialRevision,
  publicShops = [],
  publicMode = false,
}: {
  children: ReactNode;
  initialShop?: DemoBarbershop | null;
  initialRevision?: string;
  publicShops?: DemoBarbershop[];
  publicMode?: boolean;
}) {
  const [shops, setShops] = useState(initialShop ? [initialShop] : publicShops);
  const latest = useRef(shops);
  const busy = useRef(false);
  const revision = useRef(initialRevision);
  const parent = useContext(DemoContext);
  const confirmation = parent?.lastConfirmation;
  const bookingShops = confirmation
    ? [
        ...shops.filter((s) => s.id !== confirmation.shop.id),
        { ...confirmation.shop, appointments: [confirmation.appointment] },
      ]
    : shops;
  async function save(op: string, data?: unknown, id?: string) {
    if (publicMode || busy.current)
      throw new Error("Aguarde a operação atual.");
    busy.current = true;
    try {
      const result = await mvpRequest<{
        shop: DemoBarbershop;
        revision: string;
      }>("/api/owner", { op, data, id, revision: revision.current });
      revision.current = result.revision;
      latest.current = [result.shop];
      setShops(latest.current);
      return result.shop;
    } finally {
      busy.current = false;
    }
  }
  async function booking(path: string, body: unknown, method = "POST") {
    const result = await mvpRequest<{ shop: DemoBarbershop; revision: string }>(
      path,
      body,
      method,
    );
    revision.current = result.revision;
    latest.current = [result.shop];
    setShops(latest.current);
  }
  const value: DemoContextValue = {
    persistent: true,
    lastConfirmation: confirmation,
    rememberConfirmation: parent?.rememberConfirmation,
    saveSettings: async (input) => {
      await save("settings", input);
    },
    shops,
    selectedShop: shops[0],
    publicBookingShops: publicMode ? bookingShops : shops,
    publicAppointmentIds: confirmation ? [confirmation.appointment.id] : [],
    addShop: (input) => save("create", input),
    publishShop: async (_id, published) => {
      await save("publication", published);
    },
    updateServices: async (id, update) => {
      const shop = latest.current.find((s) => s.id === id);
      if (!shop) throw new Error("NOT_FOUND");
      await save("services", update(shop.services));
    },
    saveProfessional: async (_shop, id, input) => {
      await save("professional", input, id);
    },
    setProfessionalActive: async (_shop, id, active) => {
      await save("professionalStatus", active, id);
    },
    saveWeek: async (_id, professionalId, week) => {
      await save("week", { professionalId, week });
    },
    addBlock: async (_id, input) => {
      await save("block", input);
    },
    removeBlock: async (_shop, id) => {
      await save("removeBlock", null, id);
    },
    saveClient: async (_shop, id, input) => {
      await save("client", input, id);
    },
    createAppointment: async (barbershopId, appointment) => {
      await booking("/api/owner/bookings", {
        barbershopId,
        appointment,
        requestKey: crypto.randomUUID(),
      });
    },
    changeAppointmentStatus: async (barbershopId, id, status) => {
      await booking(
        "/api/owner/bookings",
        { barbershopId, id, status },
        "PATCH",
      );
    },
    createPublicAppointment: async () => {
      throw new Error("Use o fluxo público de confirmação.");
    },
  };
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
