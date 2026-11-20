"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { date, id, notes, optionalId, text } from "./form-data";
import { isFunctionKind } from "@/lib/associates/controls";
import { isScoutBranch, type ScoutBranch } from "@/lib/associates/model";
import { isKinship, kinshipNoteError } from "@/lib/associates/relatives";
import * as associates from "@/lib/server/associates/associates";
import * as functions from "@/lib/server/associates/functions";
import * as relatives from "@/lib/server/associates/relatives";
import { associatesEditorOrError } from "@/lib/server/session";

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
  const result = await runAction(associatesEditorOrError, async ({ db, groupId }) => {
    const editing = optionalId(formData, "id");
    if (editing) {
      await associates.update(db, { id: editing, name: name(formData), notes: notes(formData), ...dates(formData) });
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

/** Passagem: novo ramo, seção ou equipe a partir de uma data. */
export async function moveAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    await associates.move(db, { id: associateId, date: date(formData, "date", "a data da passagem", true), ...placement(formData) });
    revalidate();
    return "Passagem registrada.";
  });
}

export async function leaveAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    await associates.leave(db, associateId, date(formData, "date", "a data do desligamento", true), notes(formData, "reason", 120));
    revalidate();
    return { success: "Associado desligado.", tone: "neutral" };
  });
}

export async function rejoinAssociate(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    await associates.rejoin(db, associateId, date(formData, "date", "a data do reingresso", true), notes(formData, "reason", 120));
    revalidate();
    return "Reingresso registrado.";
  });
}

// Funções do adulto (041): escotista ou dirigente, com cargo opcional; a função SQL recusa jovens.

export async function addFunction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    const associateId = id(formData, "associateId");
    const kind = text(formData, "kind");
    if (!isFunctionKind(kind)) throw new InputError("Escolha escotista ou dirigente.");
    const title = notes(formData, "title", 80);
    await functions.add(db, associateId, kind, title, date(formData, "startedOn", "o início da função", true));
    revalidate();
    return "Função adicionada.";
  });
}

export async function endFunction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    await functions.end(db, id(formData, "functionId"), date(formData, "endedOn", "o fim da função", true));
    revalidate();
    return { success: "Função encerrada.", tone: "neutral" };
  });
}

export async function deleteFunction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
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
  return runAction(associatesEditorOrError, async ({ db }) => {
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
  return runAction(associatesEditorOrError, async ({ db }) => {
    const input = linkInput(formData);
    const relativeName = name(formData);
    await relatives.updateLink(db, id(formData, "linkId"), input);
    await relatives.rename(db, id(formData, "relativeId"), relativeName, optionalId(formData, "relativeAssociateId"), notes(formData, "notes", 200));
    revalidate();
    return `Responsável “${relativeName}” salvo.`;
  });
}

export async function unlinkRelative(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(associatesEditorOrError, async ({ db }) => {
    await relatives.unlink(db, id(formData, "linkId"));
    revalidate();
    return { success: "Responsável desvinculado.", tone: "neutral" };
  });
}
