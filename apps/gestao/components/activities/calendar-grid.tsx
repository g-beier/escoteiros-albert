"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@geas/ui/lib/utils";
import type { CalendarCell } from "@/lib/activities/calendar";
import { eachDateInRange, weekdayShort } from "@/lib/activities/calendar";
import type { ActivityRow } from "@/lib/activities/model";

import {
  ACTIVITY_KIND_BORDER, ACTIVITY_KIND_FILL, ACTIVITY_KIND_LABELS, ACTIVITY_KIND_RING,
  ACTIVITY_SECTION_DOT, ACTIVITY_SECTION_FILL, ACTIVITY_SECTION_LABELS, ACTIVITY_SECTIONS,
  ACTIVITY_LIST_TAG, ACTIVITY_TAG_WIDTH_REM, activityTitle, compareActivitiesByDaySection,
  type ActivitySection,
} from "@/lib/activities/vocabulary";
import { dateBR } from "@/lib/format";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const navBtn = "inline-flex size-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-background/80";
const weekRows = (cells: CalendarCell[]) => Math.max(1, Math.ceil(cells.length / 7));

/** Painel calendário + lista: largura do inventário (1152), altura = calendário + padding. */
const VISIBLE_ACTIVITIES = 5;
const ROW_HEIGHT = "4.5rem";
/** Altura do calendário / viewport da lista = 5 atividades. */
const CALENDAR_HEIGHT = `calc(${VISIBLE_ACTIVITIES} * ${ROW_HEIGHT})`;
const LIST_DATE_COL_REM = 2.25;
const LIST_GUTTER_REM = 1.25;
const TAG_GAP_REM = 0.25;
const LIST_SAFETY_REM = 0.5;
/** Fração da largura útil que a lista ocupa no layout lado a lado (1fr + 1.25fr). */
const LIST_COL_FRACTION = 1.25 / (1 + 1.25);

/** Largura mínima da lista para a atividade com mais tags caber numa linha. */
function listMinRem(rows: ActivityRow[]) {
  const maxTags = rows.reduce((max, row) => Math.max(max, 1 + row.branches.length), 0);
  if (maxTags === 0) return 0;
  const tagsRem = maxTags * ACTIVITY_TAG_WIDTH_REM + Math.max(0, maxTags - 1) * TAG_GAP_REM;
  return LIST_DATE_COL_REM + LIST_GUTTER_REM + tagsRem + LIST_SAFETY_REM;
}

/** Seções presentes no dia, sempre na ordem lobinho → escoteiro → sênior → pioneiro. */
function daySections(rows: ActivityRow[]): ActivitySection[] {
  const present = new Set<ActivitySection>();
  for (const row of rows) {
    for (const branch of row.branches) present.add(branch);
  }
  return ACTIVITY_SECTIONS.filter((section) => present.has(section));
}

