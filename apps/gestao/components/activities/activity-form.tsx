"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { cn } from "@geas/ui/lib/utils";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { saveActivity } from "@/app/(atividades)/atividades/actions";
import { timeHM } from "@/lib/activities/calendar";
import type { ActivityRow } from "@/lib/activities/model";
import {
  ACTIVITY_KIND_FILL, ACTIVITY_KIND_LABELS, ACTIVITY_KINDS,
  ACTIVITY_SECTION_FILL, ACTIVITY_SECTION_LABELS, ACTIVITY_SECTIONS,
  ACTIVITY_TAG,
  type ActivityKind, type ActivitySection,
} from "@/lib/activities/vocabulary";

/** Cadastro e edição básica da atividade (calendário). */
export function ActivityForm({
  activity, className, actions, requireAll = false, embedded = false, stacked = false,
}: {
  activity?: ActivityRow;
  className?: string;
  /** Exige título, datas e horários de início e fim. */
  requireAll?: boolean;
  /** Campos sem <form> — o pai envia (ex.: detalhe com Salvar no header). */
  embedded?: boolean;
  /** Um campo por linha (modal Nova atividade). */
  stacked?: boolean;
  /** Rodapé customizado (ex.: DialogFooter). */
  actions?: (state: { pending: boolean; canSubmit: boolean }) => ReactNode;
}) {
  const [state, action, pending] = useActionState(saveActivity, {} as ActionResult);
  useActionToast(state);
  const [kind, setKind] = useState<ActivityKind>(activity?.kind ?? "normal");
  const [branches, setBranches] = useState<ActivitySection[]>(activity?.branches ?? []);

  const toggle = (section: ActivitySection) => {
    setBranches((current) => current.includes(section)
      ? current.filter((item) => item !== section)
      : [...current, section]);
  };

  const startDate = activity?.starts_on || "";
  const startTime = timeHM(activity?.start_time);
  const endDate = activity?.ends_on ?? "";
  const endTime = timeHM(activity?.end_time);
  // Labels/valores do formulário em text-sm; pills = exatamente o padrão inventário.
  const fieldLabel = "text-sm font-semibold";
  const fieldText = "text-sm md:text-sm leading-normal";
  const softField = "rounded-xl border-0 bg-white shadow-[0_10px_28px_rgba(70,60,110,0.12)]";
  const softInput = cn(
    "h-9 w-full min-w-0 rounded-xl border-0 bg-white px-2.5 shadow-[0_10px_28px_rgba(70,60,110,0.12)]",
    fieldText,
    "focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-[#ef6334]/45",
    "focus-visible:shadow-[0_10px_28px_rgba(239,99,52,0.22)]",
  );
  const stackedLabel = cn(fieldLabel, "justify-center text-center");
  // text-center + webkit: date/time no Chrome não centralizam só com text-align no input.
  const stackedInput = cn(
    softInput,
    "text-center placeholder:text-center",
    "[&::-webkit-datetime-edit]:w-full [&::-webkit-datetime-edit]:text-center",
    "[&::-webkit-datetime-edit-fields-wrapper]:mx-auto",
    "[&::-webkit-date-and-time-value]:w-full [&::-webkit-date-and-time-value]:text-center",
  );
  // Ícone do date/time fora do fluxo — senão o valor fica visualmente à esquerda.
  const stackedPickerInput = cn(
    stackedInput,
    "relative",
    "[&::-webkit-calendar-picker-indicator]:absolute",
    "[&::-webkit-calendar-picker-indicator]:right-2.5",
    "[&::-webkit-calendar-picker-indicator]:top-1/2",
    "[&::-webkit-calendar-picker-indicator]:h-4",
    "[&::-webkit-calendar-picker-indicator]:w-4",
    "[&::-webkit-calendar-picker-indicator]:-translate-y-1/2",
    "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
  );

  const fields = <>
    {activity?.id ? <input type="hidden" name="id" value={activity.id} /> : null}
    <input type="hidden" name="kind" value={kind} />
    {requireAll ? <input type="hidden" name="requireAll" value="1" /> : null}
    {branches.map((section) => <input key={section} type="hidden" name="branches" value={section} />)}

    <div className={cn("grid items-start gap-2.5", !stacked && "sm:grid-cols-2")}>
      <div className="grid min-w-0 gap-1">
        <Label id="activity-sections-label" className={stacked ? stackedLabel : fieldLabel}>Seções</Label>
        <div
          className={cn(
            softField,
            "flex flex-wrap items-center gap-1.5 px-2.5 py-1.5",
            stacked && "justify-center",
          )}
          role="group"
          aria-labelledby="activity-sections-label">
          {ACTIVITY_SECTIONS.map((section) => {
            const selected = branches.includes(section);
            return <button
              key={section}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(section)}
              className={cn(
                ACTIVITY_TAG,
                "cursor-pointer transition-colors",
                selected
                  ? ACTIVITY_SECTION_FILL[section]
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}>
              {ACTIVITY_SECTION_LABELS[section]}
            </button>;
          })}
        </div>
      </div>

      <div className="grid min-w-0 gap-1">
        <Label id="activity-kind-label" className={stacked ? stackedLabel : fieldLabel}>Tipo</Label>
        <div
          className={cn(
            softField,
            "flex flex-wrap items-center gap-1.5 px-2.5 py-1.5",
            stacked && "justify-center",
          )}
          role="radiogroup"
          aria-labelledby="activity-kind-label">
          {ACTIVITY_KINDS.map((value) => {
            const selected = kind === value;
            return <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(value)}
              className={cn(
                ACTIVITY_TAG,
                "cursor-pointer transition-colors",
                selected
                  ? ACTIVITY_KIND_FILL
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}>
              {ACTIVITY_KIND_LABELS[value]}
            </button>;
          })}
        </div>
      </div>
    </div>

    {stacked ? (
      <div className="grid items-start gap-2.5">
        <div className="grid min-w-0 gap-1">
          <Label htmlFor="activity-title" className={stackedLabel}>Nome da atividade</Label>
          <Input id="activity-title" name="title" maxLength={160} required={requireAll}
            className={stackedInput} defaultValue={activity?.title ?? ""} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="activity-starts" className={stackedLabel}>Data de início</Label>
          <Input id="activity-starts" name="startsOn" type="date" required className={stackedPickerInput}
            defaultValue={startDate || undefined} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="activity-start-time" className={stackedLabel}>Hora de início</Label>
          <Input id="activity-start-time" name="startTime" type="time" required className={stackedPickerInput}
            defaultValue={startTime || undefined} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="activity-ends" className={stackedLabel}>Data de fim</Label>
          <Input id="activity-ends" name="endsOn" type="date" required={requireAll} className={stackedPickerInput}
            defaultValue={endDate || undefined} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="activity-end-time" className={stackedLabel}>Hora de fim</Label>
          <Input id="activity-end-time" name="endTime" type="time" required={requireAll} className={stackedPickerInput}
            defaultValue={endTime || undefined} />
        </div>
      </div>
    ) : (
      <div className="grid items-start gap-2.5 text-sm sm:grid-cols-2">
        <div className="grid min-w-0 gap-1">
          <Label htmlFor="activity-title" className={fieldLabel}>Nome da atividade</Label>
          <Input id="activity-title" name="title" maxLength={160} required={requireAll}
            className={softInput} defaultValue={activity?.title ?? ""} />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="grid gap-1">
            <Label htmlFor="activity-starts" className={fieldLabel}>Data de início</Label>
            <Input id="activity-starts" name="startsOn" type="date" required className={softInput}
              defaultValue={startDate || undefined} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="activity-start-time" className={fieldLabel}>Hora de início</Label>
            <Input id="activity-start-time" name="startTime" type="time" required className={softInput}
              defaultValue={startTime || undefined} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="activity-ends" className={fieldLabel}>Data de fim</Label>
            <Input id="activity-ends" name="endsOn" type="date" required={requireAll} className={softInput}
              defaultValue={endDate || undefined} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="activity-end-time" className={fieldLabel}>Hora de fim</Label>
            <Input id="activity-end-time" name="endTime" type="time" required={requireAll} className={softInput}
              defaultValue={endTime || undefined} />
          </div>
        </div>
      </div>
    )}
  </>;

  if (embedded) {
    return <div className={cn("grid items-start gap-2.5", className)}>{fields}</div>;
  }

  return <form action={action} className={cn("grid items-start gap-2.5", className)}>
    {fields}
    {actions
      ? actions({ pending, canSubmit: branches.length > 0 })
      : <div>
        <Button type="submit" disabled={pending || branches.length === 0} className="cursor-pointer">
          {pending ? "Salvando…" : activity?.id ? "Salvar atividade" : "Criar atividade"}
        </Button>
      </div>}
  </form>;
}
