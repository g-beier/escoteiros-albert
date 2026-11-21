"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { hasSections, SCOUT_BRANCHES } from "@/lib/associates/model";
import * as sections from "@/lib/server/associates/sections";
import { associatesEditorOrError } from "@/lib/server/session";

// Seções e equipes (028–030): as regras de ramo e de quem se divide em equipes ficam nas funções SQL.

function valid<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }, fallback = "Dados inválidos."): T {
  if (!result.success) throw new InputError(result.error.issues[0]?.message ?? fallback);
  return result.data;
}

const sectionName = z.string().trim().min(2, "Informe um nome com 2 a 60 caracteres.").max(60, "Informe um nome com 2 a 60 caracteres.");
const editor = () => associatesEditorOrError("Sem permissão para gerir seções.");

function revalidate() {
  revalidatePath("/associados", "layout");
}

export async function createSection(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(editor, async ({ db, groupId }) => {
    const branch = valid(z.enum(SCOUT_BRANCHES, { message: "Escolha o ramo da seção." }).safeParse(formData.get("branch")));
    if (!hasSections(branch)) throw new InputError("Adultos não têm seção: são só o ramo.");
    const name = valid(sectionName.safeParse(formData.get("name") ?? ""));
    await sections.createSection(db, groupId, branch, name);
    revalidate();
    return `Seção “${name}” cadastrada.`;
  });
}

/** Renomeia (campo `name`) ou ativa/inativa (campo `active`) uma seção ou equipe. */
export async function updateSectionOrPatrol(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(editor, async ({ db }) => {
    const kind = formData.get("kind") === "patrol" ? "patrol" : "section";
    const name = valid(sectionName.safeParse(formData.get("name") ?? ""));
    const id = valid(z.uuid().safeParse(formData.get("id")), "Cadastro inválido.");
    const active = formData.has("active") ? formData.get("active") === "true" : null;
    await (kind === "patrol" ? sections.updatePatrol : sections.updateSection)(db, id, name, active);
    revalidate();
    const label = kind === "patrol" ? "Equipe" : "Seção";
    if (active === null) return `${label} “${name}” salva.`;
    return { success: `${label} “${name}” ${active ? "reativada" : "inativada"}.`, ...(active ? {} : { tone: "neutral" as const }) };
  });
}

export async function createPatrol(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(editor, async ({ db }) => {
    const sectionId = valid(z.uuid().safeParse(formData.get("sectionId")), "Seção inválida.");
    const name = valid(sectionName.safeParse(formData.get("name") ?? ""));
    await sections.createPatrol(db, sectionId, name);
    revalidate();
    return `Equipe “${name}” cadastrada.`;
  });
}