/** Calendário ao lado da lista; empilha só quando a metade não cabe as tags. Clique no dia pede criação. */
export function CalendarBoard({
  cells, rows, today, canEdit, monthTitle, prevHref, nextHref, onCreateDay,
}: {
  cells: CalendarCell[];
  rows: ActivityRow[];
  today: string;
  canEdit: boolean;
  monthTitle: string;
  prevHref: string;
  nextHref: string;
  onCreateDay?: (date: string) => void;
}) {
  const [stack, setStack] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const byDay = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    for (const day of eachDateInRange(row.starts_on, row.ends_on)) {
      const list = byDay.get(day) ?? [];
      list.push(row);
      byDay.set(day, list);
    }
  }
  const listRows = [...rows].sort(compareActivitiesByDaySection);
  const rowsCount = weekRows(cells);
  const neededListRem = listMinRem(listRows);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      if (neededListRem <= 0) {
        setStack(false);
        return;
      }
      const styles = getComputedStyle(board);
      const rem = Number.parseFloat(styles.fontSize) || 16;
      const padX = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
      const usable = board.clientWidth - padX - gap;
      const listPx = usable * LIST_COL_FRACTION;
      setStack(listPx < neededListRem * rem);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(board);
    return () => observer.disconnect();
  }, [neededListRem]);

  return <>
    <div
      ref={boardRef}
      className={cn(
        "mx-auto grid w-full max-w-[1152px] items-start gap-4 overflow-hidden p-3 lg:gap-6 lg:p-4",
        stack ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]",
      )}>
      <div className={cn("min-w-0", stack && "mx-auto w-full max-w-xl")}>
        <aside
          className="flex w-full flex-col overflow-hidden rounded-2xl bg-muted/60 p-3"
          style={{ height: CALENDAR_HEIGHT }}
          aria-label="Calendário do mês">
          <div className="mb-1 flex h-7 shrink-0 items-center justify-between gap-2 px-0.5">
            <p className="m-0 truncate text-sm font-semibold text-foreground">{monthTitle}</p>
            <nav className="flex shrink-0 items-center gap-0.5" aria-label="Navegar meses">
              <Link href={prevHref} className={navBtn} aria-label="Mês anterior"><IconChevronLeft className="size-4" /></Link>
              <Link href={nextHref} className={navBtn} aria-label="Próximo mês"><IconChevronRight className="size-4" /></Link>
            </nav>
          </div>
          <div className="grid h-4 shrink-0 grid-cols-7" role="row" aria-hidden>
            {WEEKDAYS.map((day, index) => (
              <div key={`${day}-${index}`} className="text-center text-[10px] font-semibold leading-4 text-muted-foreground">{day}</div>
            ))}
          </div>
          <div
            className="grid min-h-0 flex-1 grid-cols-7 gap-1"
            style={{ gridTemplateRows: `repeat(${rowsCount}, minmax(0, 1fr))` }}
            role="grid"
            aria-label={monthTitle}>
            {cells.map((cell) => {
              const dayRows = cell.inMonth ? (byDay.get(cell.date) ?? []) : [];
              const sections = daySections(dayRows);
              const hasActivity = dayRows.length > 0;
              const isToday = cell.date === today;
              const openCreate = () => { if (canEdit && cell.inMonth) onCreateDay?.(cell.date); };
              return <button
                key={cell.date}
                type="button"
                role="gridcell"
                disabled={!canEdit || !cell.inMonth}
                onClick={openCreate}
                aria-label={canEdit && cell.inMonth
                  ? `Nova atividade em ${dateBR(cell.date)}${sections.length ? ` (${sections.map((s) => ACTIVITY_SECTION_LABELS[s]).join(", ")})` : ""}`
                  : dateBR(cell.date)}
                className={cn(
                  "group relative flex min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors [container-type:size]",
                  hasActivity && "text-foreground",
                  !cell.inMonth && "text-muted-foreground/40",
                  cell.inMonth && !hasActivity && "text-foreground",
                  (!canEdit || !cell.inMonth) && "cursor-default",
                )}>
                {hasActivity && <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e4e4e7] transition-colors",
                    canEdit && cell.inMonth && "group-hover:bg-[#d4d4d8]",
                    isToday && cn("ring-[3px]", ACTIVITY_KIND_RING),
                  )}
                  style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}
                />}
                {!hasActivity && cell.inMonth && <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
                    canEdit && "group-hover:bg-primary/10",
                    isToday && cn("ring-[3px]", ACTIVITY_KIND_RING),
                  )}
                  style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}
                />}
                <span className="relative leading-none">{Number(cell.date.slice(8, 10))}</span>
                {hasActivity && <span className="relative flex h-1.5 items-center gap-0.5" aria-hidden>
                  {sections.map((section) => (
                    <span key={section} className={cn("size-1.5 shrink-0 rounded-full", ACTIVITY_SECTION_DOT[section])} />
                  ))}
                </span>}
              </button>;
            })}
          </div>
        </aside>
      </div>

      <section
        className="min-w-0 overflow-x-hidden overflow-y-auto"
        style={{ height: CALENDAR_HEIGHT }}
        aria-label="Atividades do mês">
        {listRows.length === 0
          ? <p className="m-0 flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Nenhuma atividade neste mês.
          </p>
          : <ul className="m-0 grid list-none gap-0 divide-y divide-border/70 p-0">
            {listRows.map((row) => {
              return <li key={row.id} className="h-[4.5rem]">
                <Link href={`/atividades/${row.id}`}
                  className="grid h-full grid-cols-[2.25rem_minmax(0,1fr)] gap-2 py-1.5 text-foreground no-underline transition-colors hover:bg-muted/40">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="num text-base font-bold leading-none">{Number(row.starts_on.slice(8, 10))}</div>
                    <div className="mt-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground">{weekdayShort(row.starts_on)}</div>
                  </div>
                  <div className={cn("flex min-w-0 flex-col justify-center border-l-[3px] pl-2.5", ACTIVITY_KIND_BORDER)}>
                    <div className="truncate text-sm font-semibold text-foreground">{activityTitle(row.kind, row.title)}</div>
                    {row.venue_name ? (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Local: {row.venue_name}
                      </div>
                    ) : null}
                    <div className="mt-1 flex flex-nowrap gap-1">
                      <span className={cn(ACTIVITY_LIST_TAG, ACTIVITY_KIND_FILL)}>
                        {ACTIVITY_KIND_LABELS[row.kind]}
                      </span>
                      {row.branches.map((section) => (
                        <span key={section} className={cn(ACTIVITY_LIST_TAG, ACTIVITY_SECTION_FILL[section])}>
                          {ACTIVITY_SECTION_LABELS[section]}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </li>;
            })}
          </ul>}
      </section>
    </div>
  </>;
}
