import type { Metadata } from "next";
import { SchedulePanel } from "./_components/schedule-panel";

export const metadata: Metadata = {
  title: "Horários · Cortz Demo",
  robots: { index: false, follow: false },
};
export default function SchedulePage() {
  return <SchedulePanel />;
}
