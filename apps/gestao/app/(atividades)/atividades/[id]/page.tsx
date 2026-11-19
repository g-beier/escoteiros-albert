import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/activities/app-header";
import { ActivityDetailEditor } from "@/components/activities/activity-detail-editor";
import { ActivitySummary } from "@/components/activities/activity-summary";
import { ScheduleEditor } from "@/components/activities/schedule-editor";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { timeHM } from "@/lib/activities/calendar";
import { activityTitle } from "@/lib/activities/vocabulary";
import * as activities from "@/lib/server/activities/activities";
import { pageSession } from "@/lib/server/session";

export default async function ActivityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const row = await activities.getById(member.db, member.groupId, id);
  if (!row) notFound();

  const title = activityTitle(row.kind, row.title);

  return <div className="shell">
    <AppHeader current={`/atividades/${id}`} email={user.email} role={member.activities.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      {member.activities.canEdit
        ? <ActivityDetailEditor activity={row} title={title} />
        : <>
          <PageHeader title={title} />
          <ActivitySummary activity={row} canEdit={false} />
          <SectionCard>
            <SectionHeader title="Cronograma" description="Itens do dia a dia da atividade." />
            <div className="p-4">
              <ScheduleEditor
                activityId={row.id}
                startsOn={row.starts_on}
                startTime={timeHM(row.start_time) || "09:00"}
                initial={row.schedule}
                canEdit={false}
              />
            </div>
          </SectionCard>
        </>}
    </PageBody>
  </div>;
}
