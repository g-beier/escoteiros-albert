"use client";

import { useActionState, useTransition } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { createCatalogItem, setPaymentMethodDefaultAccount, updateCatalogItem, type CatalogFormState } from "@/app/(financeiro)/financeiro/configuracoes/actions";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import type { CatalogKind } from "@/lib/finance/catalogs";
import { useActionToast } from "@geas/ui/lib/use-action-toast";
import { Badge } from "@geas/ui/components/badge";
import { cn } from "@geas/ui/lib/utils";
import { ActionForm } from "@geas/ui/components/action-form";

type Item = {
  id: string; name: string; active: boolean; usage: number;
  /** Conta usada quando o lançamento não informa outra. */
  defaultAccountId?: string | null;
};
const initial: CatalogFormState = {};

/** Cadastro simples com nome e ativação (formas de pagamento). Rubricas têm a própria tela: `categories-manager`. */
export function CatalogManager({ kind, title, singular, maxLength, items, canEdit, accounts }: { kind: CatalogKind; title: string; singular: string; maxLength: number; items: Item[]; canEdit: boolean; accounts?: Option[] }) {
  const [state, action, pending] = useActionState(createCatalogItem, initial);
  useActionToast(state);
  return <SectionCard aria-labelledby={`${kind}-title`}>
    <SectionHeader title={title} titleId={`${kind}-title`}>
      <SectionCount>{items.filter((i) => i.active).length} ativas de {items.length}</SectionCount>
    </SectionHeader>
    {canEdit && <ActionForm action={action} result={state} className="grid gap-2 border-b p-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-48 flex-1 gap-1.5"><Label htmlFor={`${kind}-new`}>Nova {singular}</Label><Input id={`${kind}-new`} name="name" maxLength={maxLength} required /></div>
        <Button type="submit" disabled={pending}><IconPlus data-icon="inline-start" /> Adicionar</Button>
      </div>
    </ActionForm>}
    <Table>
      <TableCaption className="sr-only">{title} do grupo</TableCaption>
      <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className="h-8 px-3">Nome</TableHead>
        {accounts && <TableHead className="h-8 px-3">Conta padrão</TableHead>}
        <TableHead className="h-8 px-3 text-right">Uso</TableHead>
        <TableHead className="h-8 px-3">Status</TableHead>
      </TableRow></TableHeader>
      <TableBody>{items.map((item) => <CatalogRow key={item.id} kind={kind} item={item} maxLength={maxLength} canEdit={canEdit} accounts={accounts} />)}</TableBody>
    </Table>
  </SectionCard>;
}

function CatalogRow({ kind, item, maxLength, canEdit, accounts }: { kind: CatalogKind; item: Item; maxLength: number; canEdit: boolean; accounts?: Option[] }) {
  const [renameState, rename, renaming] = useActionState(updateCatalogItem, initial);
  const [toggleState, toggle, toggling] = useActionState(updateCatalogItem, initial);
  useActionToast(renameState);
  useActionToast(toggleState);
  const status = <Badge size="md" variant={item.active ? "success" : "muted"}>{item.active ? "Ativa" : "Inativa"}</Badge>;
  const save = <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Salvar ${item.name}`} disabled={renaming}><IconCheck /></Button>;
  return <TableRow className={cn(!item.active && "text-muted-foreground")}>
    <TableCell className="px-3 py-1">
      {canEdit ? <ActionForm action={rename} result={renameState} className="flex items-center gap-1.5">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={item.id} />
        {/* rótulo visível: cabeçalho da coluna; este nomeia o campo de cada linha para leitores de tela */}
        <Label htmlFor={`${kind}-${item.id}`} className="sr-only">Nome de {item.name}</Label>
        <Input id={`${kind}-${item.id}`} name="name" defaultValue={item.name} maxLength={maxLength} required className="max-w-md" />
        {save}
      </ActionForm> : item.name}
    </TableCell>
    {accounts && <TableCell className="px-3 py-1"><DefaultAccount item={item} accounts={accounts} canEdit={canEdit} /></TableCell>}
    <TableCell className="px-3 py-1 text-right num" title="Lançamentos que usam este cadastro">{item.usage}</TableCell>
    <TableCell className="px-3 py-1">
      <div className="flex items-center gap-2">{status}
        {canEdit && <form action={toggle}>
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="active" value={String(!item.active)} />
          <Button type="submit" variant="outline" size="sm" disabled={toggling}>{item.active ? "Inativar" : "Reativar"}</Button>
        </form>}
      </div>
    </TableCell>
  </TableRow>;
}

/** Conta sugerida nos lançamentos desta forma de pagamento (ex.: Dinheiro → Caixa). */
function DefaultAccount({ item, accounts, canEdit }: { item: Item; accounts: Option[]; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const value = item.defaultAccountId ?? "";
  if (!canEdit) return <>{accounts.find((a) => a.value === value)?.label ?? "—"}</>;
  return <OptionSelect
    aria-label={`Conta padrão de ${item.name}`}
    className="h-7 max-w-56"
    value={value}
    emptyLabel="Nenhuma"
    options={accounts}
    disabled={pending}
    onValueChange={(accountId) => startTransition(async () => {
      const result = await setPaymentMethodDefaultAccount(item.id, accountId);
      if (result.error) toast.error(result.error);
      else if (result.success) (result.tone === "neutral" ? toast.info : toast.success)(result.success);
    })}
  />;
}
