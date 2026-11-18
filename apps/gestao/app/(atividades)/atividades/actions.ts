"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import type { ActivityScheduleItem } from "@/lib/activities/model";
import { defaultNormalSchedule, withChainedTimes } from "@/lib/activities/schedule";
import {
  ACTIVITY_KINDS, ACTIVITY_SECTIONS, isActivitySection, type ActivityKind, type ActivitySection,
} from "@/lib/activities/vocabulary";
import * as activities from "@/lib/server/activities/activities";
import { activitiesEditorOrError } from "@/lib/server/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function requiredDate(data: FormData, key: string, label: string) {
  const value = text(data, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError(`Informe ${label}.`);
  return value;
}

function optionalDate(data: FormData, key: string) {
  const value = text(data, key);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError("Data inválida.");
  return value;
}

function requiredTime(data: FormData, key: string, label: string) {
  const value = text(data, key);
  if (!/^\d{2}:\d{2}$/.test(value)) throw new InputError(`Informe ${label}.`);
  return value;
}

function optionalTime(data: FormData, key: string) {
  const value = text(data, key);
  if (!value) return null;
  if (!/^\d{2}:\d{2}$/.test(value)) throw new InputError("Horário inválido.");
  return value;
}

function kindOf(data: FormData): ActivityKind {
  const value = text(data, "kind");
  if (!ACTIVITY_KINDS.includes(value as ActivityKind)) throw new InputError("Tipo de atividade inválido.");
  return value as ActivityKind;
}

function branchesOf(data: FormData): ActivitySection[] {
  const values = data.getAll("branches").map(String).filter(isActivitySection);
  const unique = ACTIVITY_SECTIONS.filter((section) => values.includes(section));
  if (unique.length === 0) throw new InputError("Escolha ao menos uma seção.");
  return unique;
}

function parseSchedule(value: unknown): ActivityScheduleItem[] {
  if (!Array.isArray(value)) throw new InputError("Cronograma inválido.");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new InputError(`Item ${index + 1} do cronograma inválido.`);
    }
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `item-${index}`;
    const date = typeof item.date === "string" ? item.date : "";
    const start = typeof item.start === "string" ? item.start : "";
    const duration = typeof item.duration === "number" && Number.isFinite(item.duration)
      ? Math.max(0, Math.round(item.duration))
      : 0;
    const description = typeof item.description === "string" ? item.description : "";
    return {
      id,
      date,
      start,
      duration,
      name: typeof item.name === "string" ? item.name : "",
      category: typeof item.category === "string" ? item.category : "",
      description,
      responsible: typeof item.responsible === "string" ? item.responsible : "todos",
      materials: Array.isArray(item.materials) ? item.materials as ActivityScheduleItem["materials"] : [],
    };
  });
}

/** Cria ou atualiza uma atividade do calendário. */
export async function saveActivity(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const result = await runAction(activitiesEditorOrError, async ({ db, groupId }) => {
    const id = text(formData, "id") || null;
    const requireAll = text(formData, "requireAll") === "1" || !id;
    const startsOn = requiredDate(formData, "startsOn", "a data de início");
    const endsOn = requireAll
      ? requiredDate(formData, "endsOn", "a data de fim")
      : optionalDate(formData, "endsOn");
    if (endsOn && endsOn < startsOn) throw new InputError("A data de fim não pode ser anterior ao início.");
    const kind = kindOf(formData);
    const startTime = requiredTime(formData, "startTime", "a hora de início");
    const endTime = requireAll
      ? requiredTime(formData, "endTime", "a hora de fim")
      : optionalTime(formData, "endTime");
    const title = text(formData, "title");
    if (requireAll && !title) throw new InputError("Informe o nome da atividade.");
    const current = id ? await activities.getById(db, groupId, id) : null;
    const scheduleRaw = text(formData, "schedule");
    let schedule: ActivityScheduleItem[];
    if (scheduleRaw) {
      try {
        schedule = withChainedTimes(parseSchedule(JSON.parse(scheduleRaw)), startsOn, startTime);
      } catch (error) {
        if (error instanceof InputError) throw error;
        throw new InputError("Cronograma inválido.");
      }
    } else if (current) {
      schedule = current.schedule.length > 0
        ? withChainedTimes(current.schedule, startsOn, startTime)
        : defaultNormalSchedule(startsOn, startTime);
    } else {
      schedule = defaultNormalSchedule(startsOn, startTime);
    }
    const savedId = await activities.save(db, groupId, {
      id,
      kind,
      title: title || null,
      startsOn,
      endsOn,
      startTime,
      endTime,
      branches: branchesOf(formData),
      schedule,
      authorization: current?.authorization ?? null,
      attendance: current?.attendance ?? [],
      planActions: current?.plan_actions ?? [],
    });
    revalidatePath("/atividades");
    revalidatePath(`/atividades/${savedId}`);
    // Criação volta ao calendário; edição permanece no detalhe.
    redirect(id ? `/atividades/${savedId}` : "/atividades");
  });
  return result;
}

/** Salva só o cronograma, preservando os demais campos da atividade. */
export async function saveActivitySchedule(id: string, scheduleRaw: unknown): Promise<ActionResult> {
  return runAction(activitiesEditorOrError, async ({ db, groupId }) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InputError("Atividade inválida.");
    const current = await activities.getById(db, groupId, id);
    if (!current) throw new InputError("Atividade não encontrada.");
    const schedule = withChainedTimes(parseSchedule(scheduleRaw), current.starts_on, current.start_time.slice(0, 5));
    await activities.save(db, groupId, {
      id,
      kind: current.kind,
      title: current.title,
      startsOn: current.starts_on,
      endsOn: current.ends_on,
      startTime: current.start_time.slice(0, 5),
      endTime: current.end_time ? current.end_time.slice(0, 5) : null,
      branches: current.branches,
      schedule,
      authorization: current.authorization,
      attendance: current.attendance,
      planActions: current.plan_actions,
    });
    revalidatePath("/atividades");
    revalidatePath(`/atividades/${id}`);
    return "Cronograma salvo.";
  });
}

/** Exclui a atividade e volta ao calendário. */
export async function deleteActivity(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(activitiesEditorOrError, async ({ db }) => {
    const id = text(formData, "id");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InputError("Atividade inválida.");
    await activities.remove(db, id);
    revalidatePath("/atividades");
    redirect("/atividades");
  });
}
