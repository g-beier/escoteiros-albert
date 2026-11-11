"use client";

import { useActionState, useTransition } from "react";
import Link from "next/link";
import { IconCheck, IconExternalLink, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { createCatalogItem, setPaymentMethodDefaultAccount, updateCatalogItem, type CatalogFormState } from "@/app/cadastros/actions";
import { OptionSelect, type Option } from "@/components/option-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CatalogKind } from "@/lib/catalogs";
import { useActionToast } from "@/lib/use-action-toast";
import { cn } from "@/lib/utils";

type Item = {
  id: string; name: string; active: boolean; usage: number;
  /** Só rubricas: código, tipo, nível, se é grupo e link para os rateios que a usam. */
  code?: string | null; kind?: "receita" | "despesa" | null; depth?: number; isGroup?: boolean; usageHref?: string;
  /** Só formas de pagamento: conta usada quando o lançamento não informa outra. */
  defaultAccountId?: string | null;
};
const initial: CatalogFormState = {};

export function CatalogManager({ kind, title, singular, maxLength, items, canEdit, accounts }: { kind: CatalogKind; title: string; singular: string; maxLength: number; items: Item[]; canEdit: boolean; accounts?: Option[] }) {
  const [state, action, pending] = useActionState(createCatalogItem, initial);
  useActionToast(state);
  return <section className="card" aria-labelledby={`${kind}-title`}>
    <header className="card-head"><h2 className="card-title" id={`${kind}-title`}>{title}</h2><span className="muted" style={{ fontSize: 12 }}>{items.filter((i) => i.active).length} ativas de {items.length}</span></header>
    {canEdit && <form action={action} className="grid gap-2 border-b p-3">
      <input type="hidden" name="kind" value={kind} />
      <Label htmlFor={kind === "categories" ? "categories-code" : `${kind}-new`}>Nova {singular}</Label>
      <div className="flex gap-2">
        {kind === "categories" && <><Label htmlFor="categories-code" className="sr-only">Código</Label><Input id="categories-code" name="code" placeholder="Código, ex.: 2.5.6" className="num w-40" required /></>}
        <Input id={`${kind}-new`} name="name" maxLength={maxLength} placeholder={kind === "categories" ? "Nome" : undefined} required />
        <Button type="submit" disabled={pending}><IconPlus /> Adicionar</Button>
      </div>
      {kind === "categories" && <p className="text-xs text-muted-foreground">O código define o tipo (1 = receita, 2 = despesa) e a rubrica pai: 2.5.6 fica dentro de 2.5 Pastelada.</p>}
    </form>}
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
  </section>;
}

function CatalogRow({ kind, item, maxLength, canEdit, accounts }: { kind: CatalogKind; item: Item; maxLength: number; canEdit: boolean; accounts?: Option[] }) {
  const [renameState, rename, renaming] = useActionState(updateCatalogItem, initial);
  const [toggleState, toggle, toggling] = useActionState(updateCatalogItem, initial);
  useActionToast(renameState);
  useActionToast(toggleState);
  const status = <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", item.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{item.active ? "Ativa" : "Inativa"}</span>;
  return <TableRow className={cn(!item.active && "text-muted-foreground")}>
    <TableCell className="px-3 py-1.5">
      {canEdit ? <form action={rename} className="flex items-center gap-1.5" style={{ paddingLeft: `${(item.depth ?? 0) * 1.25}rem` }}>
        {item.code !== undefined && <span className={cn("num w-12 shrink-0 text-right text-xs font-semibold", item.kind === "receita" ? "text-success" : item.kind === "despesa" ? "text-destructive" : "text-muted-foreground")}>{item.code ?? "—"}</span>}
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={item.id} />
        <Label htmlFor={`${kind}-${item.id}`} className="sr-only">Nome</Label>
        <Input id={`${kind}-${item.id}`} name="name" defaultValue={item.name} maxLength={maxLength} required className={cn("max-w-md", item.isGroup && "font-semibold")} />
        <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Salvar nome de ${item.name}`} disabled={renaming}><IconCheck /></Button>
      </form> : item.name}
    </TableCell>
    {accounts && <TableCell className="px-3 py-1.5"><DefaultAccount item={item} accounts={accounts} canEdit={canEdit} /></TableCell>}
    <TableCell className="px-3 py-1.5 text-right num" title="Rateios ou lançamentos que usam este cadastro">
      {item.usageHref && item.usage > 0
        ? <Link href={item.usageHref} className="inline-flex items-center gap-1 text-primary hover:underline" title="Ver os rateios que usam esta rubrica (para recategorizar)">{item.usage} <IconExternalLink className="size-3" aria-hidden /><span className="sr-only">ver rateios</span></Link>
        : item.usage}
    </TableCell>
    <TableCell className="px-3 py-1.5">
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
