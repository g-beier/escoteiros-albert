"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { hasSections, SCOUT_BRANCHES } from "@/lib/finance/associates";
import * as associates from "@/lib/server/finance/associates";
import { financeEditorOrError } from "@/lib/server/session";

export type AssociateFormState = ActionResult;

/** Id opcional vindo de um select ("" = nenhum). */
const optionalId = z.string().trim().transform((value) => value || null).pipe(z.uuid().nullable());

const associateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome (mínimo 2 caracteres).").max(120),
  branch: z.enum(SCOUT_BRANCHES, { message: "Escolha o ramo." }),
  section_id: optionalId,
  patrol_id: optionalId,
}).refine((data) => !data.patrol_id || data.section_id, { message: "Escolha a seção antes da equipe." });

function valid<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }, fallback = "Dados inválidos."): T {
  if (!result.success) throw new InputError(result.error.issues[0]?.message ?? fallback);
  return result.data;
}

const readAssociate = (formData: FormData) => valid(associateSchema.safeParse({
  name: formData.get("name") ?? "", branch: formData.get("branch") ?? "",
  section_id: formData.get("sectionId") ?? "", patrol_id: formData.get("patrolId") ?? "",
}));

const editor = () => financeEditorOrError("Sem permissão para gerir associados.");
const sectionEditor = () => financeEditorOrError("Sem permissão para gerir seções.");

function revalidate() {
  revalidatePath("/financeiro/configuracoes/associados");
  revalidatePath("/", "layout");
}

export async function createAssociate(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  return runAction(editor, async ({ db, groupId }) => {
    const associate = readAssociate(formData);
    await associates.createAssociate(db, groupId, associate);
    revalidate();
    return `${associate.name} cadastrado.`;
  });
}

export async function updateAssociate(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  return runAction(editor, async ({ db, groupId }) => {
    const id = valid(z.uuid().safeParse(formData.get("id")));
    if (formData.has("active")) {
      const active = formData.get("active") === "true";
      await associates.updateAssociate(db, groupId, id, { active });
      revalidate();
      return active ? { success: "Associado reativado." } : { success: "Associado inativado.", tone: "neutral" };
    }
    const associate = readAssociate(formData);
    await associates.updateAssociate(db, groupId, id, associate);
    revalidate();
    return `${associate.name} salvo.`;
  });
}

const importRow = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  branch: z.enum(SCOUT_BRANCHES),
  section: z.string().trim().max(60).nullable().optional(),
  patrol: z.string().trim().max(60).nullable().optional(),
  active: z.boolean(),
});

/** Importação em massa (CSV lido no navegador): cadastra novos e, com `id`, atualiza ramo, seção e status. Tudo ou nada. */
export async function importAssociates(rows: unknown): Promise<AssociateFormState> {
  return runAction(editor, async ({ db, groupId }) => {
    const parsed = valid(z.array(importRow).min(1, "Nenhum associado para importar.").max(5000, "Importe no máximo 5.000 associados por vez.").safeParse(rows));
    const result = await associates.importAssociates(db, groupId, parsed);
    revalidate();
    const parts = [
      result.created && `${result.created} ${result.created === 1 ? "cadastrado" : "cadastrados"}`,
      result.updated && `${result.updated} ${result.updated === 1 ? "atualizado" : "atualizados"}`,
    ].filter(Boolean);
    return `Associados importados: ${parts.join(", ")}.`;
  });
}

// Seções e equipes (028–030)

const sectionName = z.string().trim().min(2, "Informe um nome com 2 a 60 caracteres.").max(60, "Informe um nome com 2 a 60 caracteres.");

export async function createSection(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  return runAction(sectionEditor, async ({ db, groupId }) => {
    const branch = valid(z.enum(SCOUT_BRANCHES, { message: "Escolha o ramo da seção." }).safeParse(formData.get("branch")));
    if (!hasSections(branch)) throw new InputError("Adultos não têm seção: são só o ramo.");
    const name = valid(sectionName.safeParse(formData.get("name") ?? ""));
    await associates.createSection(db, groupId, branch, name);
    revalidate();
    return `Seção “${name}” cadastrada.`;
  });
}

/** Renomeia (campo `name`) ou ativa/inativa (campo `active`) uma seção ou equipe. */
export async function updateSectionOrPatrol(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  return runAction(sectionEditor, async ({ db }) => {
    const kind = formData.get("kind") === "patrol" ? "patrol" : "section";
    const name = valid(sectionName.safeParse(formData.get("name") ?? ""));
    const id = valid(z.uuid().safeParse(formData.get("id")), "Cadastro inválido.");
    const active = formData.has("active") ? formData.get("active") === "true" : null;
    await (kind === "patrol" ? associates.updatePatrol : associates.updateSection)(db, id, name, active);
    revalidate();
    const label = kind === "patrol" ? "Equipe" : "Seção";
    if (active === null) return `${label} “${name}” salva.`;
    return { success: `${label} “${name}” ${active ? "reativada" : "inativada"}.`, ...(active ? {} : { tone: "neutral" as const }) };
  });
}

export async function createPatrol(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  return runAction(sectionEditor, async ({ db }) => {
    const sectionId = valid(z.uuid().safeParse(formData.get("sectionId")), "Seção inválida.");
    const name = valid(sectionName.safeParse(formData.get("name") ?? ""));
    // a regra de quem se divide em equipes fica em create_patrol (030_section_branch_rules.sql)
    await associates.createPatrol(db, sectionId, name);
    revalidate();
    return `Equipe “${name}” cadastrada.`;
  });
}
