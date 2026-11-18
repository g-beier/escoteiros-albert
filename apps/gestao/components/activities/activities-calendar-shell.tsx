"use client";

import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { CalendarBoard } from "@/components/activities/calendar-grid";
import { NewActivityDialog } from "@/components/activities/new-activity-dialog";
import type { CalendarCell } from "@/lib/activities/calendar";
import type { ActivityRow } from "@/lib/activities/model";

/** Calendário + lista + modal de criação (botão e clique no dia). */
export function ActivitiesCalendarShell({
  cells, rows, today, canEdit, monthTitle, prevHref, nextHref,
}: {
  cells: CalendarCell[];
  rows: ActivityRow[];
  today: string;
  canEdit: boolean;
  monthTitle: string;
  prevHref: string;
  nextHref: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const openCreate = (date: string | null) => {
    setCreateDate(date);
    setCreateOpen(true);
  };

  return <>
    <SectionCard>
      <SectionHeader
        title="Calendário"
        description={canEdit
          ? "Clique num dia para criar, ou numa atividade da lista para abrir."
          : "Clique numa atividade da lista para abrir."}>
        <div className="flex flex-wrap items-center gap-2">
          <SectionCount>{rows.length} {rows.length === 1 ? "atividade" : "atividades"}</SectionCount>
          {canEdit && (
            <Button type="button" size="sm" className="gap-1" onClick={() => openCreate(null)}>
              <IconPlus className="size-4" aria-hidden />Nova atividade
            </Button>
          )}
        </div>
      </SectionHeader>
      <CalendarBoard
        cells={cells}
        rows={rows}
        today={today}
        canEdit={canEdit}
        monthTitle={monthTitle}
        prevHref={prevHref}
        nextHref={nextHref}
        onCreateDay={(date) => openCreate(date)}
      />
    </SectionCard>

    <NewActivityDialog
      date={createDate}
      open={createOpen}
      onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) setCreateDate(null);
      }}
    />
  </>;
}
