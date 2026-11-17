"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@geas/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { toast } from "sonner";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";

export type FormAction = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * Diálogo com formulário de uma Server Action: mostra o resultado como toast e fecha quando dá certo.
 * O toast sai daqui (e não de useActionToast) porque o diálogo desmonta ao fechar, antes do efeito rodar.
 * Os campos ocultos (`hidden`) levam os ids; `children` são os campos visíveis (grade de 2 colunas).
 */
export function ActionDialog({ open, onOpenChange, title, description, action, submitLabel, hidden, children, destructive }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode;
  action: FormAction; submitLabel: string; hidden: Record<string, string>; children: ReactNode; destructive?: boolean;
}) {
  const [, formAction, pending] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.error) toast.error(result.error);
    else if (result.success) {
      toast.success(result.success);
      onOpenChange(false);
    }
    return result;
  }, {});
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[min(36rem,calc(100%-2rem))]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <form action={formAction} className="grid gap-3">
        {Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>{pending ? "Salvando…" : submitLabel}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
