import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { DataError } from "@/lib/server/db";
import type { Member } from "@/lib/server/session";

/** Entrada inválida (validação na action): a mensagem vai para o usuário. */
export class InputError extends Error {}

/**
 * Server Action padrão: confere a permissão (`guard`), executa e converte `InputError`/`DataError` em
 * `{ error }` para o `use-action-toast`. `work` devolve a mensagem de sucesso ou um `ActionResult` pronto.
 * Outros erros (inclusive o `redirect()` do Next) seguem adiante.
 */
export async function runAction(
  guard: () => Promise<Member | { error: string }>,
  work: (member: Member) => Promise<string | ActionResult | void>,
): Promise<ActionResult> {
  const member = await guard();
  if ("error" in member) return member;
  try {
    const result = await work(member);
    return typeof result === "string" ? { success: result } : result ?? {};
  } catch (error) {
    if (error instanceof InputError || error instanceof DataError) return { error: error.message };
    throw error;
  }
}
