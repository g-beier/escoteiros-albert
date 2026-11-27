import { cn } from "@geas/ui/lib/utils";
import { CONDITION_LABELS, type Condition } from "@/lib/inventory/vocabulary";

/** Escala do melhor (verde cheio) ao pior (vermelho cheio); manutenção é situação, não qualidade (azul). */
const TONES: Record<Condition, string> = {
  novo: "bg-success text-white",
  bom: "bg-success-soft text-success",
  regular: "bg-warning-soft text-warning",
  manutencao: "bg-info-soft text-info",
  ruim: "bg-destructive-soft text-destructive",
  inservivel: "bg-destructive text-white",
};

/** Estado (condição) de um lote, peça ou linha da lista. `detail`: quebra quando a linha mistura condições. */
export function ConditionPill({
  condition,
  detail,
  className,
}: {
  condition: Condition | null;
  detail?: string;
  className?: string;
}) {
  if (!condition) return <span className="text-muted-foreground">—</span>;
  const mixed = Boolean(detail);
  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[condition],
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-80" aria-hidden />
      {CONDITION_LABELS[condition]}
      {mixed && (
        <span aria-hidden className="opacity-70">
          +
        </span>
      )}
      {mixed && <span className="sr-only"> (pior estado; {detail})</span>}
    </span>
  );
}
