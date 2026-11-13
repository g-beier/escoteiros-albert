import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@geas/ui/lib/utils";

const TONES = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-[#725d0d]",
  neutral: "text-foreground",
} as const;

export type StatTone = keyof typeof TONES;

/** Indicador do Início: rótulo pequeno e valor em destaque; com `href`, o cartão inteiro é link. */
export function StatCard({ label, value, tone = "neutral", href, icon }: {
  label: string; value: ReactNode; tone?: StatTone; href?: string; icon?: ReactNode;
}) {
  const body = <>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={cn("num flex items-center gap-1.5 text-xl font-bold", TONES[tone])}>{icon}{value}</span>
  </>;
  const className = "grid gap-1 rounded-lg border bg-card px-4 py-3";
  return href
    ? <Link href={href} className={cn(className, "transition-colors hover:border-primary")}>{body}</Link>
    : <div className={className}>{body}</div>;
}

/** Lista do Início (últimos lançamentos, movimentações…): cartão com título, link "ver todos" e itens; sem itens (children vazio ou `false`), mostra `empty`. */
export function ListCard({ title, titleId, href, linkLabel, empty, children, className }: {
  title: string; titleId: string; href?: string; linkLabel?: string; empty?: ReactNode; children?: ReactNode; className?: string;
}) {
  return <section aria-labelledby={titleId} className={cn("flex flex-col overflow-hidden rounded-lg border bg-card", className)}>
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
      <h2 id={titleId} className="m-0 text-sm font-semibold">{title}</h2>
      {href && <Link href={href} className="text-xs font-semibold text-primary hover:underline">{linkLabel ?? "Ver todos"}</Link>}
    </div>
    {children || <p className="px-4 py-8 text-center text-xs text-muted-foreground">{empty}</p>}
  </section>;
}
