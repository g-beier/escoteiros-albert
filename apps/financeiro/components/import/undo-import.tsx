"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconArrowBackUp } from "@tabler/icons-react";
import { deleteStatementImport } from "@/app/extrato/importar/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Desfaz uma importação inteira (ex.: extrato importado na conta errada). */
export function UndoImport({ importId, fileName, lineCount }: { importId: string; fileName: string; lineCount: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const confirm = () => startTransition(async () => {
    const result = await deleteStatementImport(importId);
    if (result.error) { toast.error(result.error); return; }
    toast.success(result.success);
    setOpen(false);
    router.refresh();
  });
  return <>
    <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><IconArrowBackUp /> Desfazer</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desfazer esta importação?</DialogTitle>
          <DialogDescription>
            As {lineCount} {lineCount === 1 ? "linha" : "linhas"} de “{fileName}” saem do extrato. Conciliações dessas linhas são desfeitas;
            os lançamentos continuam, só voltam a ficar pendentes. Use quando o extrato foi importado na conta errada ou para reimportar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={pending} onClick={confirm}>{pending ? "Desfazendo…" : "Desfazer importação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
