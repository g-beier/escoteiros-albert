"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { isControlStatus, statusLabels } from "@/lib/associates/controls";
import * as controls from "@/lib/server/associates/controls";
import { associatesWriterOrError } from "@/lib/server/session";
import { date, id, notes, text } from "../form-data";

// Situação de um item para um associado ou um responsável (041). Item inativo e público que não se aplica: recusados
// na função SQL.

/** Pessoa da situação: `relativeId` (responsável) ou `associateId`. */
const person = (data: FormData) => (text(data, "relativeId") ? { id: id(data, "relativeId"), relative: true } : { id: id(data, "associateId"), relative: false });

const editor = () => associatesWriterOrError("Sem permissão para alterar o controle de dados.");

export async function setControlStatus(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(editor, async ({ db }) => {
    // em branco: o item mostra um valor (ano ou data) e ele foi informado; a função SQL marca ok ou recusa
    const status = text(formData, "status") || null;
    if (status !== null && !isControlStatus(status)) throw new InputError("Escolha a situação.");
    const year = text(formData, "valueYear");
    const valueYear = year ? Number(year) : null;
    if (valueYear !== null && (!Number.isInteger(valueYear) || valueYear < 1900 || valueYear > 2100)) throw new InputError("Ano: de 1900 a 2100.");
    await controls.setStatus(db, {
      person: person(formData), itemId: id(formData, "itemId"), status,
      statusDate: date(formData, "statusDate", "a data da situação"), validUntil: date(formData, "validUntil", "a validade"),
      valueYear, note: notes(formData, "note", 200),
    });
    revalidatePath("/associados", "layout");
    return `Situação salva: ${statusLabels[status ?? "ok"]}.`;
  });
}

export async function clearControlStatus(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  return runAction(editor, async ({ db }) => {
    await controls.clearStatus(db, person(formData), id(formData, "itemId"));
    revalidatePath("/associados", "layout");
    return { success: "Situação apagada: sem registro.", tone: "neutral" };
  });
}
