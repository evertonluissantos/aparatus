import Link from "next/link";
import { redirect } from "next/navigation";
import { managementAccess } from "@/lib/management-access";
import { PersistentProvider } from "./persistent-context";
import { ownerShop, shopRevision } from "@/lib/owner-store";

export async function ManagementGate({
  area,
  children,
}: {
  area: "owner" | "global";
  children: React.ReactNode;
}) {
  const access = await managementAccess(area);
  if (access === "login") redirect("/acesso/proprietario");
  if (access === "pending" || access === "rejected")
    return (
      <main className="mx-auto max-w-xl space-y-5 p-8">
        <h1 className="text-2xl font-semibold">
          {access === "pending"
            ? "Sua barbearia aguarda aprovação"
            : "Cadastro não aprovado"}
        </h1>
        <p className="text-muted-foreground">
          {access === "pending"
            ? "O Studio Notreve analisará seu cadastro. Os recursos operacionais serão liberados após a aprovação administrativa, independentemente de pagamento Pix."
            : "O Studio Notreve rejeitou a solicitação. Seus dados foram preservados. Entre em contato com o administrador para esclarecimentos."}
        </p>
        <Link className="underline" href="/painel" prefetch={false}>
          Consultar situação
        </Link>
        <Link className="block underline" href="/acesso/proprietario">
          Voltar ao acesso
        </Link>
      </main>
    );
  if (access === "authorized" && area === "owner") {
    const shop = await ownerShop();
    return (
      <PersistentProvider
        initialShop={shop}
        initialRevision={shop ? shopRevision(shop) : undefined}
      >
        {children}
      </PersistentProvider>
    );
  }
  if (access === "authorized" || access === "demo") return children;
  return (
    <main className="mx-auto max-w-xl space-y-5 p-8">
      <h1 className="text-2xl font-semibold">
        {access === "forbidden"
          ? "Acesso não permitido"
          : "Acesso administrativo indisponível"}
      </h1>
      <p className="text-muted-foreground">
        A autenticação e os vínculos de acesso precisam estar validados antes de
        disponibilizar este painel. Nenhuma informação privada foi carregada por
        esta tela.
      </p>
      <Link className="underline" href="/acesso/proprietario">
        Acesso do proprietário
      </Link>
    </main>
  );
}
