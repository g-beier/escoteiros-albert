"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@geas/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { OptionSelect } from "@geas/ui/components/option-controls";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { clearControlStatus, setControlStatus } from "@/app/(associados)/associados/controle/actions";
import {
  CONTROL_STATUSES, directorateLabels, personKey, statusLabels, suggestedValidUntil, validityLabel, valueKindLabels,
  type ControlItem, type ControlStatusRow,
} from "@/lib/associates/controls";
import { dateBR } from "@/lib/format";
import { Field } from "./associate-form";
import { ActionForm } from "@geas/ui/components/action-form";

const statusOptions = CONTROL_STATUSES.map((value) => ({ value, label: statusLabels[value] }));

/**
 * O que está sendo editado: uma pessoa (associado ou, com `relative`, responsável) × um item, com a situação atual
 * (se houver). `context` vai na descrição (ex.: "responsável de Ana").
 */
export type StatusTarget = { person: { id: string; name: string; relative?: boolean; context?: string }; item: ControlItem; row?: ControlStatusRow };

/**
 * Diálogo da situação de um item para um associado: situação, data, validade e observação. Validade em branco num
 * item que vence (ok) é calculada no banco a partir da data. "Apagar" volta a célula para "sem registro".
 * Item que mostra um valor: o campo principal é o Ano (`value_year`) ou a Data (a validade); a situação pode ficar em
 * branco e vira ok ao salvar com o valor.
 */
export function ControlStatusDialog({ target, today, onClose }: { target: StatusTarget | null; today: string; onClose: () => void }) {
  return <Dialog open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="w-[min(36rem,calc(100%-2rem))]">
      {target && <StatusForm key={`${personKey(target.person)}:${target.item.id}`} target={target} today={today} onClose={onClose} />}
    </DialogContent>
  </Dialog>;
}

function useDialogAction(action: (previous: ActionResult, data: FormData) => Promise<ActionResult>, onClose: () => void) {
  return useActionState(async (previous: ActionResult, data: FormData) => {
    const result = await action(previous, data);
    if (result.error) toast.error(result.error);
    else if (result.success) {
      toast.success(result.success);
      onClose();
    }
    return result;
  }, {});
}

function StatusForm({ target: { person, item, row }, today, onClose }: { target: StatusTarget; today: string; onClose: () => void }) {
  const showsValue = item.value_kind !== "situacao";
  // item que mostra um valor: situação em branco = ok pelo valor
  const [status, setStatus] = useState<string>(row?.status ?? (showsValue ? "" : "ok"));
  const [statusDate, setStatusDate] = useState(row?.status_date ?? today);
  // validade gravada vale para a data gravada: mudou a data, volta a ser calculada (ou digitada de novo)
  const [validUntil, setValidUntil] = useState(row?.valid_until ?? "");
  const [, save, saving] = useDialogAction(setControlStatus, onClose);
  const [, clear, clearing] = useDialogAction(clearControlStatus, onClose);
  const suggested = status === "ok" ? suggestedValidUntil(statusDate || null, item.validity_months, today) : null;
  const statusField = <Field id="control-status" label="Situação" hint={showsValue && !status ? "Em branco: OK ao informar o valor." : undefined}>
    <OptionSelect id="control-status" value={status} onValueChange={setStatus} options={statusOptions} emptyLabel={showsValue ? "Pelo valor (OK)" : undefined} />
  </Field>;
  const noteField = <Field id="control-note" label="Observação (opcional)">
    <Input id="control-note" name="note" maxLength={200} defaultValue={row?.note ?? ""} placeholder="Ex.: sem foto" />
  </Field>;

  return <>
    <DialogHeader>
      <DialogTitle>{item.name}</DialogTitle>
      <DialogDescription>
        {person.name}{person.context && ` (${person.context})`} · {directorateLabels[item.directorate]}
        {showsValue ? ` · mostra ${valueKindLabels[item.value_kind].toLowerCase()}` : ` · validade: ${validityLabel(item.validity_months).toLowerCase()}`}
        {row && <> · atualizado em <span className="num">{dateBR(row.updated_at.slice(0, 10))}</span></>}
      </DialogDescription>
    </DialogHeader>
    <ActionForm action={(data) => (data.get("acao") === "apagar" ? clear : save)(data)} className="grid gap-3">
      <input type="hidden" name={person.relative ? "relativeId" : "associateId"} value={person.id} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="status" value={status} />
      {showsValue && <input type="hidden" name="statusDate" value={row?.status_date ?? today} />}
      {item.value_kind === "ano" && <input type="hidden" name="validUntil" value={row?.valid_until ?? ""} />}
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {item.value_kind === "ano" && <Field id="control-year" label="Ano">
          <Input id="control-year" name="valueYear" type="number" inputMode="numeric" min={1900} max={2100} step={1} className="num"
            defaultValue={row?.value_year ?? ""} placeholder={`Ex.: ${today.slice(0, 4)}`} />
        </Field>}
        {item.value_kind === "data" && <Field id="control-valid" label="Data">
          <Input id="control-valid" name="validUntil" type="date" className="num" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
        </Field>}
        {showsValue ? <>{statusField}{noteField}</> : <>
          {statusField}
          <Field id="control-date" label="Data">
            <Input id="control-date" name="statusDate" type="date" className="num" value={statusDate} onChange={(event) => { setStatusDate(event.target.value); setValidUntil(""); }} />
          </Field>
          <Field id="control-valid" label="Validade" hint={suggested && !validUntil ? `Em branco: ${dateBR(suggested)} (${validityLabel(item.validity_months).toLowerCase()} depois da data).` : item.validity_months === null ? "Este item não vence." : undefined}>
            <Input id="control-valid" name="validUntil" type="date" className="num" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
          </Field>
          {noteField}
        </>}
      </div>
      <DialogFooter className="sm:justify-between">
        {row
          ? <Button type="submit" name="acao" value="apagar" variant="ghost" className="text-destructive" disabled={clearing || saving}>Apagar situação</Button>
          : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || clearing}>{saving ? "Salvando…" : "Salvar situação"}</Button>
        </div>
      </DialogFooter>
    </ActionForm>
  </>;
}
