"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Store,
  CalendarCheck,
  Receipt,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
const items = [
  { href: "/gestao", label: "Visão geral", icon: LayoutDashboard },
  { href: "/gestao/proprietarios", label: "Proprietários", icon: Users },
  { href: "/gestao/barbearias", label: "Barbearias", icon: Store },
  { href: "/gestao/assinaturas", label: "Assinaturas", icon: CalendarCheck },
  { href: "/gestao/pagamentos-pix", label: "Pagamentos Pix", icon: Receipt },
  {
    href: "/gestao/ativacoes-suspensoes",
    label: "Ativações e suspensões",
    icon: ShieldCheck,
  },
];
export function GlobalNavigation() {
  const pathname = usePathname();
  return (
    <aside className="bg-background border-b lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
      <Link href="/gestao" className="flex items-center gap-3 px-6 py-6">
        <span className="bg-foreground text-background flex size-9 items-center justify-center rounded-xl text-sm font-semibold">
          C
        </span>
        <span className="font-semibold tracking-tight">
          Cortz
          <span className="text-muted-foreground block text-[11px] font-normal tracking-wide">
            STUDIO NOTREVE
          </span>
        </span>
      </Link>
      <nav
        aria-label="Gestão global"
        className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col"
      >
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${pathname === href ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto hidden space-y-3 border-t p-6 text-xs lg:block">
        <p className="text-muted-foreground">
          Administração do SaaS
          <br />
          Mensalidades por Pix manual
        </p>
        <Link href="/" className="flex items-center gap-2">
          Abrir catálogo público
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </aside>
  );
}
