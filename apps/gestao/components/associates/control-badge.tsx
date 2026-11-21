import { cn } from "@geas/ui/lib/utils";
import { cellStatusLabel, statusShortLabels, statusTone, type CellStatus, type StatusTone } from "@/lib/associates/controls";

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "border-success/30 bg-success-soft text-success",
  warn: "border-[var(--orange)]/30 bg-[var(--orange-soft)] text-[var(--orange-dark)]",
  danger: "border-destructive/30 bg-destructive-soft text-destructive",
  info: "border-primary/20 bg-[var(--purple-soft)] text-[var(--purple-dark)]",
  muted: "border-border bg-muted text-muted-foreground",
  empty: "border-dashed border-border bg-transparent text-muted-foreground",
};

/**
 * Selo da situação: cor e texto (nunca só cor). `short` usa o rótulo curto (matriz), com o completo no título e
 * para leitores de tela. Sem registro mostra "—" na matriz. `value` (ano ou data do item que mostra um valor)
 * substitui o texto, com a cor da situação; a situação segue no título e para leitores de tela.
 */
export function ControlBadge({ status, short, value, className }: { status: CellStatus; short?: boolean; value?: string | null; className?: string }) {
  const label = cellStatusLabel(status);
  const text = value ?? (status === "sem_registro" ? (short ? "—" : label) : short ? statusShortLabels[status] : label);
  return <span title={label} className={cn("inline-flex h-5 items-center justify-center rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap", value && "num", TONE_CLASS[statusTone[status]], className)}>
    {value ? <>{value}<span className="sr-only"> ({label})</span></>
      : text === label ? text : <><span aria-hidden>{text}</span><span className="sr-only">{label}</span></>}
  </span>;
}
