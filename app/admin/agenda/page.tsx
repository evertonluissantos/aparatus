import type { Metadata } from "next";
import { AgendaPanel } from "./_components/agenda-panel";

export const metadata: Metadata = {
  title: "Agenda · Cortz Demo",
  robots: { index: false, follow: false },
};
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { date } = await searchParams;
  return (
    <AgendaPanel initialDate={typeof date === "string" ? date : undefined} />
  );
}
