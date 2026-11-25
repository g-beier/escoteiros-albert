"use client";

import { useActionState } from "react";
import { IconRestore } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { toast } from "sonner";
import { cn } from "@geas/ui/lib/utils";
import { cancelDeletion } from "@/app/(associados)/associados/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import { dateBR } from "@/lib/format";
import { branchLabels, type QuarantinedAssociate } from "@/lib/associates/model";

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** Quarentena (Configurações › Excluídos): quem, por quê, quem pediu, quando sai de vez, e Restaurar. */
export function QuarantineList({ items, today }: { items: QuarantinedAssociate[]; today: string }) {
  return <SectionCard aria-labelledby="quarantine-title">
    <SectionHeader title="Exclusões pedidas" titleId="quarantine-title">
      <SectionCount>{items.length} {items.length === 1 ? "cadastro" : "cadastros"}</SectionCount>
    </SectionHeader>
    {items.length === 0
      ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum cadastro em quarentena.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[640px]">
        <TableCaption className="sr-only">Associados com exclusão pedida</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={HEAD_CLASS}>Associado</TableHead>
          <TableHead className={HEAD_CLASS}>Motivo</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-36")}>Pedido</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-36")}>Exclusão</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-32")}><span className="sr-only">Restaurar</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{items.map((item) => <QuarantineRow key={item.id} item={item} today={today} />)}</TableBody>
      </Table></div>}
  </SectionCard>;
}

function QuarantineRow({ item, today }: { item: QuarantinedAssociate; today: string }) {
  // Toast aqui (e não useActionToast): a linha some ao restaurar, antes do efeito rodar.
  const [, action, pending] = useActionState(async (previous: ActionResult, data: FormData) => {
    const result = await cancelDeletion(previous, data);
    if (result.error) toast.error(result.error);
    else if (result.success) toast.success(result.success);
    return result;
  }, {});
  const left = daysBetween(today, item.deletion_due_on);
  return <TableRow>
    <TableCell className={CELL_CLASS}>
      <div className="font-medium">{item.name}</div>
      <div className="text-xs text-muted-foreground">{branchLabels[item.branch]}{item.active ? "" : " · desligado"}</div>
    </TableCell>
    <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>{item.deletion_reason ?? "—"}</TableCell>
    <TableCell className={CELL_CLASS}>
      <div className="num">{dateBR(item.deletion_requested_at.slice(0, 10))}</div>
      {item.requested_by && <div className="truncate text-xs text-muted-foreground" title={item.requested_by}>{item.requested_by}</div>}
    </TableCell>
    <TableCell className={CELL_CLASS}>
      <div className="num">{dateBR(item.deletion_due_on)}</div>
      <div className="text-xs text-muted-foreground">{left > 1 ? `em ${left} dias` : left === 1 ? "amanhã" : "na próxima manutenção"}</div>
    </TableCell>
    <TableCell className={CELL_CLASS}>
      <form action={action}>
        <input type="hidden" name="associateId" value={item.id} />
        <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Restaurar ${item.name}`}><IconRestore data-icon="inline-start" /> Restaurar</Button>
      </form>
    </TableCell>
  </TableRow>;
}
