import { redirect } from "next/navigation";
import { pageMember } from "@/lib/session";

/** Configurações abre na primeira aba que a pessoa vê: Contas (tesouraria e administração) ou Associados (consulta). */
export default async function SettingsIndexPage() {
  const { canEdit } = await pageMember();
  redirect(canEdit ? "/configuracoes/contas" : "/configuracoes/associados");
}
