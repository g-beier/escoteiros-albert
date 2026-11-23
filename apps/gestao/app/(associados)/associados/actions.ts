"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { date, id, notes, optionalId, text } from "./form-data";
import { isFunctionKind } from "@/lib/associates/controls";
import { isRegistration, isScoutBranch, NICKNAME_MAX, type ScoutBranch } from "@/lib/associates/model";
import { isKinship, kinshipNoteError } from "@/lib/associates/relatives";
import * as associates from "@/lib/server/associates/associates";
import * as functions from "@/lib/server/associates/functions";
import * as relatives from "@/lib/server/associates/relatives";
import { associatesEditorOrError, associatesWriterOrError } from "@/lib/server/session";

// Validação dos formulários aqui; as regras (datas, ramo × seção × equipe, já desligado) ficam nas funções
// associates_* (040), que respondem em português.

function name(data: FormData) {
  const value = text(data, "name");
  if (value.length < 2 || value.length > 120) throw new InputError("Informe o nome (2 a 120 caracteres).");
  return value;
}
function placement(data: FormData): { branch: ScoutBranch; sectionId: string | null; patrolId: string | null } {
  const branch = text(data, "branch");
  if (!isScoutBranch(branch)) throw new InputError("Escolha o ramo, a seção ou a equipe.");
  return { branch, sectionId: optionalId(data, "sectionId"), patrolId: optionalId(data, "patrolId") };
}
const dates = (data: FormData) => ({
  birthDate: date(data, "birthDate", "a data de nascimento"),
  promiseDate: date(data, "promiseDate", "a data da promessa"),
  joinedOn: date(data, "joinedOn", "a data de entrada"),
});

// Lista, detalhe e a matriz do controle de dados dependem da situação e das funções.
function revalidate() {
  revalidatePath("/associados", "layout");
}

/** Cadastro (sem `id`) e edição; ao salvar, vai para o detalhe. */
export async function saveAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  let savedId = "";
  const result = await runAction(associatesWriterOrError, async ({ db, groupId }) => {
    const editing = optionalId(formData, "id");
    if (editing) {
      const registration = text(formData, "registration");
      if (!isRegistration(registration)) throw new InputError("Escolha o registro (provisório ou definitivo).");
      const nickname = notes(formData, "nickname", NICKNAME_MAX);
      await associates.update(db, { id: editing, name: name(formData), notes: notes(formData), registration, nickname, placement: placement(formData), ...dates(formData) });
      savedId = editing;
    } else {
      savedId = await associates.create(db, groupId, { name: name(formData), notes: notes(formData), ...placement(formData), ...dates(formData) });
    }
    revalidate();
  });
  if (result.error || !savedId) return result;
  redirect(`/associados/${savedId}`);
}

/** Marca o cadastro do registro rápido como revisado (049). */
export async function reviewAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db, groupId }) => {
    await associates.review(db, groupId, [id(formData, "id")]);
    revalidate();
    revalidatePath("/");
    return "Cadastro marcado como revisado.";
  });
}

/** Transição de ramo: marca o início (hoje ou na data informada) ou desmarca (`clear`). */
export async function setTransition(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    const clear = text(formData, "clear") === "1";
    await associates.setTransition(db, id(formData, "id"), clear ? null : date(formData, "date", "a data de início", true));
    revalidate();
    revalidatePath("/");
    return clear ? "Marca de transição removida." : "Transição marcada como iniciada.";
  });
}

/** Passagem: ramo seguinte (com seção e equipe dele) a partir de uma data. */
export async function moveAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    await associates.move(db, { id: associateId, date: date(formData, "date", "a data da passagem", true), ...placement(formData) });
    revalidate();
    return "Passagem registrada.";
  });
}

export async function leaveAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    await associates.leave(db, associateId, date(formData, "date", "a data do desligamento", true), notes(formData, "reason", 120));
    revalidate();
    return { success: "Associado desligado.", tone: "neutral" };
  });
}

export async function rejoinAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    await associates.rejoin(db, associateId, date(formData, "date", "a data do reingresso", true), notes(formData, "reason", 120));
    revalidate();
    return "Reingresso registrado.";
  });
}

// Funções do adulto (041): escotista (de uma seção, 052) ou dirigente, com cargo opcional; a função SQL recusa jovens.

function functionInput(data: FormData): functions.FunctionInput {
  const kind = text(data, "kind");
  if (!isFunctionKind(kind)) throw new InputError("Escolha o tipo da função.");
  const sectionId = kind === "escotista" ? optionalId(data, "sectionId") : null;
  if (kind === "escotista" && !sectionId) throw new InputError("Escolha a seção do escotista.");
  return { kind, sectionId, title: notes(data, "title", 80), startedOn: date(data, "startedOn", "o início da função", true), elected: kind === "dirigente" && data.get("elected") === "on" };
}

export async function addFunction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    await functions.add(db, id(formData, "associateId"), functionInput(formData));
    revalidate();
    return "Função adicionada.";
  });
}

/** Edita tipo, seção, cargo e datas; fim vazio = em exercício. */
export async function updateFunction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    await functions.update(db, id(formData, "functionId"), { ...functionInput(formData), endedOn: date(formData, "endedOn", "o fim da função") });
    revalidate();
    return "Função salva.";
  });
}

export async function endFunction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    await functions.end(db, id(formData, "functionId"), date(formData, "endedOn", "o fim da função", true));
    revalidate();
    return { success: "Função encerrada.", tone: "neutral" };
  });
}

export async function deleteFunction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    await functions.remove(db, id(formData, "functionId"));
    revalidate();
    return { success: "Função apagada.", tone: "neutral" };
  });
}

// Responsáveis do jovem (041): parentesco (descrição obrigatória quando "outro"), legal e financeiro. A função SQL
// recusa adultos e responsável repetido no mesmo jovem.

function linkInput(data: FormData): relatives.LinkInput {
  const kinship = text(data, "kinship");
  if (!isKinship(kinship)) throw new InputError("Escolha o parentesco.");
  const kinshipNote = kinship === "outro" ? text(data, "kinshipNote") || null : null;
  const error = kinshipNoteError(kinship, kinshipNote);
  if (error) throw new InputError(error);
  return { kinship, kinshipNote, legal: data.get("legal") === "on", financial: data.get("financial") === "on" };
}

export async function addRelative(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    const input = linkInput(formData);
    const existing = optionalId(formData, "relativeId");
    if (existing) {
      await relatives.link(db, associateId, existing, input);
      revalidate();
      return "Responsável vinculado.";
    }
    const relativeName = name(formData);
    await relatives.create(db, associateId, { ...input, name: relativeName, relativeAssociateId: optionalId(formData, "relativeAssociateId") });
    revalidate();
    return `Responsável “${relativeName}” adicionado.`;
  });
}

/** Edita o vínculo (parentesco, legal, financeiro) e o responsável (nome, associado, observações). */
export async function updateRelative(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    const input = linkInput(formData);
    const relativeName = name(formData);
    await relatives.updateLink(db, id(formData, "linkId"), input);
    await relatives.rename(db, id(formData, "relativeId"), relativeName, optionalId(formData, "relativeAssociateId"), notes(formData, "notes", 200));
    revalidate();
    return `Responsável “${relativeName}” salvo.`;
  });
}

export async function unlinkRelative(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesWriterOrError, async ({ db }) => {
    await relatives.unlink(db, id(formData, "linkId"));
    revalidate();
    return { success: "Responsável desvinculado.", tone: "neutral" };
  });
}
