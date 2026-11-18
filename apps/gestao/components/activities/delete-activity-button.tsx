"use client";

import { useActionState } from "react";
import { Button } from "@geas/ui/components/button";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { deleteActivity } from "@/app/(atividades)/atividades/actions";

export function DeleteActivityButton({ id, title }: { id: string; title: string }) {
  const [state, action, pending] = useActionState(deleteActivity, {} as ActionResult);
  useActionToast(state);

  return <form action={action}>
    <input type="hidden" name="id" value={id} />
    <Button
      type="submit"
      disabled={pending}
      className="cursor-pointer bg-[#e2445c] text-white hover:bg-[#c93a4f] focus-visible:border-[#e2445c]/40 focus-visible:ring-[#e2445c]/30"
      onClick={(event) => {
        if (!window.confirm(`Excluir “${title}”? Esta ação não tem volta.`)) event.preventDefault();
      }}>
      {pending ? "Excluindo…" : "Excluir"}
    </Button>
  </form>;
}
