import { cn } from "@geas/ui/lib/utils";
import { CONDITION_LABELS, type Condition } from "@/lib/inventory";

/** Preenchimento sólido no estilo monday.com da Home (Bom / Médio / Ruim). */
const CONDITION_FILL: Record<Condition, string> = {
  novo: "bg-[#00c875] text-white",
  bom: "bg-[#00c875] text-white",
  regular: "bg-[#fdab3d] text-white",
  manutencao: "bg-[#fdab3d] text-white",
  ruim: "bg-[#e2445c] text-white",
  inservivel: "bg-[#e2445c] text-white",
};

export function ConditionPill({ condition }: { condition: Condition | null }) {
  if (!condition) return null;
  return <span className={cn(
    "inline-flex min-w-[4.25rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold",
    CONDITION_FILL[condition],
  )}>
    {CONDITION_LABELS[condition]}
  </span>;
}
