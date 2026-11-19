import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "@geas/ui/lib/utils";

/** Cartão de conteúdo: sombra suave, cantos todos arredondados. O título fica fora (ver `SectionHeader`). */
export function SectionCard({ className, children, ...props }: React.ComponentProps<"section">) {
  const items = Children.toArray(children);
  const headers: ReactNode[] = [];
  const body: ReactNode[] = [];
  for (const child of items) {
    if (isSectionHeader(child)) headers.push(child);
    else body.push(child);
  }
  return <section className={cn("grid gap-2", className)} {...props}>
    {headers}
    <div className="surface overflow-hidden">{body}</div>
  </section>;
}

function isSectionHeader(child: ReactNode): child is ReactElement {
  return isValidElement(child) && typeof child.type === "function" && (
    child.type === SectionHeader
    || (child.type as { displayName?: string }).displayName === "SectionHeader"
  );
}

/** Título da seção: fora do cartão, no fundo da página (padrão inventário / BlockIntro). */
export function SectionHeader({ title, titleId, description, children }: {
  title: React.ReactNode; titleId?: string; description?: React.ReactNode; children?: React.ReactNode;
}) {
  return <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-1">
    <div className="min-w-0">
      <h2 id={titleId} className="m-0 text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="m-0 text-xs text-balance text-muted-foreground">{description}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
  </header>;
}
SectionHeader.displayName = "SectionHeader";

/** Corpo do cartão (formulários): mesmo respiro em todos os cadastros. */
export function SectionBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-3 p-3", className)} {...props} />;
}

/** Contagem discreta no cabeçalho ("3 ativas de 4"). */
export function SectionCount({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}
