import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeader } from "@geas/ui/components/section-card";
import { cn } from "@geas/ui/lib/utils";

const TONES = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-[#725d0d]",
  neutral: "text-foreground",
} as const;

export type StatTone = keyof typeof TONES;

/** Indicador: rótulo pequeno e valor em destaque; com `href`, o cartão inteiro é link. */
export function StatCard({ label, value, tone = "neutral", href, icon, plain = false }: {
  label: string; value: ReactNode; tone?: StatTone; href?: string; icon?: ReactNode; plain?: boolean;
}) {
  const body = <>
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={cn("num flex items-center gap-1.5 text-xl font-bold", TONES[tone])}>{icon}{value}</span>
  </>;
  const className = cn("grid gap-1 px-4 py-3", !plain && "surface");
  return href
    ? <Link href={href} className={cn(className, !plain && "transition-shadow hover:shadow-[0_10px_28px_rgba(37,35,40,0.14)]")}>{body}</Link>
    : <div className={className}>{body}</div>;
}

/** Lista: título + descrição fora (padrão inventário) e um cartão só com o conteúdo. */
export function ListCard({ title, titleId, description, href, linkLabel, empty, children, className }: {
  title: string; titleId: string; description?: ReactNode; href?: string; linkLabel?: string; empty?: ReactNode; children?: ReactNode; className?: string;
}) {
  return <section aria-labelledby={titleId} className={cn("grid gap-2", className)}>
    <SectionHeader title={title} titleId={titleId} description={description}>
      {href && <Link href={href} className="text-xs font-semibold text-primary hover:underline">{linkLabel ?? "Ver todos"}</Link>}
    </SectionHeader>
    <div className="surface overflow-hidden">
      {children || <p className="m-0 px-4 py-8 text-center text-xs text-muted-foreground">{empty}</p>}
    </div>
  </section>;
}
