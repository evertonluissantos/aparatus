import { notFound } from "next/navigation";
import { SectionPreview } from "../_components/section-preview";
import { SettingsPanel } from "../_components/settings-panel";

const sections: Record<string, string> = {
  configuracoes: "Configurações",
};
export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) notFound();
  if (section === "configuracoes") return <SettingsPanel />;
  return <SectionPreview section={section} title={sections[section]} />;
}
