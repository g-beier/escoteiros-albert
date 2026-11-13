"use client";

import { useState } from "react";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { Badge } from "@geas/ui/components/badge";
import { Button } from "@geas/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import type { Option } from "@geas/ui/components/option-controls";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { Textarea } from "@geas/ui/components/textarea";
import { cn } from "@geas/ui/lib/utils";
import { addUnit, setUnitCondition, transferUnit, updateUnit, writeOffUnit } from "@/app/materiais/actions";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";
import { CONDITION_LABELS, ORIGIN_LABELS, WRITE_OFF_LABELS, dateBR, timestampBR, writeOffOptions, type Condition, type Origin, type WriteOffReason } from "@/lib/inventory";
import { money } from "@/lib/money";
import { ActionDialog } from "./action-dialog";
import { ConditionField, EntryFields, Field, LocationField, NotesField, SelectField } from "./fields";

export type UnitRow = {
  id: string; location_id: string; path: string; tag: string | null; legacy_code: string | null; description: string | null;
  condition: Condition | null; unit_value_cents: number | null; acquired_on: string | null; origin: Origin;
  supplier: string | null; invoice: string | null; notes: string | null;
  written_off_at: string | null; write_off_reason: WriteOffReason | null;
};

type Mode = "transfer" | "condition" | "writeOff" | "edit";

/** Etiqueta (GEAS-000-0000) e descrição: campos comuns a "Adicionar peça" e "Editar/etiquetar". */
function IdentityFields({ prefix, unit, nextTag, familyCode }: { prefix: string; unit?: UnitRow; nextTag: string | null; familyCode: string | null }) {
  return <>
    <Field id={`${prefix}-tag`} label="Etiqueta">
      <Input id={`${prefix}-tag`} name="tag" defaultValue={unit?.tag ?? ""} placeholder={nextTag ?? (familyCode ? `GEAS-${familyCode}-0001` : "GEAS-000-0000")}
        pattern="[Gg][Ee][Aa][Ss]-\d{3}-\d{4}" className="num uppercase" />
      <span className="text-[11px] text-muted-foreground">{familyCode
        ? <>Opcional até a etiqueta física ser colocada.{nextTag && <> Próxima livre: <span className="num">{nextTag}</span>.</>}</>
        : "Defina o código da família do material para etiquetar."}</span>
    </Field>
    <Field id={`${prefix}-legacy`} label="Código antigo">
      <Input id={`${prefix}-legacy`} name="legacyCode" maxLength={30} defaultValue={unit?.legacy_code ?? ""} placeholder="Ex.: B3" />
    </Field>
    <Field id={`${prefix}-description`} label="Descrição da peça" className="sm:col-span-2">
      <Textarea id={`${prefix}-description`} name="description" maxLength={500} rows={2} defaultValue={unit?.description ?? ""} placeholder="Ex.: azul e laranja, 6 espeques" />
    </Field>
  </>;
}

export function AddUnitButton({ materialId, locations, nextTag, familyCode }: { materialId: string; locations: Option[]; nextTag: string | null; familyCode: string | null }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="sm" onClick={() => setOpen(true)}><IconPlus data-icon="inline-start" /> Adicionar peça</Button>
    {open && <ActionDialog open onOpenChange={setOpen} title="Adicionar peça" description="Entrada de uma peça deste material." action={addUnit} submitLabel="Adicionar" hidden={{ materialId }}>
      <LocationField id="unit-new-location" locations={locations} />
      <IdentityFields prefix="unit-new" nextTag={nextTag} familyCode={familyCode} />
      <ConditionField id="unit-new-condition" defaultValue="bom" />
      <EntryFields prefix="unit-new" valueLabel="Valor estimado" />
    </ActionDialog>}
  </>;
}

