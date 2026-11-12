"use client";

import Link from "next/link";
import { toast } from "sonner";
import { IconCopy } from "@tabler/icons-react";
import { ALL_DATES } from "@/lib/filters";
import { shortOfxId } from "@/lib/format";
import { usePathname } from "next/navigation";
import { entriesPath } from "@/lib/entries";

/**
 * ID OFX (FITID) das linhas do extrato vinculadas ao lançamento. Não é único: clicar filtra a lista
 * por ele e junta o lançamento, seus rateios e os demais lançamentos da mesma movimentação.
 */
export function OfxIds({ ids }: { ids: string[] }) {
  const pathname = usePathname();
  if (!ids.length) return <span className="text-muted-foreground">—</span>;
  const [first, ...rest] = ids;
  const href = (id: string) => {
    // fica na visão atual (Movimentações ou Detalhamento)
    return entriesPath(pathname.startsWith(entriesPath("detalhamento")) ? "detalhamento" : "movimentacoes", new URLSearchParams({ de: ALL_DATES, ofx: id }).toString());
  };
  const copy = () => navigator.clipboard.writeText(ids.join("\n")).then(() => toast.success(ids.length > 1 ? "IDs OFX copiados." : "ID OFX copiado."), () => toast.error("Não foi possível copiar."));
  return <span className="inline-flex items-center gap-1 whitespace-nowrap">
    <Link href={href(first)} scroll={false} className="num text-xs text-primary underline-offset-2 hover:underline" title={`${ids.join("\n")}\nMostrar tudo o que veio desta movimentação`}>
      {shortOfxId(first)}
    </Link>
    {rest.length > 0 && <span className="text-xs text-muted-foreground" title={rest.join("\n")}>+{rest.length}</span>}
    <button type="button" onClick={copy} className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Copiar ID OFX ${ids.join(", ")}`}><IconCopy className="size-3.5" /></button>
  </span>;
}
