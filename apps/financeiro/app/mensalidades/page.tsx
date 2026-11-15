import { redirect } from "next/navigation";

/** Mensalidades abre na aba Controle, mantendo os filtros (ano, seção, atrasados). */
export default async function FeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams(Object.entries(await searchParams).flatMap(([key, value]) => [value ?? []].flat().map((v) => [key, v]))).toString();
  redirect(`/mensalidades/controle${query ? `?${query}` : ""}`);
}
