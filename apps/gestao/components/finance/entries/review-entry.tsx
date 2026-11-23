"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { IconBolt, IconCheck } from "@tabler/icons-react";
import { reviewEntries } from "@/app/actions";
import { Button } from "@geas/ui/components/button";

/** Aviso no lançamento para revisar (registro rápido ou Colaborador): conferir, completar e marcar como revisado (Editor). */
export function ReviewEntryNotice({ entryId, canEdit }: { entryId: string; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  function review() {
    startTransition(async () => {
      const result = await reviewEntries([entryId]);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Lançamento marcado como revisado.");
    });
  }
  return <div role="note" className="flex flex-wrap items-center gap-3 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-sm">
    <IconBolt className="size-5 shrink-0 text-caution" aria-hidden />
    <p className="m-0 min-w-0 flex-1">
      <strong>Para revisar.</strong> Veio do registro rápido ou de um colaborador: confira valor, rubrica, conta e documento, complete o que faltar e marque como revisado.
    </p>
    {canEdit && <Button variant="outline" onClick={review} disabled={pending}><IconCheck data-icon="inline-start" /> {pending ? "Marcando…" : "Marcar como revisado"}</Button>}
  </div>;
}
