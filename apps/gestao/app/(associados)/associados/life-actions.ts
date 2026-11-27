"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { ALL_SCOUT_BRANCHES, type ScoutBranch } from "@/lib/associates/model";
import { EXCLUSION_REASONS, type ExclusionReason, type SuggestedPeriod } from "@/lib/associates/scout-life";
import * as life from "@/lib/server/associates/scout-life";
import { associatesEditorOrError } from "@/lib/server/session";
import { date, id, notes, optional, optionalId, text } from "./form-data";

// Vida escoteira (004): períodos, estrelas, eventos e anotações. Só o Editor do Associados (a Diretoria de Métodos
// Educativos); as regras (sobreposição, datas futuras) ficam nas funções life_*, que respondem em português.

function branch(data: FormData, key = "branch"): ScoutBranch {
  const value = text(data, key);
  if (!(ALL_SCOUT_BRANCHES as readonly string[]).includes(value)) throw new InputError("Escolha o ramo.");
  return value as ScoutBranch;
}
const optionalBranch = (data: FormData, key = "branch") => (text(data, key) ? branch(data, key) : null);
function star(data: FormData) {
  const value = Number(text(data, "star"));
  if (!Number.isInteger(value) || value < 1 || value > 99)
    throw new InputError("Estrela inválida. Recarregue a página.");
  return value;
}

// Perfil, linha do tempo, lista, visão do grupo e Início mostram a vida escoteira.
function revalidate() {
  revalidatePath("/associados", "layout");
  revalidatePath("/");
}

export async function savePeriod(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const periodId = optionalId(formData, "periodId");
    const place = optional(formData, "place");
    if (place && place.length > 80) throw new InputError("Outro grupo: no máximo 80 caracteres.");
    await life.savePeriod(db, {
      associateId: id(formData, "associateId"),
      periodId,
      branch: branch(formData),
      place,
      startedOn: date(formData, "startedOn", "o início", true),
      endedOn: date(formData, "endedOn", "o fim"),
    });
    revalidate();
    return periodId ? "Período corrigido." : "Período incluído.";
  });
}

export async function deletePeriod(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    await life.deletePeriod(db, id(formData, "periodId"));
    revalidate();
    return "Período apagado.";
  });
}

/** Inclui os períodos sugeridos pelo cadastro (JSON montado na tela por `missingSuggestions`). */
export async function applySuggestion(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    let periods: SuggestedPeriod[];
    try {
      periods = JSON.parse(text(formData, "periods")) as SuggestedPeriod[];
    } catch {
      throw new InputError("Sugestão inválida. Recarregue a página.");
    }
    if (!Array.isArray(periods) || periods.length === 0) throw new InputError("Nada a incluir.");
    const total = await life.addPeriods(db, id(formData, "associateId"), periods, "cadastro");
    revalidate();
    return total === 1 ? "1 período incluído." : `${total} períodos incluídos.`;
  });
}

/** Encerra o vigente na data e, com ramo, abre outro (ajuste ao cadastro). */
export async function switchPeriod(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const next = optionalBranch(formData);
    await life.switchPeriod(db, id(formData, "associateId"), date(formData, "date", "a data", true), next);
    revalidate();
    return next ? "Período vigente ajustado." : "Período vigente encerrado.";
  });
}

/** Certificado entregue (quita as estrelas anteriores) ou, com `undo`, desfaz a entrega. */
export async function deliverStar(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const undo = text(formData, "undo") === "1";
    const n = star(formData);
    await life.deliverStar(
      db,
      id(formData, "associateId"),
      n,
      undo ? null : date(formData, "date", "a data da entrega", true),
    );
    revalidate();
    return undo ? "Entrega desfeita." : `Certificado da ${n}ª estrela entregue.`;
  });
}

export async function setStarBranch(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    await life.setStarBranch(db, id(formData, "associateId"), star(formData), optionalBranch(formData));
    revalidate();
    return "Ramo da estrela salvo.";
  });
}

export async function saveEvent(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const eventId = optionalId(formData, "eventId");
    const title = text(formData, "title");
    if (!title || title.length > 80) throw new InputError("Informe o título (até 80 caracteres).");
    await life.saveEvent(db, {
      associateId: id(formData, "associateId"),
      eventId,
      date: date(formData, "date", "a data", true),
      title,
      description: notes(formData, "description", 1000),
    });
    revalidate();
    return eventId ? "Evento corrigido." : "Evento incluído.";
  });
}

export async function deleteEvent(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    await life.deleteEvent(db, id(formData, "eventId"));
    revalidate();
    return "Evento apagado.";
  });
}

export async function saveNotes(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    await life.setNotes(db, id(formData, "associateId"), notes(formData, "notes", 4000));
    revalidate();
    return "Anotações salvas.";
  });
}

/** Período não contabilizado (POR, Regra 173): frequência, licença acima de 60 dias, suspensão ou outro. */
export async function saveExclusion(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const exclusionId = optionalId(formData, "exclusionId");
    const reason = text(formData, "reason");
    if (!(EXCLUSION_REASONS as readonly string[]).includes(reason)) throw new InputError("Escolha o motivo.");
    await life.saveExclusion(db, {
      associateId: id(formData, "associateId"),
      exclusionId,
      reason: reason as ExclusionReason,
      note: notes(formData, "note", 500),
      startedOn: date(formData, "startedOn", "o início", true),
      endedOn: date(formData, "endedOn", "o fim", true),
    });
    revalidate();
    return exclusionId ? "Período não contabilizado corrigido." : "Período não contabilizado incluído.";
  });
}

export async function deleteExclusion(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    await life.deleteExclusion(db, id(formData, "exclusionId"));
    revalidate();
    return "Período não contabilizado apagado: volta a contar.";
  });
}
