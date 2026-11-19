"use client";

import { useState } from "react";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { Button, buttonVariants } from "@geas/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import type { Option } from "@geas/ui/components/option-controls";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { addLot, adjustLot, setLotCondition, transferLot, updateLot, writeOffLot } from "@/app/(inventario)/inventario/materiais/actions";
import { SOFT_CELL, SOFT_HEAD, SOFT_ROW_DARK, SOFT_ROW_LIGHT, SOFT_TABLE, softRowRound } from "@/components/inventory/table-head";
import { CONDITION_LABELS, EXPIRY_WARNING_DAYS, ORIGIN_LABELS, dateBR, daysUntil, writeOffOptions } from "@/lib/inventory/vocabulary";
import { formatInventoryCents } from "@/lib/format";
import { ActionDialog } from "./action-dialog";
import { ConditionPill } from "./condition-pill";
import { ConditionField, EntryFields, Field, LocationField, NotesField, QuantityField, SelectField } from "./fields";

import type { LotRow } from "@/lib/inventory/model";

export type { LotRow };

type Mode = "transfer" | "condition" | "adjust" | "writeOff" | "edit";

/** Validade: vencida só muda a cor (como na lista), sem o texto “(vencido)”. */
export function Expiry({ date }: { date: string | null }) {
  if (!date) return null;
  const days = daysUntil(date);
  return <span className={cn("num font-normal", days < 0 && "text-[#e2445c]")} title={days < 0 ? "Vencido" : days <= EXPIRY_WARNING_DAYS ? `Vence em ${days} dias` : undefined}>{dateBR(date)}</span>;
}

export function AddLotButton({ materialId, locations }: { materialId: string; locations: Option[] }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "rounded-md border-transparent bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
      <IconPlus data-icon="inline-start" /> Adicionar lote
    </button>
    {open && <ActionDialog open onOpenChange={setOpen} title="Adicionar lote" description="Entrada de unidades deste material numa divisão." action={addLot} submitLabel="Adicionar" hidden={{ materialId }}>
      <LocationField id="lot-new-location" locations={locations} />
      <QuantityField id="lot-new-quantity" defaultValue={1} />
      <ConditionField id="lot-new-condition" defaultValue="bom" />
      <Field id="lot-new-expires" label="Validade">
        <Input id="lot-new-expires" name="expiresOn" type="date" className="num" />
      </Field>
      <EntryFields prefix="lot-new" />
    </ActionDialog>}
  </>;
}

