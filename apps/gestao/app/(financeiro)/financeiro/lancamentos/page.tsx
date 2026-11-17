import { redirect } from "next/navigation";
import { entriesPath, listQuery } from "@/lib/finance/entries";
import type { RawSearchParams } from "@/lib/finance/filters";

/** Lançamentos abre em Movimentações, mantendo os filtros. */
export default async function LancamentosPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  redirect(entriesPath("movimentacoes", listQuery(await searchParams)));
}
