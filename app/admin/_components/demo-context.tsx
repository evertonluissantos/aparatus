"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  createDemoAppointment,
  changeDemoAppointmentStatus,
  type AppointmentInput,
  type DemoAppointment,
} from "../agenda/_lib/appointment";
import { createPublicDemoAppointment } from "../../_lib/public-demo-booking";
import { createExampleBookingShops } from "../../_lib/example-booking";
import { exampleBarbershops } from "../../_lib/demo-catalog";
import { registerOwnerDemoShop } from "../_lib/owner-demo";
import { saveDemoClient, type ClientInput } from "../clientes/_lib/client";
import {
  updateDemoServices,
  barbershopSchema,
  setDemoPublication,
  type BarbershopInput,
  type DemoBarbershop,
  type ScopedDemoService,
} from "../_lib/demo-barbershop";
import {
  saveDemoProfessional,
  setDemoProfessionalActive,
  type ProfessionalInput,
} from "../profissionais/_lib/professional";
import {
  saveDemoWeek,
  addDemoBlock,
  removeDemoBlock,
  type DaySchedule,
  type BlockInput,
} from "../horarios/_lib/schedule";

export interface DemoContextValue {
  lastConfirmation?: { shop: DemoBarbershop; appointment: DemoAppointment };
  rememberConfirmation?: (
    shop: DemoBarbershop,
    appointment: DemoAppointment,
  ) => void;
  saveSettings: (input: BarbershopInput) => void | Promise<void>;
  persistent?: boolean;
  publicBookingShops: DemoBarbershop[];
  publicAppointmentIds: string[];
  saveClient: (
    shopId: string,
    id: string | undefined,
    input: ClientInput,
  ) => void | Promise<void>;
  createPublicAppointment: (
    shopId: string,
    input: AppointmentInput,
  ) => DemoAppointment | Promise<DemoAppointment>;
  createAppointment: (
    shopId: string,
    input: AppointmentInput,
  ) => void | Promise<void>;
  changeAppointmentStatus: (
    shopId: string,
    id: string,
    status: "CANCELLED" | "COMPLETED",
  ) => void | Promise<void>;
  saveWeek: (
    shopId: string,
    professionalId: string | null,
    week: DaySchedule[],
  ) => void | Promise<void>;
  addBlock: (shopId: string, input: BlockInput) => void | Promise<void>;
  removeBlock: (shopId: string, id: string) => void | Promise<void>;
  shops: DemoBarbershop[];
  selectedShop: DemoBarbershop | undefined;
  addShop: (input: BarbershopInput) => DemoBarbershop | Promise<DemoBarbershop>;
  publishShop: (id: string, published: boolean) => void | Promise<void>;
  saveProfessional: (
    shopId: string,
    id: string | undefined,
    input: ProfessionalInput,
  ) => void | Promise<void>;
  setProfessionalActive: (
    shopId: string,
    id: string,
    active: boolean,
  ) => void | Promise<void>;
  updateServices: (
    id: string,
    update: (services: ScopedDemoService[]) => ScopedDemoService[],
  ) => void | Promise<void>;
}
export const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [lastConfirmation, setLastConfirmation] = useState<{
    shop: DemoBarbershop;
    appointment: DemoAppointment;
  }>();
  const [shops, renderShops] = useState<DemoBarbershop[]>([]);
  const [exampleShops, renderExampleShops] = useState(
    createExampleBookingShops,
  );
  const latestExamples = useRef(exampleShops);
  const [publicAppointmentIds, setPublicAppointmentIds] = useState<string[]>(
    [],
  );
  const latestShops = useRef<DemoBarbershop[]>([]);
  // Apply local mutations synchronously to the latest snapshot. Errors reach the
  // form, and rapid successive actions cannot both validate an obsolete agenda.
  function setShops(update: SetStateAction<DemoBarbershop[]>) {
    const next =
      typeof update === "function" ? update(latestShops.current) : update;
    latestShops.current = next;
    renderShops(next);
  }
  const [selectedId, setSelectedId] = useState<string>();
  const selectedShop = shops.find((shop) => shop.id === selectedId) ?? shops[0];
  function addShop(input: BarbershopInput) {
    const shop = registerOwnerDemoShop(
      latestShops.current,
      input,
      `demo-${crypto.randomUUID()}`,
      exampleBarbershops,
    );
    setShops((current) => [...current, shop]);
    setSelectedId(shop.id);
    return shop;
  }
  function createPublicAppointment(shopId: string, input: AppointmentInput) {
    const id = `demo-appointment-${crypto.randomUUID()}`;
    const isExample = latestExamples.current.some((shop) => shop.id === shopId);
    const next = createPublicDemoAppointment(
      isExample ? latestExamples.current : latestShops.current,
      shopId,
      id,
      input,
      new Date(),
    );
    const appointment = next
      .find((shop) => shop.id === shopId)!
      .appointments.find((item) => item.id === id)!;
    if (isExample) {
      latestExamples.current = next;
      renderExampleShops(next);
    } else {
      setShops(next);
    }
    setPublicAppointmentIds((current) => [...current, appointment.id]);
    return appointment;
  }
  return (
    <DemoContext.Provider
      value={{
        shops,
        lastConfirmation,
        rememberConfirmation: (shop, appointment) =>
          setLastConfirmation({ shop, appointment }),
        publicBookingShops: [...shops, ...exampleShops],
        publicAppointmentIds,
        selectedShop,
        addShop,
        saveSettings: (input) => {
          const values = barbershopSchema.parse(input);
          setShops((current) =>
            current.map((shop) =>
              shop.id === selectedShop?.id ? { ...shop, ...values } : shop,
            ),
          );
        },
        saveClient: (shopId, id, input) =>
          setShops((current) =>
            saveDemoClient(
              current,
              shopId,
              id ?? `demo-client-${crypto.randomUUID()}`,
              input,
              id !== undefined,
              new Date(),
            ),
          ),
        createPublicAppointment,
        createAppointment: (shopId, input) =>
          setShops((current) =>
            createDemoAppointment(
              current,
              shopId,
              `demo-appointment-${crypto.randomUUID()}`,
              input,
              new Date(),
            ),
          ),
        changeAppointmentStatus: (shopId, id, status) =>
          setShops((current) =>
            changeDemoAppointmentStatus(
              current,
              shopId,
              id,
              status,
              new Date(),
            ),
          ),
        saveWeek: (shopId, professionalId, week) =>
          setShops((current) =>
            saveDemoWeek(current, shopId, professionalId, week),
          ),
        addBlock: (shopId, input) =>
          setShops((current) =>
            addDemoBlock(
              current,
              shopId,
              `demo-block-${crypto.randomUUID()}`,
              input,
            ),
          ),
        removeBlock: (shopId, id) =>
          setShops((current) => removeDemoBlock(current, shopId, id)),
        saveProfessional: (shopId, id, input) =>
          setShops((current) =>
            saveDemoProfessional(
              current,
              shopId,
              id ?? `demo-professional-${crypto.randomUUID()}`,
              input,
              id !== undefined,
            ),
          ),
        setProfessionalActive: (shopId, id, active) =>
          setShops((current) =>
            setDemoProfessionalActive(current, shopId, id, active),
          ),
        publishShop: (id, published) =>
          setShops((current) => setDemoPublication(current, id, published)),
        updateServices: (id, update) =>
          setShops((current) => updateDemoServices(current, id, update)),
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}
export function useDemoBarbershop() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("DEMO_PROVIDER_REQUIRED");
  return context;
}
