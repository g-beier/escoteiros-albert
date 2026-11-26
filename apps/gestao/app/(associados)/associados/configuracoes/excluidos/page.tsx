import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/associates/app-header";
import { QuarantineList } from "@/components/associates/quarantine-list";
import { SettingsTabs, settingsCrumbs } from "@/components/associates/settings-tabs";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { DELETION_DAYS, todayISO } from "@/lib/associates/model";
import * as associates from "@/lib/server/associates/associates";
import { pageSession } from "@/lib/server/session";

/** Associados em quarentena (018): pedidos de exclusão ainda reversíveis. Só Editor do Associados. */
export default async function DeletedAssociatesPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.associates.canReview) redirect("/associados/configuracoes/secoes");
  const list = await associates.quarantine(member.db, member.groupId);

  return <div className="shell">
    <AppHeader current="/associados/configuracoes/excluidos" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="excluidos" canReview />} crumbs={settingsCrumbs("excluidos")}
        description={`Cadastros com exclusão pedida: não aparecem em nenhuma tela e são apagados de vez ${DELETION_DAYS} dias depois do pedido, com funções, controle e vida escoteira. Até lá, dá para restaurar.`} />
      <QuarantineList items={list} today={todayISO()} />
    </PageBody>
  </div>;
}
