import { cn } from "@/lib/utils";

/** Cartão de seção (cadastros, importação): borda forte, cabeçalho com título e ações. */
export function SectionCard({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("overflow-hidden rounded-2xl border-[1.5px] border-foreground bg-card shadow-sm", className)} {...props} />;
}

export function SectionHeader({ title, titleId, description, children }: { title: React.ReactNode; titleId?: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2.5">
    <div className="min-w-0">
      <h2 id={titleId} className="m-0 text-base font-semibold">{title}</h2>
      {description && <p className="m-0 text-xs text-balance text-muted-foreground">{description}</p>}
    </div>
    {children && <div className="flex items-center gap-3">{children}</div>}
  </header>;
}

/** Corpo do cartão (formulários): mesmo respiro em todos os cadastros. */
export function SectionBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-3 p-3", className)} {...props} />;
}

/** Contagem discreta no cabeçalho ("3 ativas de 4"). */
export function SectionCount({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}
