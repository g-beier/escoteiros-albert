import { EntriesScreen } from "../entries-screen";
import type { RawSearchParams } from "@/lib/filters";

export const metadata = { title: "Detalhamento · GEAS Financeiro" };

/** Lançamentos › Detalhamento: um rateio por linha. */
export default function DetalhamentoPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <EntriesScreen view="detalhamento" searchParams={searchParams} />;
}
