"use client";

import { useState } from "react";
import { IconDots, IconMinus, IconPlus } from "@tabler/icons-react";
import { ConditionPill } from "@/components/inventory/condition-pill";
import { Button } from "@geas/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import type { Option } from "@geas/ui/components/option-controls";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { adjustLot, setLotCondition, transferLot, updateLot } from "@/app/(inventario)/inventario/materiais/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/inventory/table-head";
import { CONDITION_LABELS, EXPIRY_WARNING_DAYS, ORIGIN_LABELS, dateBR, daysUntil } from "@/lib/inventory/vocabulary";
import { formatCents } from "@/lib/format";
import { ActionDialog } from "./action-dialog";
import { ConditionField, EntryFields, Field, LocationField, NotesField, QuantityField, VariantField } from "./fields";
import { AddLotDialog, WithdrawDialog, withdrawLabel } from "./withdraw";

import type { LotRow } from "@/lib/inventory/model";

export type { LotRow };

type Mode = "transfer" | "condition" | "adjust" | "writeOff" | "edit";

/** Validade com destaque: vencida (vermelho) ou perto de vencer (amarelo). */
export function Expiry({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const days = daysUntil(date);
  const tone = days < 0 ? "text-destructive font-semibold" : days <= EXPIRY_WARNING_DAYS ? "text-[#725d0d] font-semibold" : "";
  return <span className={cn("num", tone)} title={days < 0 ? "Vencido" : `Vence em ${days} dias`}>{dateBR(date)}{days < 0 && " (vencido)"}</span>;
}

export function AddLotButton({ materialId, locations }: { materialId: string; locations: Option[] }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="sm" onClick={() => setOpen(true)}><IconPlus data-icon="inline-start" /> Adicionar lote</Button>
    {open && <AddLotDialog materialId={materialId} locations={locations} onOpenChange={setOpen} />}
  </>;
}

/**
 * Lotes do material. A ação principal de cada lote é a saída (Consumir / Dar baixa); o resto fica no menu, com
 * "Corrigir contagem" por último: só para registro errado. Se a contagem corrigida for menor, o diálogo sugere a baixa.
 */
export function LotsTable({ materialId, materialName, consumable, lots, locations, canEdit }: {
  materialId: string; materialName: string; consumable: boolean; lots: LotRow[]; locations: Option[]; canEdit: boolean;
}) {
  const [active, setActive] = useState<{ mode: Mode; lot: LotRow; quantity?: number } | null>(null);
  const close = (open: boolean) => { if (!open) setActive(null); };
  const lot = active?.lot;
  const hidden: Record<string, string> = lot ? { materialId, lotId: lot.id } : {};

  if (lots.length === 0) return <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum lote com unidades.</p>;
  return <>
    <div className="overflow-x-auto"><Table className="min-w-[860px]">
      <TableCaption className="sr-only">Lotes do material</TableCaption>
      <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className={HEAD_CLASS}>Divisão</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-24 text-right")}>Quantidade</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-32")}>Condição</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-28 text-right")}>Valor unit.</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-32")}>Validade</TableHead>
        <TableHead className={cn(HEAD_CLASS, "w-32")}>Origem</TableHead>
        <TableHead className={HEAD_CLASS}>Observação</TableHead>
        {canEdit && <TableHead className={cn(HEAD_CLASS, "w-36")}><span className="sr-only">Ações</span></TableHead>}
      </TableRow></TableHeader>
      <TableBody>{lots.map((row) => <TableRow key={row.id}>
        <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>{row.path}</TableCell>
        <TableCell className={cn(CELL_CLASS, "num text-right font-semibold")}>{row.quantity}</TableCell>
        <TableCell className={CELL_CLASS}><ConditionPill condition={row.condition} /></TableCell>
        <TableCell className={cn(CELL_CLASS, "num text-right")}>{row.unit_value_cents != null ? formatCents(row.unit_value_cents) : <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className={CELL_CLASS}><Expiry date={row.expires_on} /></TableCell>
        <TableCell className={CELL_CLASS}>{ORIGIN_LABELS[row.origin]}{row.acquired_on && <span className="num block text-[11px] text-muted-foreground">{dateBR(row.acquired_on)}</span>}</TableCell>
        <TableCell className={cn(CELL_CLASS, "max-w-72 whitespace-normal text-muted-foreground")}>{[row.notes, row.supplier, row.invoice && `NF ${row.invoice}`].filter(Boolean).join(" · ") || "—"}</TableCell>
        {canEdit && <TableCell className={CELL_CLASS}><span className="flex justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => setActive({ mode: "writeOff", lot: row })} aria-label={`${withdrawLabel(consumable)} do lote em ${row.path}`}>
            <IconMinus data-icon="inline-start" /> {withdrawLabel(consumable)}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Mais ações do lote em ${row.path}`}><IconDots /></Button>} />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setActive({ mode: "transfer", lot: row })}>Transferir</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActive({ mode: "condition", lot: row })}>Mudar condição</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActive({ mode: "edit", lot: row })}>Editar dados de entrada</DropdownMenuItem>
              {consumable && <DropdownMenuItem onClick={() => setActive({ mode: "writeOff", lot: row })}>Dar baixa (perda, descarte…)</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActive({ mode: "adjust", lot: row })}>Corrigir contagem…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span></TableCell>}
      </TableRow>)}</TableBody>
    </Table></div>

    {lot && active.mode === "transfer" && <ActionDialog open onOpenChange={close} title="Transferir lote" action={transferLot} submitLabel="Transferir" hidden={hidden}
      description={`De ${lot.path}. Transferir parte das unidades cria um lote novo no destino.`}>
      <LocationField id="lot-transfer-location" label="Para a divisão" locations={locations.filter((option) => option.value !== lot.location_id)} />
      <QuantityField id="lot-transfer-quantity" max={lot.quantity} defaultValue={lot.quantity} />
      <NotesField id="lot-transfer-notes" />
    </ActionDialog>}

    {lot && active.mode === "condition" && <ActionDialog open onOpenChange={close} title="Mudar condição" action={setLotCondition} submitLabel="Registrar" hidden={hidden}
      description={`Lote em ${lot.path}${lot.condition ? `, hoje ${CONDITION_LABELS[lot.condition].toLowerCase()}` : ""}. Soma num lote igual na nova condição, se houver; mudar só parte das unidades separa um lote.`}>
      <ConditionField id="lot-condition" label="Nova condição" />
      <QuantityField id="lot-condition-quantity" max={lot.quantity} defaultValue={lot.quantity} />
      <NotesField id="lot-condition-notes" />
    </ActionDialog>}

    {lot && active.mode === "adjust" && <ActionDialog open onOpenChange={close} title="Corrigir contagem" action={adjustLot} submitLabel="Corrigir" hidden={hidden}
      description={<>Lote em {lot.path}, registrado com <span className="num">{lot.quantity}</span>. Só para quando o registro estava errado. Se unidades <strong>saíram</strong> (uso, perda, descarte), registre como {withdrawLabel(consumable).toLowerCase()}: o motivo fica no histórico.</>}>
      <AdjustFields current={lot.quantity} consumable={consumable} onWithdraw={(quantity) => setActive({ mode: "writeOff", lot, quantity })} />
    </ActionDialog>}

    {lot && active.mode === "writeOff" && <WithdrawDialog materialId={materialId} materialName={materialName} consumable={consumable}
      lots={[lot]} defaultQuantity={active.quantity ?? 1} onOpenChange={close} />}

    {lot && active.mode === "edit" && <ActionDialog open onOpenChange={close} title="Editar dados de entrada" action={updateLot} submitLabel="Salvar" hidden={hidden}
      description={`Lote em ${lot.path}.`}>
      <Field id="lot-edit-expires" label="Validade">
        <Input id="lot-edit-expires" name="expiresOn" type="date" defaultValue={lot.expires_on ?? ""} className="num" />
      </Field>
      <EntryFields prefix="lot-edit" defaults={lot} />
    </ActionDialog>}
  </>;
}

/** Contagem corrigida; quando é menor que a registrada, oferece trocar para a baixa da diferença. */
function AdjustFields({ current, consumable, onWithdraw }: { current: number; consumable: boolean; onWithdraw: (quantity: number) => void }) {
  const [value, setValue] = useState(String(current));
  const missing = current - (Number(value) || 0);
  return <>
    <Field id="lot-adjust-quantity" label="Quantidade contada">
      <Input id="lot-adjust-quantity" name="quantity" type="number" inputMode="numeric" min={0} required value={value} onChange={(event) => setValue(event.target.value)} className="num" />
    </Field>
    {missing > 0 && value !== "" && <div role="note" className="surface grid gap-2 px-3 py-2 text-xs sm:col-span-2">
      <span>Faltam <strong className="num">{missing}</strong>. Se foram usadas, perdidas ou descartadas, não é correção: é {withdrawLabel(consumable).toLowerCase()}.</span>
      <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => onWithdraw(missing)}>
        <IconMinus data-icon="inline-start" /> Registrar {missing} como {consumable ? "consumo" : "baixa"}
      </Button>
    </div>}
    <NotesField id="lot-adjust-notes" label="Por que o registro estava errado?" required />
  </>;
}
