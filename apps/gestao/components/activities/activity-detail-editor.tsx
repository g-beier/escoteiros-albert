"use client";

import { useActionState, useState } from "react";
import { PageHeader } from "@geas/ui";
import { Button } from "@geas/ui/components/button";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { saveActivity } from "@/app/(atividades)/atividades/actions";
import { ActivityForm } from "@/components/activities/activity-form";
import { DeleteActivityButton } from "@/components/activities/delete-activity-button";
import { ScheduleEditor } from "@/components/activities/schedule-editor";
import { timeHM } from "@/lib/activities/calendar";
import type { ActivityDetail, ActivityScheduleItem } from "@/lib/activities/model";
import { defaultNormalSchedule } from "@/lib/activities/schedule";

const FORM_ID = "activity-detail-form";

/** Edição da atividade: um Salvar no header grava resumo + cronograma. */
export function ActivityDetailEditor({
  activity, title,
}: {
  activity: ActivityDetail;
  title: string;
}) {
  const [state, action, pending] = useActionState(saveActivity, {} as ActionResult);
  useActionToast(state);
  const [schedule, setSchedule] = useState<ActivityScheduleItem[]>(() => {
    const seeded = activity.schedule.length > 0
      ? activity.schedule
      : defaultNormalSchedule(activity.starts_on, timeHM(activity.start_time) || "13:30");
    return seeded.map((item) => ({ ...item, materials: item.materials ?? [] }));
  });

  return <>
    <PageHeader title={title} actions={
      <div className="flex flex-wrap items-center gap-2">
        <DeleteActivityButton id={activity.id} title={title} />
        <Button type="submit" form={FORM_ID} disabled={pending} className="cursor-pointer">
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    } />

    <form
      id={FORM_ID}
      action={action}
      className="grid gap-[1.75rem]"
      onKeyDown={(event) => {
        // Enter nos inputs não salva — só o botão Salvar.
        if (event.key !== "Enter") return;
        const tag = (event.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "BUTTON") return;
        event.preventDefault();
      }}>
      <input type="hidden" name="schedule" value={JSON.stringify(schedule)} />

      <SectionCard>
        <SectionHeader title="Resumo" description="Tipo, seções, datas e horários da atividade." />
        <div className="p-3">
          <ActivityForm activity={activity} requireAll embedded />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Cronograma"
          description="Monte a atividade. Os horários são calculados automaticamente." />
        <div className="p-4">
          <ScheduleEditor
            activityId={activity.id}
            startsOn={activity.starts_on}
            startTime={timeHM(activity.start_time) || "09:00"}
            initial={activity.schedule}
            canEdit
            showSave={false}
            onChange={setSchedule}
          />
        </div>
      </SectionCard>
    </form>
  </>;
}
