import { redirect } from "next/navigation";
import { audienceFromSlug, audienceSlugs } from "@/lib/associates/controls";

/**
 * Rota antiga (uma aba por diretoria): a matriz agora é única em `/associados/controle`. Redireciona mantendo os
 * filtros; o público antigo (jovem, escotista, dirigente) vira jovens ou adultos.
 */
export default async function OldControlDirectoratePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === "publico" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const publico = Array.isArray(search.publico) ? search.publico[0] : search.publico;
  query.set("publico", audienceSlugs[audienceFromSlug(publico)]);
  redirect(`/associados/controle?${query}`);
}
