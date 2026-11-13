"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export type ActionResult = { error?: string; success?: string; tone?: "success" | "neutral" };

/**
 * Mostra o resultado de uma Server Action (useActionState) como toast:
 * erro em vermelho, sucesso em verde e `tone: "neutral"` (ex.: inativação) em cinza.
 */
export function useActionToast(state: ActionResult) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.success) (state.tone === "neutral" ? toast.info : toast.success)(state.success);
    // dispara uma vez por resultado: useActionState devolve um objeto novo a cada envio
  }, [state]);
}
