"use client";

import { useState } from "react";
import Link from "next/link";
import { IconAlertTriangle, IconCheck, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateBR, money } from "@/lib/format";
import { FEE_MONTH_NAMES, type CellState, type FeeRecord, type FeeSplit, type FeeStatus, type FeeSuggestion } from "@/lib/fees";
import { cn } from "@/lib/utils";

export const STATE_LABELS: Record<CellState, string> = {
  pago: "pago", atencao: "atenção", nao_pago: "não pago", atrasado: "atrasado", sugestao: "pagamento a confirmar", vazio: "sem registro",
};

const STATE_STYLES: Record<CellState, string> = {
  pago: "border-success bg-success text-white",
  atencao: "border-amber-600 bg-amber-300 text-amber-950",
  nao_pago: "border-destructive bg-destructive text-white",
  atrasado: "border-destructive/50 bg-destructive/10 text-destructive",
  sugestao: "border-dashed border-success text-success",
  vazio: "border-border text-transparent",
};

/** Ícone da caixinha; também usado na legenda. */
export function FeeMark({ state, partial = false, className }: { state: CellState; partial?: boolean; className?: string }) {
  // sugestão parcial (valor menor que a mensalidade): tracejado amarelo com "!"
  if (state === "sugestao" && partial) return <span aria-hidden className={cn("grid size-6 place-items-center rounded-md border border-dashed border-amber-500 text-amber-700", className)}><IconAlertTriangle className="size-3.5" /></span>;
  return <span aria-hidden className={cn("grid size-6 place-items-center rounded-md border", STATE_STYLES[state], className)}>
    {state === "pago" || state === "sugestao" ? <IconCheck className="size-4" /> : state === "atencao" ? <IconAlertTriangle className="size-3.5" /> : state === "atrasado" || state === "nao_pago" ? <IconX className="size-3.5" /> : null}
  </span>;
}

export type CellChange = { status: FeeStatus | null; note?: string; splitIds: string[] };

/** Caixinha de um mês: botão com rótulo acessível; tesouraria edita no popover. */
export function FeeCell({ name, month, state, record, suggestion, splits, canEdit, exempt, onChange }: {
  name: string; month: number; state: CellState; record?: FeeRecord; suggestion?: FeeSuggestion;
  /** Rateios de mensalidade do associado no ano. */
  splits: FeeSplit[]; canEdit: boolean; exempt: boolean; onChange: (change: CellChange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(record?.note ?? suggestion?.note ?? "");
  const [linked, setLinked] = useState<Set<string>>(new Set(record?.splitIds ?? (suggestion ? [suggestion.splitId] : [])));
  const partial = state === "sugestao" && suggestion?.status === "atencao";
  const stateLabel = partial ? "pagamento parcial a confirmar" : STATE_LABELS[state];
  const detail = record?.note ?? (state === "sugestao" ? suggestion?.note : undefined);
  const label = `${name}, ${FEE_MONTH_NAMES[month]}: ${stateLabel}${detail ? ` (${detail})` : ""}`;
  const mark = <FeeMark state={state} partial={partial} className={cn(exempt && "opacity-40")} />;
  if (!canEdit) return <span className="inline-grid" title={label} role="img" aria-label={label}>{mark}</span>;

  const reset = () => { setNote(record?.note ?? suggestion?.note ?? ""); setLinked(new Set(record?.splitIds ?? (suggestion ? [suggestion.splitId] : []))); };
  const apply = (status: FeeStatus | null) => { onChange({ status, note: status ? note : undefined, splitIds: status ? [...linked] : [] }); setOpen(false); };
  const toggle = (id: string) => setLinked((set) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const noteId = `fee-note-${month}-${name.replace(/\W+/g, "-")}`;

  return <Popover open={open} onOpenChange={(next) => { if (next) reset(); setOpen(next); }}>
    <PopoverTrigger render={<button type="button" className="rounded-md p-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none" aria-label={label} title={label} />}>
      {mark}
    </PopoverTrigger>
    <PopoverContent align="center" className="w-80 gap-3 p-3">
      <p className="m-0 text-sm font-semibold">{name} · {FEE_MONTH_NAMES[month]}</p>
      {state === "sugestao" && suggestion && <p className="m-0 text-xs text-muted-foreground">
        Sugestão a partir do fluxo de caixa: {suggestion.status === "atencao" ? `atenção (${suggestion.note})` : suggestion.integral ? "pago (pagamento integral do ano)" : "pago"}.
      </p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => apply("pago")}><IconCheck /> Pago</Button>
        <Button size="sm" variant="outline" onClick={() => apply("atencao")}><IconAlertTriangle /> Atenção</Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => apply("nao_pago")}><IconX /> Não pago</Button>
        {record && <Button size="sm" variant="ghost" onClick={() => apply(null)}>Limpar</Button>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={noteId}>Observação</Label>
        <Input id={noteId} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: prometeu até dia 20; não pagou: viagem" />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-xs font-semibold">Rateios de mensalidade vinculados</legend>
        {splits.length === 0 && <p className="m-0 text-xs text-muted-foreground">Nenhum rateio de mensalidade deste associado no ano.</p>}
        {splits.map((split) => <Label key={split.splitId} className="items-start font-normal">
          <Checkbox checked={linked.has(split.splitId)} onCheckedChange={() => toggle(split.splitId)} />
          <span className="grid">
            <span><span className="num">{dateBR(split.entryDate)}</span> · <span className="num">{money(split.amountCents / 100)}</span>
              {split.linkedPeriods.length > 0 && <span className="text-muted-foreground"> · já em {split.linkedPeriods.map((p) => FEE_MONTH_NAMES[p % 100] ?? p).join(", ")}</span>}</span>
            <Link href={`/lancamentos/${split.entryId}`} className="text-xs text-primary hover:underline">{split.description || "ver lançamento"}</Link>
          </span>
        </Label>)}
        <p className="m-0 text-xs text-muted-foreground">Observação e vínculos são gravados ao escolher Pago, Atenção ou Não pago.</p>
      </fieldset>
    </PopoverContent>
  </Popover>;
}
