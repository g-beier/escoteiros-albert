import { redirect } from "next/navigation";
import { pageMember } from "@/lib/server/session";

/** Configurações abre em Contas. Consulta não tem configurações no Financeiro (associados e seções ficam em /associados). */
export default async function SettingsIndexPage() {
  const {
    finance: { canReview },
  } = await pageMember();
  redirect(canReview ? "/financeiro/configuracoes/contas" : "/financeiro");
}
