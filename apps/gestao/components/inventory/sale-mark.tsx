import { IconShoppingBag } from "@tabler/icons-react";
import { cn } from "@geas/ui/lib/utils";
import { formatCents } from "@/lib/format";

/** "À venda na Lojinha · R$ 25,00" (ou "sem preço"). */
export const saleMarkLabel = (priceCents: number | null) => `À venda na Lojinha · ${priceCents != null ? formatCents(priceCents) : "sem preço"}`;

/**
 * Ícone de material à venda na Lojinha (019/020), ao lado do nome. A lista de Materiais usa o mesmo ícone pelo sprite
 * (`sale`); aqui, nas telas com poucos materiais (Registro rápido).
 */
export function SaleMark({ priceCents, className }: { priceCents: number | null; className?: string }) {
  const label = saleMarkLabel(priceCents);
  return <span className={cn("inline-flex shrink-0 align-middle text-primary", className)} title={label}>
    <IconShoppingBag className="size-3.5" aria-hidden /><span className="sr-only">{label}</span>
  </span>;
}