export function UnitsTable({ materialId, units, locations, canEdit, nextTag, familyCode }: {
  materialId: string; units: UnitRow[]; locations: Option[]; canEdit: boolean; nextTag: string | null; familyCode: string | null;
}) {
  const [active, setActive] = useState<{ mode: Mode; unit: UnitRow } | null>(null);
  const close = (open: boolean) => { if (!open) setActive(null); };
  const unit = active?.unit;
  const hidden: Record<string, string> = unit ? { materialId, unitId: unit.id } : {};
  const current = units.filter((row) => !row.written_off_at);
  const writtenOff = units.filter((row) => row.written_off_at);
  const label = (row: UnitRow) => row.tag ?? row.legacy_code ?? "peça sem etiqueta";

  return <>
    {current.length === 0
      ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nenhuma peça cadastrada.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[860px]">
        <TableCaption className="sr-only">Peças do material</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD_CLASS, "w-36")}>Etiqueta</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-24")}>Cód. antigo</TableHead>
          <TableHead className={HEAD_CLASS}>Divisão</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-32")}>Condição</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28 text-right")}>Valor</TableHead>
          <TableHead className={HEAD_CLASS}>Descrição</TableHead>
          {canEdit && <TableHead className={cn(HEAD_CLASS, "w-12")}><span className="sr-only">Ações</span></TableHead>}
        </TableRow></TableHeader>
        <TableBody>{current.map((row) => <TableRow key={row.id}>
          <TableCell className={cn(CELL_CLASS, "num font-semibold")}>{row.tag ?? <span className="font-normal text-muted-foreground">sem etiqueta</span>}</TableCell>
          <TableCell className={cn(CELL_CLASS, "num")}>{row.legacy_code ?? <span className="text-muted-foreground">—</span>}</TableCell>
          <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>{row.path}</TableCell>
          <TableCell className={CELL_CLASS}>{row.condition ? <Badge variant="outline">{CONDITION_LABELS[row.condition]}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
          <TableCell className={cn(CELL_CLASS, "num text-right")}>{row.unit_value_cents != null ? money(row.unit_value_cents) : <span className="text-muted-foreground">—</span>}</TableCell>
          <TableCell className={cn(CELL_CLASS, "max-w-80 whitespace-normal text-muted-foreground")}>
            {[row.description, row.notes, row.origin !== "nao_informada" && ORIGIN_LABELS[row.origin], row.acquired_on && dateBR(row.acquired_on)].filter(Boolean).join(" · ") || "—"}
          </TableCell>
          {canEdit && <TableCell className={CELL_CLASS}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações da ${label(row)}`}><IconDots /></Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setActive({ mode: "transfer", unit: row })}>Transferir</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActive({ mode: "condition", unit: row })}>Mudar condição</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActive({ mode: "edit", unit: row })}>{row.tag ? "Editar dados" : "Editar e etiquetar"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setActive({ mode: "writeOff", unit: row })}>Dar baixa</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>}
        </TableRow>)}</TableBody>
      </Table></div>}

    {writtenOff.length > 0 && <details className="border-t px-4 py-2.5 text-xs">
      <summary className="cursor-pointer font-semibold text-muted-foreground">Peças baixadas ({writtenOff.length})</summary>
      <ul className="m-0 mt-2 grid list-none gap-1 p-0">{writtenOff.map((row) => <li key={row.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
        <span className="num font-semibold text-foreground">{label(row)}</span>
        <span>{row.write_off_reason && WRITE_OFF_LABELS[row.write_off_reason]} em <span className="num">{timestampBR(row.written_off_at!)}</span></span>
        {row.description && <span>· {row.description}</span>}
      </li>)}</ul>
    </details>}

    {unit && active.mode === "transfer" && <ActionDialog open onOpenChange={close} title={`Transferir ${label(unit)}`} action={transferUnit} submitLabel="Transferir" hidden={hidden}
      description={`Hoje em ${unit.path}.`}>
      <LocationField id="unit-transfer-location" label="Para a divisão" locations={locations.filter((option) => option.value !== unit.location_id)} />
      <NotesField id="unit-transfer-notes" />
    </ActionDialog>}

    {unit && active.mode === "condition" && <ActionDialog open onOpenChange={close} title={`Condição de ${label(unit)}`} action={setUnitCondition} submitLabel="Registrar" hidden={hidden}
      description={unit.condition ? `Hoje: ${CONDITION_LABELS[unit.condition].toLowerCase()}.` : undefined}>
      <ConditionField id="unit-condition" label="Nova condição" />
      <NotesField id="unit-condition-notes" />
    </ActionDialog>}

    {unit && active.mode === "writeOff" && <ActionDialog open onOpenChange={close} title={`Dar baixa em ${label(unit)}`} action={writeOffUnit} submitLabel="Dar baixa" destructive hidden={hidden}
      description="Saída definitiva do patrimônio. A peça continua no histórico.">
      <SelectField id="unit-writeoff-reason" name="reason" label="Motivo" options={writeOffOptions} />
      <NotesField id="unit-writeoff-notes" />
    </ActionDialog>}

    {unit && active.mode === "edit" && <ActionDialog open onOpenChange={close} title={unit.tag ? `Editar ${unit.tag}` : "Editar e etiquetar peça"} action={updateUnit} submitLabel="Salvar" hidden={hidden}
      description={`Em ${unit.path}. Divisão e condição mudam pelas ações próprias, que ficam no histórico.`}>
      <IdentityFields prefix="unit-edit" unit={unit} nextTag={nextTag} familyCode={familyCode} />
      <EntryFields prefix="unit-edit" defaults={unit} valueLabel="Valor estimado" />
    </ActionDialog>}
  </>;
}
