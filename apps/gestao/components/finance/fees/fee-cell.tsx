"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconAlertTriangle, IconCheck, IconCircleCheck, IconMinus, IconX } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@geas/ui/components/popover";
import { dateBR, money } from "@/lib/format";
import { FEE_MONTH_NAMES, type CellState, type FeeRecord, type FeeSplit, type FeeStatus, type FeeSuggestion } from "@/lib/finance/fees";
import { cn } from "@geas/ui/lib/utils";

export const STATE_LABELS: Record<CellState, string> = {
  pago: "pago", atencao: "atenção", nao_pago: "não pago", isento: "isento (não cobrar)", atrasado: "atrasado", sugestao: "pagamento a confirmar", vazio: "sem registro", fora: "fora do grupo",
};

const STATE_STYLES: Record<CellState, string> = {
  pago: "border-success bg-success text-success-foreground",
  atencao: "border-attention-strong bg-attention text-attention-foreground",
  nao_pago: "border-destructive bg-destructive text-destructive-foreground",
  isento: "border-success/40 bg-success/10 text-success",
  atrasado: "border-destructive/50 bg-destructive/10 text-destructive",
  sugestao: "border-dashed border-success text-success",
  vazio: "border-border text-transparent",
  fora: "border-dashed border-border bg-muted/60 text-muted-foreground",
};

/** Ícone da caixinha; também usado na legenda. */
export function FeeMark({ state, partial = false, className }: { state: CellState; partial?: boolean; className?: string }) {
  // sugestão parcial (valor menor que a mensalidade): tracejado amarelo com "!"
  if (state === "sugestao" && partial) return <span aria-hidden className={cn("grid size-6 place-items-center rounded-md border border-dashed border-attention-line text-attention-soft-foreground", className)}><IconAlertTriangle className="size-3.5" /></span>;
  return <span aria-hidden className={cn("grid size-6 place-items-center rounded-md border", STATE_STYLES[state], className)}>
    {state === "pago" || state === "sugestao" ? <IconCheck className="size-4" /> : state === "isento" ? <IconCircleCheck className="size-3.5" /> : state === "atencao" ? <IconAlertTriangle className="size-3.5" /> : state === "atrasado" || state === "nao_pago" ? <IconX className="size-3.5" /> : state === "fora" ? <IconMinus className="size-3" /> : null}
  </span>;
}

export type CellChange = { status: FeeStatus | null; note?: string; splitIds: string[] };

/** Espera depois da última tecla antes de gravar a observação. */
const NOTE_DEBOUNCE_MS = 400;

/** Caixinha de um mês: botão com rótulo acessível; tesouraria edita no popover. */
type CellProps = {
  name: string; month: number; state: CellState; record?: FeeRecord; suggestion?: FeeSuggestion;
  /** Rateios de mensalidade do associado no ano. */
  splits: FeeSplit[]; canEdit: boolean; exempt: boolean; onChange: (change: CellChange) => Promise<void>;
};

const cellLabel = ({ name, month, state, record, suggestion }: Pick<CellProps, "name" | "month" | "state" | "record" | "suggestion">) => {
  const partial = state === "sugestao" && suggestion?.status === "atencao";
  const detail = record?.note ?? (state === "sugestao" ? suggestion?.note : undefined);
  return { partial, label: `${name}, ${FEE_MONTH_NAMES[month]}: ${partial ? "pagamento parcial a confirmar" : STATE_LABELS[state]}${detail ? ` (${detail})` : ""}` };
};
const triggerClass = "rounded-md p-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

/**
 * Caixinha de um mês. Até o primeiro clique é só um botão: o popover de edição (Base UI) é montado na primeira vez
 * que abre. Com centenas de caixinhas na grade (e linhas montadas durante a rolagem), montar um popover por caixinha
 * era o custo principal.
 */
export function FeeCell(props: CellProps) {
  const [active, setActive] = useState(false);
  const { partial, label } = cellLabel(props);
  const mark = <FeeMark state={props.state} partial={partial} className={cn(props.exempt && "opacity-40")} />;
  if (!props.canEdit) return <span className="inline-grid" title={label} role="img" aria-label={label}>{mark}</span>;
  if (!active) return <button type="button" className={triggerClass} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={false} onClick={() => setActive(true)}>{mark}</button>;
  return <FeeCellEditor {...props} />;
}

