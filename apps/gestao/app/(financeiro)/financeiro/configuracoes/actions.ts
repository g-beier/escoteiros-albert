"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { CATALOG_KINDS, isCatalogKind, type CatalogKind } from "@/lib/finance/catalogs";
import { parseLedgerCode } from "@/lib/finance/ledger-code";
import { readAccountForm } from "@/lib/finance/accounts";
import * as registry from "@/lib/server/finance/registry";
import { financeEditorOrError } from "@/lib/server/session";

export type CatalogFormState = ActionResult;

const editor = () => financeEditorOrError("Sem permissão para alterar cadastros.");
const profileEditor = () => financeEditorOrError("Sem permissão para alterar perfis de leitura.");

/** Primeira mensagem de uma validação zod, como erro para o usuário. */
function valid<T>(result: { success: true; data: T } | { success: false; error: z.ZodError }, fallback = "Dados inválidos."): T {
  if (!result.success) throw new InputError(result.error.issues[0]?.message ?? fallback);
  return result.data;
}

function readKind(formData: FormData): CatalogKind {
  const kind = formData.get("kind");
  if (!isCatalogKind(kind)) throw new InputError("Cadastro inválido.");
  return kind;
}

const readName = (formData: FormData, kind: CatalogKind) =>
  valid(z.string().trim().min(2, "Informe um nome com ao menos 2 caracteres.").max(CATALOG_KINDS[kind].maxLength).safeParse(formData.get("name") ?? ""));
const readId = (value: FormDataEntryValue | null, message: string) => valid(z.uuid().safeParse(value), message);

function revalidate() {
  revalidatePath("/financeiro/configuracoes", "layout");
  revalidatePath("/", "layout");
}

// Formas de pagamento (014)

export async function createCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  return runAction(editor, async ({ db, groupId }) => {
    const name = readName(formData, readKind(formData));
    await registry.createPaymentMethod(db, groupId, name);
    revalidate();
    return `“${name}” cadastrada.`;
  });
}

/** Ativa/inativa (campo `active`) ou renomeia. */
export async function updateCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  return runAction(editor, async ({ db }) => {
    const kind = readKind(formData);
    const id = readId(formData.get("id"), "Cadastro inválido.");
    if (formData.has("active")) {
      const active = formData.get("active") === "true";
      await registry.setPaymentMethodActive(db, id, active);
      revalidate();
      return active ? { success: "Forma de pagamento reativada." } : { success: "Forma de pagamento inativada.", tone: "neutral" };
    }
    const name = readName(formData, kind);
    await registry.renamePaymentMethod(db, id, name);
    revalidate();
    return `“${name}” salva.`;
  });
}

/** Conta padrão da forma de pagamento; `accountId` vazio remove o padrão. */
export async function setPaymentMethodDefaultAccount(paymentMethodId: unknown, accountId: unknown): Promise<CatalogFormState> {
  return runAction(editor, async ({ db }) => {
    const method = valid(z.uuid().safeParse(paymentMethodId));
    const account = valid(z.union([z.uuid(), z.literal("")]).safeParse(accountId));
    await registry.setPaymentMethodDefaultAccount(db, method, account || null);
    revalidate();
    return account ? { success: "Conta padrão salva." } : { success: "Conta padrão removida.", tone: "neutral" };
  });
}

// Rubricas: a tela edita a árvore como rascunho (lib/finance/category-draft.ts) e grava tudo de uma vez (036).

const treeSchema = z.object({
  nodes: z.array(z.object({
    key: z.string().min(1).max(64), id: z.uuid().nullable(), parent: z.string().min(1).max(64),
    position: z.number().int().min(0), name: z.string().trim().min(2, "Toda rubrica precisa de um nome com ao menos 2 caracteres.").max(100),
    ledgerCode: z.string().nullable(), active: z.boolean(),
  })).max(2000),
  deleted: z.array(z.object({ id: z.uuid(), target: z.string().max(64).nullable() })).max(2000),
});

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export async function saveCategoryTree(payload: unknown): Promise<CatalogFormState> {
  return runAction(editor, async ({ db, groupId }) => {
    const tree = valid(treeSchema.safeParse(payload));
    for (const node of tree.nodes) {
      const ledgerCode = parseLedgerCode(node.ledgerCode);
      if (!ledgerCode.ok) throw new InputError(`“${node.name}”: ${ledgerCode.error}`);
    }
    const { splits, entries } = await registry.saveCategoryTree(db, groupId, tree.nodes, tree.deleted);
    revalidate();
    return splits
      ? `Rubricas salvas. ${plural(splits, "rateio", "rateios")} de ${plural(entries, "lançamento", "lançamentos")} ${splits === 1 ? "mudou" : "mudaram"} de rubrica.`
      : "Rubricas salvas.";
  });
}

// Contas (create_account/update_account/set_account_active)

export async function createAccount(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  return runAction(editor, async ({ db, groupId }) => {
    const account = valid(readAccountForm(formData));
    await registry.createAccount(db, groupId, account);
    revalidate();
    return `Conta “${account.name}” cadastrada.`;
  });
}

export async function updateAccount(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  return runAction(editor, async ({ db }) => {
    const id = readId(formData.get("id"), "Conta inválida.");
    const account = valid(readAccountForm(formData));
    await registry.updateAccount(db, id, account);
    revalidate();
    return `Conta “${account.name}” salva.`;
  });
}

export async function setAccountActive(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  return runAction(editor, async ({ db }) => {
    const id = readId(formData.get("id"), "Conta inválida.");
    const active = formData.get("active") === "true";
    await registry.setAccountActive(db, id, active);
    revalidate();
    return active ? { success: "Conta reativada." } : { success: "Conta inativada.", tone: "neutral" };
  });
}

// Perfis de leitura do extrato (026)

export async function renameImportProfile(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  return runAction(profileEditor, async ({ db }) => {
    const id = readId(formData.get("id"), "Perfil inválido.");
    const name = valid(z.string().trim().min(2, "Informe um nome de perfil com ao menos 2 caracteres.").max(80, "Use até 80 caracteres.").safeParse(formData.get("name") ?? ""));
    await registry.renameImportProfile(db, id, name);
    revalidate();
    return `Perfil “${name}” salvo.`;
  });
}

export async function deleteImportProfile(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  return runAction(profileEditor, async ({ db }) => {
    const id = readId(formData.get("id"), "Perfil inválido.");
    await registry.deleteImportProfile(db, id);
    revalidate();
    return { success: "Perfil excluído. As importações feitas com ele continuam.", tone: "neutral" };
  });
}
