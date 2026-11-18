import { PageBody } from "@geas/ui";
import { AppHeader } from "@/components/activities/app-header";
import { ActivitiesCalendarShell } from "@/components/activities/activities-calendar-shell";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { monthCellsFull, monthLabelShort, monthRange, parseMonth, shiftMonth } from "@/lib/activities/calendar";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import * as activities from "@/lib/server/activities/activities";
import { pageSession } from "@/lib/server/session";

export default async function ActivitiesCalendar({ searchParams }: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const params = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;

  const today = todayInSaoPaulo();
  const mes = parseMonth(params.mes, today);
  const { from, to } = monthRange(mes);
  const rows = await activities.listInRange(member.db, member.groupId, from, to);
  const cells = monthCellsFull(mes);
  const prev = shiftMonth(mes, -1);
  const next = shiftMonth(mes, 1);
  const href = (key: string) => key === today.slice(0, 7) ? "/atividades" : `/atividades?mes=${key}`;

  return <div className="shell">
    <AppHeader current="/atividades" email={user.email} role={member.activities.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <h1 className="geas-sr-only">Calendário de atividades</h1>
      <ActivitiesCalendarShell
        cells={cells}
        rows={rows}
        today={today}
        canEdit={member.activities.canEdit}
        monthTitle={monthLabelShort(mes)}
        prevHref={href(prev)}
        nextHref={href(next)}
      />
    </PageBody>
  </div>;
}
