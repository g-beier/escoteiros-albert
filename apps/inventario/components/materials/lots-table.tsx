"use client";

import { useState } from "react";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { Badge } from "@geas/ui/components/badge";
import { Button } from "@geas/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import type { Option } from "@geas/ui/components/option-controls";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { addLot, adjustLot, setLotCondition, transferLot, updateLot, writeOffLot } from "@/app/materiais/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";
import { CONDITION_LABELS, EXPIRY_WARNING_DAYS, ORIGIN_LABELS, dateBR, daysUntil, writeOffOptions, type Condition, type Origin } from "@/lib/inventory";
import { money } from "@/lib/money";
import { ActionDialog } from "./action-dialog";
import { ConditionField, EntryFields, Field, LocationField, NotesField, QuantityField, SelectField } from "./fields";

export type LotRow = {
  id: string; location_id: string; path: string; quantity: number; condition: Condition | null;
  unit_value_cents: number | null; expires_on: string | null; acquired_on: string | null; origin: Origin;
  supplier: string | null; invoice: string | null; notes: string | null;
};

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
        {canEdit && <TableHead className={cn(HEAD_CLASS, "w-12")}><span className="sr-only">Ações</span></TableHead>}
      </TableRow></TableHeader>
      <TableBody>{lots.map((row) => <TableRow key={row.id}>
        <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>{row.path}</TableCell>
        <TableCell className={cn(CELL_CLASS, "num text-right font-semibold")}>{row.quantity}</TableCell>
        <TableCell className={CELL_CLASS}>{row.condition ? <Badge variant="outline">{CONDITION_LABELS[row.condition]}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className={cn(CELL_CLASS, "num text-right")}>{row.unit_value_cents != null ? money(row.unit_value_cents) : <span className="text-muted-foreground">—</span>}</TableCell>
        <TableCell className={CELL_CLASS}><Expiry date={row.expires_on} /></TableCell>
        <TableCell className={CELL_CLASS}>{ORIGIN_LABELS[row.origin]}{row.acquired_on && <span className="num block text-[11px] text-muted-foreground">{dateBR(row.acquired_on)}</span>}</TableCell>
        <TableCell className={cn(CELL_CLASS, "max-w-72 whitespace-normal text-muted-foreground")}>{[row.notes, row.supplier, row.invoice && `NF ${row.invoice}`].filter(Boolean).join(" · ") || "—"}</TableCell>
        {canEdit && <TableCell className={CELL_CLASS}>
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
      </TableRow>)}</TableBody>
    </Table></div>

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