/** Caixinha com o popover de edição (tesouraria); montada aberta, no primeiro clique. */
function FeeCellEditor({ name, month, state, record, suggestion, splits, onChange, exempt }: CellProps) {
  const [open, setOpen] = useState(true);
  // status escolhido no popover; com ele definido, observação e vínculos gravam sozinhos
  const [chosen, setChosen] = useState<FeeStatus | null>(record?.status ?? null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // gravação da observação aguardando o debounce (executada antes ao fechar o popover)
  const pendingSave = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  useEffect(() => () => { if (pendingSave.current) { clearTimeout(pendingSave.current.timer); pendingSave.current.run(); } }, []);
  const [note, setNote] = useState(record?.note ?? suggestion?.note ?? "");
  const [linked, setLinked] = useState<Set<string>>(new Set(record?.splitIds ?? (suggestion ? [suggestion.splitId] : [])));
  const { partial, label } = cellLabel({ name, month, state, record, suggestion });
  const mark = <FeeMark state={state} partial={partial} className={cn(exempt && "opacity-40")} />;

  const reset = () => {
    setNote(record?.note ?? suggestion?.note ?? "");
    setLinked(new Set(record?.splitIds ?? (suggestion ? [suggestion.splitId] : [])));
    setChosen(record?.status ?? null);
    setSaveState("idle");
  };
  const cancelPending = () => { if (pendingSave.current) { clearTimeout(pendingSave.current.timer); pendingSave.current = null; } };
  const flushPending = () => { const pending = pendingSave.current; cancelPending(); pending?.run(); };
  const save = async (status: FeeStatus, nextNote: string, nextLinked: Set<string>) => {
    setSaveState("saving");
    await onChange({ status, note: nextNote, splitIds: [...nextLinked] });
    setSaveState("saved");
  };
  // escolher o status grava e mantém o popover aberto para a observação; Limpar apaga e fecha
  const apply = (status: FeeStatus | null) => {
    cancelPending();
    if (!status) { void onChange({ status: null, splitIds: [] }); setChosen(null); setOpen(false); return; }
    setChosen(status);
    void save(status, note, linked);
  };
  const editNote = (value: string) => {
    setNote(value);
    if (!chosen) return;
    cancelPending();
    const status = chosen;
    const run = () => { void save(status, value, linked); };
    pendingSave.current = { timer: setTimeout(() => { pendingSave.current = null; run(); }, NOTE_DEBOUNCE_MS), run };
  };
  const toggle = (id: string) => {
    const next = new Set(linked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setLinked(next);
    if (chosen) { cancelPending(); void save(chosen, note, next); }
  };
  const noteId = `fee-note-${month}-${name.replace(/\W+/g, "-")}`;

  return <Popover open={open} onOpenChange={(next) => { if (next) reset(); else flushPending(); setOpen(next); }}>
    <PopoverTrigger render={<button type="button" className={triggerClass} aria-label={label} title={label} />}>
      {mark}
    </PopoverTrigger>
    <PopoverContent align="center" className="w-80 gap-3 p-3">
      <p className="m-0 text-sm font-semibold">{name} · {FEE_MONTH_NAMES[month]}</p>
      {state === "sugestao" && suggestion && <p className="m-0 text-xs text-muted-foreground">
        Sugestão a partir do fluxo de caixa: {suggestion.status === "atencao" ? `atenção (${suggestion.note})` : suggestion.integral ? "pago (pagamento integral do ano)" : "pago"}.
      </p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        <Button size="sm" variant={chosen === "pago" ? "default" : "outline"} aria-pressed={chosen === "pago"} onClick={() => apply("pago")}><IconCheck data-icon="inline-start" /> Pago</Button>
        <Button size="sm" variant="outline" aria-pressed={chosen === "atencao"} className={cn(chosen === "atencao" && "border-attention-strong bg-attention text-attention-foreground hover:bg-attention")} onClick={() => apply("atencao")}><IconAlertTriangle data-icon="inline-start" /> Atenção</Button>
        <Button size="sm" variant="outline" aria-pressed={chosen === "nao_pago"} className={cn("text-destructive", chosen === "nao_pago" && "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:text-destructive-foreground")} onClick={() => apply("nao_pago")}><IconX data-icon="inline-start" /> Não pago</Button>
        <Button size="sm" variant="outline" aria-pressed={chosen === "isento"} className={cn("text-success", chosen === "isento" && "border-success/40 bg-success/10 hover:bg-success/15")} onClick={() => apply("isento")}><IconCircleCheck data-icon="inline-start" /> Isento</Button>
        {(record || chosen) && <Button size="sm" variant="ghost" onClick={() => apply(null)}>Limpar</Button>}
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={noteId}>Observação</Label>
          <span className="text-[11px] text-muted-foreground" aria-live="polite">{saveState === "saving" ? "Salvando…" : saveState === "saved" ? "Salvo" : ""}</span>
        </div>
        <Input id={noteId} value={note} maxLength={200} onChange={(e) => editNote(e.target.value)} placeholder="Ex.: prometeu até dia 20; isento: bolsa" />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-xs font-semibold">Rateios de mensalidade vinculados</legend>
        {splits.length === 0 && <p className="m-0 text-xs text-muted-foreground">Nenhum rateio de mensalidade deste associado no ano.</p>}
        {splits.map((split) => <Label key={split.splitId} className="items-start font-normal">
          <Checkbox checked={linked.has(split.splitId)} onCheckedChange={() => toggle(split.splitId)} />
          <span className="grid">
            <span><span className="num">{dateBR(split.entryDate)}</span> · <span className="num">{money(split.amountCents / 100)}</span>
              {split.linkedPeriods.length > 0 && <span className="text-muted-foreground"> · já em {split.linkedPeriods.map((p) => FEE_MONTH_NAMES[p % 100] ?? p).join(", ")}</span>}</span>
            <Link href={`/financeiro/lancamentos/${split.entryId}`} className="text-xs text-primary hover:underline">{split.description || "ver lançamento"}</Link>
          </span>
        </Label>)}
        <p className="m-0 text-xs text-muted-foreground">{chosen
          ? "Observação e vínculos são gravados automaticamente."
          : "Escolha Pago, Atenção, Não pago ou Isento para gravar; depois disso, observação e vínculos são gravados automaticamente."}</p>
      </fieldset>
    </PopoverContent>
  </Popover>;
}
