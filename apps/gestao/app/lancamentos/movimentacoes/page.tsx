import { EntriesScreen } from "../entries-screen";
import type { RawSearchParams } from "@/lib/filters";

export const metadata = { title: "Movimentações · GEAS Financeiro" };

/** Lançamentos › Movimentações: um lançamento por linha. */
export default function MovimentacoesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <EntriesScreen view="movimentacoes" searchParams={searchParams} />;
}
