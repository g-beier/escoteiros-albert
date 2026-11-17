import { redirect } from "next/navigation";

/** Antiga rota de Movimentações; o menu e a tela passam a ser Histórico. */
export default async function MovementsRedirect({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  const s = query.toString();
  redirect(s ? `/historico?${s}` : "/historico");
}
