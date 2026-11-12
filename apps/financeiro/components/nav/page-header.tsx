import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type Tab = { href: string; label: string; active: boolean };

/** Abas de uma área (Extrato: Conciliar/Importar; Configurações: Contas, Rubricas…). */
export function SectionTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  return <nav aria-label={label} className="inline-flex w-fit flex-wrap rounded-full bg-secondary p-0.5">
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined}
      className={cn("rounded-full px-3 py-1 text-xs font-semibold no-underline transition-colors",
        tab.active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{tab.label}</Link>)}
  </nav>;
}

/**
 * Cabeçalho comum das telas: voltar (opcional), título, abas da área, descrição e ações à direita.
 * Mesmo formato compacto em todas as telas.
 */
export function PageHeader({ title, description, back, tabs, actions, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return <div className="grid gap-2">
    {back && <Link href={back.href} className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground no-underline hover:text-foreground">
      <IconArrowLeft className="size-4" aria-hidden /> {back.label}</Link>}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="m-0 min-w-0 text-xl leading-tight font-bold tracking-tight break-words">{title}</h1>
      {tabs}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {description && <p className="m-0 max-w-3xl text-xs text-muted-foreground">{description}</p>}
    {children}
  </div>;
}

/** Área do Extrato: a mesma conta segue de uma aba para a outra. */
export function ExtratoTabs({ current, accountId }: { current: "conciliar" | "importar"; accountId?: string }) {
  const query = accountId ? `?conta=${encodeURIComponent(accountId)}` : "";
  return <SectionTabs label="Extrato" tabs={[
    { href: `/conciliacao${query}`, label: "Conciliar", active: current === "conciliar" },
    { href: `/importacao${query}`, label: "Importar", active: current === "importar" },
  ]} />;
}

export type SettingsTab = "contas" | "rubricas" | "formas" | "perfis" | "associados" | "mensalidades";

/** Configurações: cadastros do grupo. Consulta vê só Associados. */
export function SettingsTabs({ current, canEdit }: { current: SettingsTab; canEdit: boolean }) {
  const tabs: Tab[] = [
    ...(canEdit ? [
      { href: "/cadastros?aba=contas", label: "Contas", active: current === "contas" },
      { href: "/cadastros?aba=rubricas", label: "Rubricas", active: current === "rubricas" },
      { href: "/cadastros?aba=formas", label: "Formas de pagamento", active: current === "formas" },
      { href: "/cadastros?aba=perfis", label: "Perfis de leitura", active: current === "perfis" },
    ] : []),
    { href: "/associados", label: "Associados", active: current === "associados" },
    ...(canEdit ? [{ href: "/cadastros?aba=mensalidades", label: "Mensalidades", active: current === "mensalidades" }] : []),
  ];
  return <SectionTabs label="Configurações" tabs={tabs} />;
}

/**
 * Corpo das telas: o mesmo contêiner (largura total, margens de 16px) em todas, alinhado ao header,
 * para não haver saltos de largura ao navegar. O conteúdo pode não ocupar tudo.
 */
export const PAGE_BODY = "grid w-full content-start gap-5 px-4 py-6";

export function PageBody({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn(PAGE_BODY, className)} {...props} />;
}
