"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { IconChevronDown, IconChevronUp, IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Textarea } from "@geas/ui/components/textarea";
import { cn } from "@geas/ui/lib/utils";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { saveActivitySchedule } from "@/app/(atividades)/atividades/actions";
import type { ActivityScheduleItem } from "@/lib/activities/model";
import {
  defaultNormalSchedule,
  durationLabel,
  emptyScheduleItem,
  moveScheduleItem,
  scheduleChain,
  scheduleItemTitle,
  withChainedTimes,
} from "@/lib/activities/schedule";
import { ACTIVITY_KIND_FILL } from "@/lib/activities/vocabulary";
import { dateBR } from "@/lib/format";

/** Tipografia e superfície iguais ao Resumo: sem borda, só sombra. */
const fieldLabel = "text-sm font-semibold";
const softShadow = "shadow-[0_10px_28px_rgba(70,60,110,0.12)]";
const softFocus =
  "focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-[#ef6334]/45 focus-visible:shadow-[0_10px_28px_rgba(239,99,52,0.22)]";
const fieldControl = cn(
  "h-9 w-full min-w-0 rounded-xl border-0 bg-white px-2.5 text-sm md:text-sm leading-normal data-[size=default]:h-9",
  softShadow,
  softFocus,
);
const fieldArea = cn(
  "min-h-16 w-full rounded-xl border-0 bg-white px-2.5 py-2 text-sm md:text-sm leading-normal",
  softShadow,
  softFocus,
);

