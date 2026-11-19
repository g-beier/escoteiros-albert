import { cn } from "@geas/ui/lib/utils";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { timeHM } from "@/lib/activities/calendar";
import type { ActivityDetail } from "@/lib/activities/model";
import {
  ACTIVITY_KIND_FILL, ACTIVITY_KIND_LABELS, ACTIVITY_SECTION_FILL, ACTIVITY_SECTION_LABELS,
  ACTIVITY_SECTIONS, ACTIVITY_TAG, activityTitle,
} from "@/lib/activities/vocabulary";
import { dateBR } from "@/lib/format";

function periodLabel(activity: ActivityDetail) {
  const start = dateBR(activity.starts_on);
  const end = activity.ends_on && activity.ends_on !== activity.starts_on
    ? dateBR(activity.ends_on)
    : null;
  return end ? `${start} – ${end}` : start;
}

function timeLabel(activity: ActivityDetail) {
  const start = timeHM(activity.start_time);
  const end = timeHM(activity.end_time);
  if (start && end) return `${start} – ${end}`;
  return start || end || "—";
}

/** Resumo somente leitura (quem não pode editar). */
export function ActivitySummary({ activity }: { activity: ActivityDetail; canEdit?: boolean }) {
  const sections = ACTIVITY_SECTIONS.filter((section) => activity.branches.includes(section));

  return <SectionCard>
    <SectionHeader title="Resumo" description="Visão rápida da atividade no calendário." />
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      <div className="surface grid gap-1 p-3 sm:col-span-2">
        <p className="m-0 text-xs font-medium text-muted-foreground">Nome</p>
        <p className="m-0 text-sm font-semibold text-foreground">{activityTitle(activity.kind, activity.title)}</p>
      </div>
      <div className="surface grid gap-1.5 p-3 sm:col-span-2">
        <p className="m-0 text-xs font-medium text-muted-foreground">Tipo e seções</p>
        <div className="flex flex-wrap gap-1">
          <span className={cn(ACTIVITY_TAG, ACTIVITY_KIND_FILL)}>{ACTIVITY_KIND_LABELS[activity.kind]}</span>
          {sections.map((section) => (
            <span key={section} className={cn(ACTIVITY_TAG, ACTIVITY_SECTION_FILL[section])}>
              {ACTIVITY_SECTION_LABELS[section]}
            </span>
          ))}
          {sections.length === 0 && <span className="text-sm text-muted-foreground">Sem seção</span>}
        </div>
      </div>
      <div className="surface grid gap-1 p-3">
        <p className="m-0 text-xs font-medium text-muted-foreground">Datas</p>
        <p className="m-0 text-sm text-foreground">{periodLabel(activity)}</p>
      </div>
      <div className="surface grid gap-1 p-3">
        <p className="m-0 text-xs font-medium text-muted-foreground">Horário</p>
        <p className="m-0 text-sm tabular-nums text-foreground">{timeLabel(activity)}</p>
      </div>
      {activity.venue_name && (
        <div className="surface grid gap-1 p-3 sm:col-span-2">
          <p className="m-0 text-xs font-medium text-muted-foreground">Local</p>
          <p className="m-0 text-sm text-foreground">{activity.venue_name}</p>
        </div>
      )}
    </div>
  </SectionCard>;
}
