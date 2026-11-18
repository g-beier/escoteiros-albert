import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/activities/app-header";
import { ActivityForm } from "@/components/activities/activity-form";
import { SetupNeeded } from "@/components/shell/setup-needed";
import type { ActivityRow } from "@/lib/activities/model";
import { pageSession } from "@/lib/server/session";

export default async function NewActivity({ searchParams }: {
  searchParams: Promise<{ data?: string }>;
}) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.activities.canEdit) redirect("/atividades");

  const startsOn = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? params.data : "";
  const draft: ActivityRow = {
    id: "", kind: "normal", title: null, starts_on: startsOn, ends_on: null,
    start_time: "", end_time: null, branches: [], venue_name: null,
  };

  return <div className="shell">
    <AppHeader current="/atividades/novo" email={user.email} role={member.activities.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Nova atividade" description="Preencha todos os dados do calendário." />
      <SectionCard>
        <SectionHeader title="Atividade" />
        <div className="p-4"><ActivityForm activity={draft} requireAll /></div>
      </SectionCard>
    </PageBody>
  </div>;
}
