import { IconArrowDown, IconArrowUp, IconChevronDown, IconFilterFilled } from "@tabler/icons-react";

// Cabeçalho de coluna das listas (Materiais, Lançamentos), comum aos menus da coluna (cliente) e aos links de ordenar
// (servidor): fica fora de módulo "use client" para a página receber a string e o componente, não referências de cliente.

/** Indicadores do cabeçalho, sempre depois do rótulo e na mesma ordem em todas as colunas: ordem, filtro, menu. */
export function HeadIcons({ sorted, dir, filtered, menu }: { sorted: boolean; dir: "asc" | "desc"; filtered?: boolean; menu?: boolean }) {
  const SortIcon = dir === "asc" ? IconArrowUp : IconArrowDown;
  return <>
    {sorted && <SortIcon className="size-3.5 shrink-0" aria-hidden />}
    {filtered && <IconFilterFilled className="size-3.5 shrink-0 text-primary" aria-hidden />}
    {menu && <IconChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />}
  </>;
}

/** Botão/link do cabeçalho: rótulo à esquerda, indicadores à direita, mesma caixa em todas as colunas. */
export const HEAD_TRIGGER = "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 uppercase hover:bg-background/70 hover:text-foreground";
