import { redirect } from "next/navigation";

/** Extrato abre na aba Conciliar, mantendo a conta e o período. */
export default async function ExtratoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams(Object.entries(await searchParams).flatMap(([key, value]) => [value ?? []].flat().map((v) => [key, v]))).toString();
  redirect(`/extrato/conciliar${query ? `?${query}` : ""}`);
}
