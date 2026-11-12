"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconArrowsExchange, IconX } from "@tabler/icons-react";
import { moveEntriesAccount } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { OptionSelect, type Option } from "@/components/option-controls";
import { useEntrySelection } from "./entry-editor";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Barra que aparece com lançamentos marcados: move todos para a conta escolhida
 * (ex.: tirar de "A definir"). Conciliados em outra conta perdem o vínculo com o extrato.
 */
export function BulkAccountBar({ accounts }: { accounts: Option[] }) {
  const { canEdit, selected, clearSelection, override } = useEntrySelection();
  const [accountId, setAccountId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!canEdit || selected.size === 0) return null;

  const target = accounts.find((account) => account.value === accountId);
  const entries = [...selected.entries()];
  const moving = target ? entries.filter(([, entry]) => entry.accountName !== target.label) : [];
  const unlinking = moving.filter(([, entry]) => entry.reconciled).length;

  function move() {
    if (!target) return;
    startTransition(async () => {
      const result = await moveEntriesAccount(entries.map(([id]) => id), target.value);
      if (result.error) { toast.error(result.error); return; }
      for (const [id, entry] of moving) override(id, { accountName: target.label, ...(entry.reconciled && { reconciled: false }) });
      const parts = [`${plural(result.moved ?? 0, "lançamento movido", "lançamentos movidos")} para ${target.label}`];
      if (result.unchanged) parts.push(`${plural(result.unchanged, "já estava", "já estavam")} nela`);
      if (result.unlinked) parts.push(`${plural(result.unlinked, "conciliação desfeita", "conciliações desfeitas")}`);
      toast.success(`${parts.join("; ")}.`);
      setConfirming(false);
      clearSelection();
      setAccountId("");
      router.refresh();
    });
  }

  return <section aria-label="Ações em lote" className="flex flex-wrap items-end gap-2 rounded-lg border border-primary bg-accent/40 px-3 py-2">
    <p className="m-0 self-center text-sm font-semibold">{plural(selected.size, "lançamento selecionado", "lançamentos selecionados")}</p>
    <div className="grid gap-1">
      <Label htmlFor="bulk-account">Mover para a conta</Label>
      <OptionSelect id="bulk-account" value={accountId} onValueChange={setAccountId} options={accounts} placeholder="Escolha a conta…" className="h-8" />
    </div>
    <Button disabled={!target || pending} onClick={() => (unlinking ? setConfirming(true) : move())}><IconArrowsExchange /> {pending ? "Movendo…" : "Mover"}</Button>
    <Button variant="ghost" onClick={clearSelection} disabled={pending}><IconX /> Limpar seleção</Button>
    <Dialog open={confirming} onOpenChange={(open) => { if (!open) setConfirming(false); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desfazer conciliações?</DialogTitle>
          <DialogDescription>
            {plural(unlinking, "lançamento selecionado está conciliado", "lançamentos selecionados estão conciliados")} com o extrato de outra conta.
            Ao mudar a conta, o vínculo é desfeito e as linhas do extrato voltam a ficar abertas na conciliação. A alteração fica registrada na auditoria.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button>
          <Button onClick={move} disabled={pending}>{pending ? "Movendo…" : `Mover ${plural(moving.length, "lançamento", "lançamentos")}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
