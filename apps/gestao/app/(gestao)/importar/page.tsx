import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { ImportBatch } from "@/components/shell/import-batch";
import { todayISO } from "@/lib/associates/model";
import { FILHOTES_ENABLED } from "@/lib/features";
import * as imports from "@/lib/server/import";
import { pageSession } from "@/lib/server/session";

/** Importação por CSV (docs/importacao.md): editores do Associados ou do Inventário. */
export default async function ImportPage() {
  const { member } = await pageSession();
  if (!member || !(member.associates.canReview || member.inventory.canReview)) notFound();
  const state = await imports.state(member.db, member.groupId);
  return <div className="shell">
    <GestaoHeader current="/importar" member={member} quick />
    <PageBody>
      <PageHeader title="Importar" crumbs={[{ label: "Importar" }]}
        description="Povoe o app com planilhas convertidas para CSV no formato do contrato. Envie um ou vários arquivos, confira o que muda e importe; reenviar não duplica." />
      <ImportBatch state={state} options={{ filhotes: FILHOTES_ENABLED, today: todayISO() }}
        modules={{ associados: member.associates.canReview, inventario: member.inventory.canReview }} />
    </PageBody>
  </div>;
}
