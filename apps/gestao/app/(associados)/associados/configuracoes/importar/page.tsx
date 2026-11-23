import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/associates/app-header";
import { AssociatesImport } from "@/components/associates/associates-import";
import { SettingsTabs, settingsCrumbs } from "@/components/associates/settings-tabs";
import { SetupNeeded } from "@/components/shell/setup-needed";
import * as associates from "@/lib/server/associates/associates";
import * as sections from "@/lib/server/associates/sections";
import { pageSession } from "@/lib/server/session";

export default async function ImportPage() {
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.associates.canReview) redirect("/associados/configuracoes/secoes");
  const [existing, catalog] = await Promise.all([associates.existingForImport(member.db, member.groupId), sections.catalog(member.db, member.groupId)]);

  return <div className="shell">
    <AppHeader current="/associados/configuracoes/importar" member={member} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="importar" canEdit />} crumbs={settingsCrumbs("importar")}
        description="Cadastro em massa por planilha (CSV), com conferência antes de gravar." />
      <SectionCard>
        <SectionHeader title="Importar associados (CSV)" />
        <AssociatesImport existing={existing} {...catalog} />
      </SectionCard>
    </PageBody>
  </div>;
}