export function LotsTable({ materialId, lots, locations, canEdit }: { materialId: string; lots: LotRow[]; locations: Option[]; canEdit: boolean }) {
  const [active, setActive] = useState<{ mode: Mode; lot: LotRow } | null>(null);
  const close = (open: boolean) => { if (!open) setActive(null); };
  const lot = active?.lot;
  const hidden: Record<string, string> = lot ? { materialId, lotId: lot.id } : {};

  if (lots.length === 0) return <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhum lote com unidades.</p>;
  return <>
    <div className="grid gap-2 p-3">
      <div className="overflow-x-auto"><Table className={SOFT_TABLE}>
        <TableCaption className="sr-only">Lotes do material</TableCaption>
        <TableHeader className="[&_tr]:border-0"><TableRow className="border-0 hover:bg-transparent">
          <TableHead className={cn(SOFT_HEAD, "rounded-l-2xl")}>Divisão</TableHead>
          <TableHead className={cn(SOFT_HEAD, "w-24 text-right")}>Quantidade</TableHead>
          <TableHead className={cn(SOFT_HEAD, "w-32")}>Condição</TableHead>
          <TableHead className={cn(SOFT_HEAD, "w-28 text-right")}>Valor unit.</TableHead>
          <TableHead className={cn(SOFT_HEAD, "w-32")}>Validade</TableHead>
          <TableHead className={cn(SOFT_HEAD, "w-32")}>Origem</TableHead>
          <TableHead className={cn(SOFT_HEAD, !canEdit && "rounded-r-2xl")}>Observação</TableHead>
          {canEdit && <TableHead className={cn(SOFT_HEAD, "w-12 rounded-r-2xl")}><span className="sr-only">Ações</span></TableHead>}
        </TableRow></TableHeader>
        <TableBody>{lots.map((row, index) => {
          const dark = index % 2 === 1;
          const rowBg = dark ? SOFT_ROW_DARK : SOFT_ROW_LIGHT;
          const round = softRowRound(dark);
          return <TableRow key={row.id} className="border-0 hover:bg-transparent">
            <TableCell className={cn(SOFT_CELL, "whitespace-normal font-normal", rowBg, round)}>{row.path}</TableCell>
            <TableCell className={cn(SOFT_CELL, "num text-right font-normal", rowBg, round)}>{row.quantity}</TableCell>
            <TableCell className={cn(SOFT_CELL, rowBg, round)}><ConditionPill condition={row.condition} /></TableCell>
            <TableCell className={cn(SOFT_CELL, "num text-right font-normal", rowBg, round)}>{row.unit_value_cents != null ? formatInventoryCents(row.unit_value_cents) : ""}</TableCell>
            <TableCell className={cn(SOFT_CELL, rowBg, round)}><Expiry date={row.expires_on} /></TableCell>
            <TableCell className={cn(SOFT_CELL, "font-normal", rowBg, round)}>{ORIGIN_LABELS[row.origin]}{row.acquired_on && <span className="num block text-[11px] text-muted-foreground">{dateBR(row.acquired_on)}</span>}</TableCell>
            <TableCell className={cn(SOFT_CELL, "max-w-72 whitespace-normal font-normal text-muted-foreground", rowBg, round)}>{[row.notes, row.supplier, row.invoice && `NF ${row.invoice}`].filter(Boolean).join(" · ") || ""}</TableCell>
            {canEdit && <TableCell className={cn(SOFT_CELL, rowBg, round)}>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações do lote em ${row.path}`}><IconDots /></Button>} />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setActive({ mode: "transfer", lot: row })}>Transferir</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActive({ mode: "condition", lot: row })}>Mudar condição</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActive({ mode: "adjust", lot: row })}>Ajustar contagem</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActive({ mode: "edit", lot: row })}>Editar dados de entrada</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setActive({ mode: "writeOff", lot: row })}>Dar baixa</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>}
          </TableRow>;
        })}</TableBody>
      </Table></div>
    </div>

    {lot && active.mode === "transfer" && <ActionDialog open onOpenChange={close} title="Transferir lote" action={transferLot} submitLabel="Transferir" hidden={hidden}
      description={`De ${lot.path}. Transferir parte das unidades cria um lote novo no destino.`}>
      <LocationField id="lot-transfer-location" label="Para a divisão" locations={locations.filter((option) => option.value !== lot.location_id)} />
      <QuantityField id="lot-transfer-quantity" max={lot.quantity} defaultValue={lot.quantity} />
      <NotesField id="lot-transfer-notes" />
    </ActionDialog>}

    {lot && active.mode === "condition" && <ActionDialog open onOpenChange={close} title="Mudar condição" action={setLotCondition} submitLabel="Registrar" hidden={hidden}
      description={`Lote em ${lot.path}${lot.condition ? `, hoje ${CONDITION_LABELS[lot.condition].toLowerCase()}` : ""}. Mudar só parte das unidades cria um lote novo.`}>
      <ConditionField id="lot-condition" label="Nova condição" />
      <QuantityField id="lot-condition-quantity" max={lot.quantity} defaultValue={lot.quantity} />
      <NotesField id="lot-condition-notes" />
    </ActionDialog>}

    {lot && active.mode === "adjust" && <ActionDialog open onOpenChange={close} title="Ajustar contagem" action={adjustLot} submitLabel="Ajustar" hidden={hidden}
      description={`Lote em ${lot.path}, registrado com ${lot.quantity}. Use quando a contagem não bate; para perda ou consumo, dê baixa.`}>
      <QuantityField id="lot-adjust-quantity" label="Quantidade contada" min={0} defaultValue={lot.quantity} />
      <NotesField id="lot-adjust-notes" label="Motivo do ajuste" required />
    </ActionDialog>}

    {lot && active.mode === "writeOff" && <ActionDialog open onOpenChange={close} title="Dar baixa" action={writeOffLot} submitLabel="Dar baixa" destructive hidden={hidden}
      description={`Saída definitiva do patrimônio. Lote em ${lot.path}, com ${lot.quantity}.`}>
      <SelectField id="lot-writeoff-reason" name="reason" label="Motivo" options={writeOffOptions} />
      <QuantityField id="lot-writeoff-quantity" max={lot.quantity} defaultValue={lot.quantity} />
      <NotesField id="lot-writeoff-notes" />
    </ActionDialog>}

    {lot && active.mode === "edit" && <ActionDialog open onOpenChange={close} title="Editar dados de entrada" action={updateLot} submitLabel="Salvar" hidden={hidden}
      description={`Lote em ${lot.path}.`}>
      <Field id="lot-edit-expires" label="Validade">
        <Input id="lot-edit-expires" name="expiresOn" type="date" defaultValue={lot.expires_on ?? ""} className="num" />
      </Field>
      <EntryFields prefix="lot-edit" defaults={lot} />
    </ActionDialog>}
  </>;
}