/** Editor do cronograma (cadeia de horários, reordenar). */
export function ScheduleEditor({
  activityId, startsOn, startTime, initial, canEdit,
  showSave = true, onChange,
}: {
  activityId: string;
  startsOn: string;
  startTime: string;
  initial: ActivityScheduleItem[];
  canEdit: boolean;
  /** Botão local de salvar (desligado no detalhe, que salva tudo no header). */
  showSave?: boolean;
  onChange?: (items: ActivityScheduleItem[]) => void;
}) {
  const [items, setItems] = useState<ActivityScheduleItem[]>(() => {
    const seeded = initial.length > 0
      ? initial
      : canEdit
        ? defaultNormalSchedule(startsOn, startTime || "13:30")
        : [];
    return seeded.map((item) => ({ ...item, materials: item.materials ?? [] }));
  });
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [toast, setToast] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();
  useActionToast(toast);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { onChangeRef.current?.(items); }, [items]);

  const chain = useMemo(() => scheduleChain(items, startsOn, startTime), [items, startsOn, startTime]);

  const update = (index: number, patch: Partial<ActivityScheduleItem>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addAfter = (afterIdx: number | null) => {
    const item = emptyScheduleItem(startsOn, startTime);
    setItems((current) => {
      if (afterIdx == null || afterIdx < 0) return [...current, item];
      const next = [...current];
      next.splice(afterIdx + 1, 0, item);
      return next;
    });
  };

  const removeAt = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
    setOpenIdx((current) => {
      if (current == null) return null;
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
  };

  const onDrop = (to: number) => {
    if (dragFrom == null || dragFrom === to) return;
    setItems((current) => moveScheduleItem(current, dragFrom, to));
    setOpenIdx((current) => {
      if (current == null) return null;
      if (current === dragFrom) return to;
      if (dragFrom < current && to >= current) return current - 1;
      if (dragFrom > current && to <= current) return current + 1;
      return current;
    });
    setDragFrom(null);
  };

  const save = () => {
    startTransition(async () => {
      const schedule = withChainedTimes(items, startsOn, startTime);
      const result = await saveActivitySchedule(activityId, schedule);
      setToast(result);
      if (!result.error) setItems(schedule);
    });
  };

  if (!canEdit) {
    return items.length === 0
      ? <p className="m-0 text-sm text-muted-foreground">Nenhum item no cronograma ainda.</p>
      : <ul className="m-0 grid list-none gap-2 p-0 text-sm">
        {items.map((item, index) => (
          <li key={item.id} className="surface px-3 py-2">
            <div className="font-medium">{scheduleItemTitle(item)}</div>
            <div className="text-muted-foreground">
              {dateBR(chain[index]?.date || item.date)} · {chain[index]?.start || item.start || "—"} · {durationLabel(item.duration)}
            </div>
          </li>
        ))}
      </ul>;
  }

  return <div className="grid gap-3 text-sm">
    {items.length === 0
      ? <div className="surface grid gap-3 px-4 py-6 text-center">
        <p className="m-0 text-muted-foreground">Nenhum horário no cronograma.</p>
        <Button type="button" size="sm" className="justify-self-center" onClick={() => addAfter(null)}>
          <IconPlus className="size-4" aria-hidden />Adicionar horário
        </Button>
      </div>
      : <ul className="m-0 grid list-none gap-3 p-0">
        {items.map((item, index) => {
          const open = openIdx === index;
          const slot = chain[index];
          return <li
            key={item.id}
            className={cn(
              "group relative surface",
              open && "ring-2 ring-primary/20",
              dragFrom === index && "opacity-50",
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(index)}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={open}
              aria-label={open ? "Recolher horário" : "Expandir horário"}
              onClick={() => setOpenIdx(open ? null : index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenIdx(open ? null : index);
                }
              }}
              className="grid min-h-11 w-full cursor-pointer grid-cols-[2rem_3.25rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-2 text-sm leading-normal sm:grid-cols-[2rem_3.5rem_minmax(0,1fr)_4.5rem_2.25rem_2.25rem]">
              <button
                type="button"
                className="inline-flex size-8 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
                aria-label="Arrastar para reordenar"
                draggable
                onClick={(event) => event.stopPropagation()}
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}>
                <IconGripVertical className="size-4" aria-hidden />
              </button>
              <span className="font-medium tabular-nums text-foreground">{slot?.start || "—"}</span>
              <span className="min-w-0 truncate font-medium">
                {scheduleItemTitle(item)}
                {item.description?.trim() && item.description.trim() !== item.name?.trim()
                  ? <span className="font-normal text-muted-foreground"> · {item.description.trim()}</span>
                  : null}
              </span>
              <span className="hidden text-muted-foreground sm:inline">{durationLabel(item.duration)}</span>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Excluir horário"
                onClick={(event) => {
                  event.stopPropagation();
                  removeAt(index);
                }}>
                <IconTrash className="size-4" aria-hidden />
              </button>
              <span className="inline-flex size-8 items-center justify-center text-muted-foreground" aria-hidden>
                {open ? <IconChevronUp className="size-4" /> : <IconChevronDown className="size-4" />}
              </span>
            </div>

            {open && <div className="grid gap-3 overflow-hidden bg-muted/40 px-3 py-3 text-sm">
              <div className="grid min-w-0 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_5.25rem_6.75rem]">
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor={`cron-name-${item.id}`} className={fieldLabel}>Nome</Label>
                  <Input id={`cron-name-${item.id}`} value={item.name ?? ""}
                    className={fieldControl}
                    onChange={(event) => update(index, { name: event.target.value })}
                    placeholder="Nome da atividade…" />
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label className={fieldLabel}>Início</Label>
                  <p className={cn("m-0 flex h-9 items-center rounded-xl border-0 bg-white px-2 tabular-nums leading-normal", softShadow)}>
                    {slot?.start || "—"}
                  </p>
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor={`cron-dur-${item.id}`} className={fieldLabel}>Duração (min)</Label>
                  <Input
                    id={`cron-dur-${item.id}`}
                    type="number"
                    min={0}
                    step={5}
                    inputMode="numeric"
                    value={item.duration || ""}
                    className={cn(fieldControl, "tabular-nums")}
                    placeholder="min"
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        update(index, { duration: 0 });
                        return;
                      }
                      const minutes = Number(raw);
                      if (!Number.isFinite(minutes) || minutes < 0) return;
                      update(index, { duration: Math.round(minutes) });
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`cron-desc-${item.id}`} className={fieldLabel}>Descrição</Label>
                <Textarea id={`cron-desc-${item.id}`} rows={3} value={item.description}
                  className={fieldArea}
                  onChange={(event) => update(index, { description: event.target.value })}
                  placeholder="Como funciona, regras, objetivo…" />
              </div>
            </div>}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-1/2 justify-center">
              <button
                type="button"
                title="Adicionar horário abaixo"
                aria-label="Adicionar horário abaixo"
                onClick={(event) => {
                  event.stopPropagation();
                  addAfter(index);
                }}
                className={cn(
                  "pointer-events-none flex size-8 cursor-pointer items-center justify-center rounded-full opacity-0 shadow-[0_4px_14px_rgba(239,99,52,0.35)] transition-opacity group-hover:pointer-events-auto group-hover:opacity-100",
                  ACTIVITY_KIND_FILL,
                )}>
                <IconPlus className="size-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </li>;
        })}
      </ul>}

    {items.length > 0 && <div className="flex flex-wrap items-center gap-2">
      {showSave && (
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Salvando…" : "Salvar cronograma"}
        </Button>
      )}
    </div>}
  </div>;
}
