"use client";

import { useActionState } from "react";
import { IconBolt, IconCheck } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { reviewAssociate } from "@/app/(associados)/associados/actions";

/** Aviso no cadastro feito pelo registro rápido: a Secretaria confere, completa e marca como revisado. */
export function ReviewNotice({ associateId, canEdit }: { associateId: string; canEdit: boolean }) {
  const [state, action, pending] = useActionState(reviewAssociate, {} as ActionResult);
  useActionToast(state);
  return <form action={action} role="note" className="flex flex-wrap items-center gap-3 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-sm">
    <input type="hidden" name="id" value={associateId} />
    <IconBolt className="size-5 shrink-0 text-caution" aria-hidden />
    <p className="m-0 min-w-0 flex-1"><strong>Para revisar.</strong> Cadastrado pelo registro rápido: confira nome, divisão e datas e marque como revisado.</p>
    {canEdit && <Button type="submit" variant="outline" disabled={pending}><IconCheck data-icon="inline-start" /> {pending ? "Marcando…" : "Marcar como revisado"}</Button>}
  </form>;
}
