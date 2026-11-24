"use client";

import { startTransition, useActionState, useState } from "react";
import { IconPencil, IconPlus, IconWand } from "@tabler/icons-react";
import { Badge } from "@geas/ui/components/badge";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Textarea } from "@geas/ui/components/textarea";
import { ActionForm } from "@geas/ui/components/action-form";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import {
  applySuggestion, deletePeriod, deleteEvent, deliverStar, saveEvent, saveNotes, savePeriod, setStarBranch,
} from "@/app/(associados)/associados/life-actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import { dateBR } from "@/lib/format";
import { SCOUT_BRANCHES, type ScoutBranch } from "@/lib/associates/model";
import {
  lifeBranchColor, lifeBranchLabel, lifeBranchShort, lifeSourceLabels, type LifeEvent, type LifePeriod, type Star, type SuggestedPeriod,
} from "@/lib/associates/scout-life";
import { Field } from "../associate-form";

const branchOptions = SCOUT_BRANCHES.map((value) => ({ value, label: lifeBranchLabel(value) }));

function BranchSwatch({ branch }: { branch: ScoutBranch }) {
  return <span className="inline-flex items-center gap-1.5">
    <span className="size-2.5 shrink-0 rounded-sm border border-black/10" style={{ background: lifeBranchColor(branch) }} aria-hidden />{lifeBranchLabel(branch)}
  </span>;
}
const until = (date: string | null) => (date ? dateBR(date) : "vigente");

// Eventos ---------------------------------------------------------------------------------------------------------

function EventDialog({ associateId, event, today, onOpenChange }: { associateId: string; event?: LifeEvent; today: string; onOpenChange: (open: boolean) => void }) {
  const [confirm, setConfirm] = useState(false);
  if (event && confirm) {
    return <ActionDialog open onOpenChange={onOpenChange} title={`Apagar “${event.title}”?`} action={deleteEvent} submitLabel="Apagar" destructive
      hidden={{ eventId: event.id }} description="O evento sai da linha do tempo.">
      <span className="sr-only">Confirme para apagar.</span>
    </ActionDialog>;
  }
  return <ActionDialog open onOpenChange={onOpenChange} title={event ? "Corrigir evento" : "Incluir evento"} action={saveEvent}
    submitLabel={event ? "Salvar evento" : "Incluir evento"} hidden={{ associateId, eventId: event?.id ?? "" }}
    footerStart={event && <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>Apagar</Button>}
    description="Fatos do histórico: distintivos, acampamentos, cargos, mudanças de seção, informações recuperadas.">
    <Field id="event-date" label="Data">
      <Input id="event-date" name="date" type="date" required max={today} defaultValue={event?.event_date ?? today} className="num" />
    </Field>
    <Field id="event-title" label="Título">
      <Input id="event-title" name="title" required maxLength={80} defaultValue={event?.title ?? ""} placeholder="Ex.: Cruzeiro do Sul" />
    </Field>
    <Field id="event-description" label="Descrição (opcional)" className="sm:col-span-2">
      <Textarea id="event-description" name="description" maxLength={1000} rows={3} defaultValue={event?.description ?? ""} />
    </Field>
  </ActionDialog>;
}

export function AddEventButton({ associateId, today }: { associateId: string; today: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}><IconPlus data-icon="inline-start" /> Incluir evento</Button>
    {open && <EventDialog associateId={associateId} today={today} onOpenChange={setOpen} />}
  </>;
}

export function EditEventButton({ associateId, event, today }: { associateId: string; event: LifeEvent; today: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="ghost" size="icon-sm" aria-label={`Corrigir ${event.title}`} onClick={() => setOpen(true)}><IconPencil /></Button>
    {open && <EventDialog associateId={associateId} event={event} today={today} onOpenChange={setOpen} />}
  </>;
}

// Períodos --------------------------------------------------------------------------------------------------------

function PeriodDialog({ associateId, period, today, onOpenChange }: { associateId: string; period?: LifePeriod; today: string; onOpenChange: (open: boolean) => void }) {
  const [branch, setBranch] = useState<string>(period?.branch ?? "lobinho");
  const [confirm, setConfirm] = useState(false);
  if (period && confirm) {
    return <ActionDialog open onOpenChange={onOpenChange} title="Apagar período?" action={deletePeriod} submitLabel="Apagar" destructive
      hidden={{ periodId: period.id }} description={`${lifeBranchLabel(period.branch)}, de ${dateBR(period.started_on)} a ${until(period.ended_on)}. Use só para lançamento errado.`}>
      <span className="sr-only">Confirme para apagar.</span>
    </ActionDialog>;
  }
  return <ActionDialog open onOpenChange={onOpenChange} title={period ? "Corrigir período" : "Incluir período"} action={savePeriod}
    submitLabel={period ? "Salvar período" : "Incluir período"} hidden={{ associateId, periodId: period?.id ?? "", branch }}
    footerStart={period && <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)}>Apagar</Button>}
    description="Tempo em atividade num ramo (ou como escotista ou dirigente). Fim vazio: vigente. Lacunas são o tempo sem período.">
    <Field id="period-branch" label="Ramo">
      <OptionSelect id="period-branch" value={branch} onValueChange={setBranch} options={branchOptions} />
    </Field>
    <Field id="period-place" label="Outro grupo (opcional)" hint="Vazio: neste grupo.">
      <Input id="period-place" name="place" maxLength={80} defaultValue={period?.place ?? ""} placeholder="Ex.: GE Exemplo" />
    </Field>
    <Field id="period-start" label="Início">
      <Input id="period-start" name="startedOn" type="date" required max={today} defaultValue={period?.started_on ?? ""} className="num" />
    </Field>
    <Field id="period-end" label="Fim (opcional)" hint="O dia da passagem ou da saída.">
      <Input id="period-end" name="endedOn" type="date" max={today} defaultValue={period?.ended_on ?? ""} className="num" />
    </Field>
  </ActionDialog>;
}

/** Períodos da pessoa, do mais antigo ao mais recente; quem edita inclui e corrige (apagar fica no diálogo). */
export function PeriodsEditor({ associateId, periods, canEdit, today }: { associateId: string; periods: LifePeriod[]; canEdit: boolean; today: string }) {
  const [open, setOpen] = useState<LifePeriod | "novo" | null>(null);
  const close = (value: boolean) => { if (!value) setOpen(null); };
  return <SectionCard aria-labelledby="periods-title">
    <SectionHeader title="Períodos" titleId="periods-title" description="O vigente acompanha o cadastro sozinho; os passados são lançados aqui.">
      <SectionCount>{periods.length} {periods.length === 1 ? "período" : "períodos"}</SectionCount>
      {canEdit && <Button onClick={() => setOpen("novo")}><IconPlus data-icon="inline-start" /> Incluir período</Button>}
    </SectionHeader>
    {periods.length === 0
      ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum período registrado.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[560px]">
        <TableCaption className="sr-only">Períodos de atividade</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={HEAD_CLASS}>Ramo</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28")}>Início</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28")}>Fim</TableHead>
          <TableHead className={HEAD_CLASS}>Onde</TableHead>
          <TableHead className={HEAD_CLASS}>Origem</TableHead>
          {canEdit && <TableHead className={cn(HEAD_CLASS, "w-12")}><span className="sr-only">Ações</span></TableHead>}
        </TableRow></TableHeader>
        <TableBody>{periods.map((p) => <TableRow key={p.id}>
          <TableCell className={CELL_CLASS}><BranchSwatch branch={p.branch} /></TableCell>
          <TableCell className={cn(CELL_CLASS, "num")}>{dateBR(p.started_on)}</TableCell>
          <TableCell className={cn(CELL_CLASS, "num")}>{p.ended_on ? dateBR(p.ended_on) : <Badge variant="success" size="md">vigente</Badge>}</TableCell>
          <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>{p.place ?? <span className="text-muted-foreground">este grupo</span>}</TableCell>
          <TableCell className={cn(CELL_CLASS, "text-muted-foreground")}>{lifeSourceLabels[p.source]}</TableCell>
          {canEdit && <TableCell className={CELL_CLASS}>
            <Button variant="ghost" size="icon-sm" aria-label={`Corrigir período ${lifeBranchShort(p.branch)} de ${dateBR(p.started_on)}`} onClick={() => setOpen(p)}><IconPencil /></Button>
          </TableCell>}
        </TableRow>)}</TableBody>
      </Table></div>}
    {open && <PeriodDialog associateId={associateId} period={open === "novo" ? undefined : open} today={today} onOpenChange={close} />}
  </SectionCard>;
}

/** Períodos que o cadastro (entradas, passagens, funções) sugere para a parte ainda sem registro. */
export function SuggestionCard({ associateId, periods, canEdit }: { associateId: string; periods: SuggestedPeriod[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(applySuggestion, {} as ActionResult);
  useActionToast(state);
  return <SectionCard aria-labelledby="suggestion-title">
    <SectionHeader title="Sugestão do cadastro" titleId="suggestion-title"
      description="Montada com as entradas, passagens e funções registradas; confira antes de incluir. Depois, corrija em Períodos." />
    <ul className="m-0 grid list-none gap-1 px-4 py-3 text-sm">{periods.map((p) => <li key={`${p.branch}-${p.started_on}`} className="flex flex-wrap items-center gap-3">
      <BranchSwatch branch={p.branch} />
      <span className="num text-muted-foreground">{dateBR(p.started_on)} – {until(p.ended_on)}</span>
    </li>)}</ul>
    {canEdit && <ActionForm action={action} result={state} className="border-t px-4 py-3">
      <input type="hidden" name="associateId" value={associateId} />
      <input type="hidden" name="periods" value={JSON.stringify(periods)} />
      <Button type="submit" variant="outline" disabled={pending}><IconWand data-icon="inline-start" /> {pending ? "Incluindo…" : "Incluir sugestão"}</Button>
    </ActionForm>}
  </SectionCard>;
}

// Estrelas --------------------------------------------------------------------------------------------------------

const STATUS = {
  entregue: { label: "entregue", variant: "success" },
  pendente: { label: "a entregar", variant: "caution" },
  proxima: { label: "próxima", variant: "info" },
  futura: { label: "futura", variant: "muted" },
} as const;

function StarDialog({ associateId, star, onOpenChange }: { associateId: string; star: Star; onOpenChange: (open: boolean) => void }) {
  const [branch, setBranch] = useState<string>(star.overridden && star.branch ? star.branch : "");
  return <ActionDialog open onOpenChange={onOpenChange} title={`${star.n}ª estrela`} action={setStarBranch} submitLabel="Salvar ramo"
    hidden={{ associateId, star: String(star.n), branch }}
    description={<>Completa em <span className="num">{dateBR(star.dueOn)}</span>. O ramo calculado é o de mais atividade nesses 12 meses, sem janeiro e fevereiro{star.computedBranch && ` (${lifeBranchShort(star.computedBranch)})`}.</>}
    footerStart={star.deliveredOn && <DeliveryUndo associateId={associateId} star={star.n} />}>
    <Field id="star-branch" label="Ramo da estrela" className="sm:col-span-2">
      <OptionSelect id="star-branch" value={branch} onValueChange={setBranch} options={[{ value: "", label: "Calculado" }, ...branchOptions]} />
    </Field>
  </ActionDialog>;
}

function DeliveryUndo({ associateId, star }: { associateId: string; star: number }) {
  const [state, action, pending] = useActionState(deliverStar, {} as ActionResult);
  useActionToast(state);
  return <Button type="button" variant="ghost" disabled={pending} onClick={() => {
    const data = new FormData();
    data.set("associateId", associateId); data.set("star", String(star)); data.set("undo", "1");
    startTransition(() => action(data));
  }}>{pending ? "Desfazendo…" : "Desfazer entrega"}</Button>;
}

/** Estrelas vencidas e a próxima: data, ramo (calculado ou corrigido) e situação. */
export function StarsEditor({ associateId, stars, canEdit, today }: { associateId: string; stars: Star[]; canEdit: boolean; today: string }) {
  const [open, setOpen] = useState<Star | null>(null);
  return <SectionCard aria-labelledby="stars-title">
    <SectionHeader title="Estrelas de atividade" titleId="stars-title" description="Uma a cada 12 meses de atividade desde a promessa. Entregar uma quita as anteriores.">
      <SectionCount>{stars.filter((s) => s.dueOn <= today).length}</SectionCount>
    </SectionHeader>
    {stars.length === 0
      ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma estrela ainda.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[480px]">
        <TableCaption className="sr-only">Estrelas de atividade</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={cn(HEAD_CLASS, "w-14")}>Nº</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28")}>Completa em</TableHead>
          <TableHead className={HEAD_CLASS}>Ramo</TableHead>
          <TableHead className={HEAD_CLASS}>Situação</TableHead>
          {canEdit && <TableHead className={cn(HEAD_CLASS, "w-12")}><span className="sr-only">Ações</span></TableHead>}
        </TableRow></TableHeader>
        <TableBody>{[...stars].reverse().map((s) => <TableRow key={s.n}>
          <TableCell className={cn(CELL_CLASS, "num font-semibold")}>{s.n}ª</TableCell>
          <TableCell className={cn(CELL_CLASS, "num")}>{dateBR(s.dueOn)}</TableCell>
          <TableCell className={CELL_CLASS}>{s.branch ? <BranchSwatch branch={s.branch} /> : "—"}{s.overridden && <span className="ml-1 text-[11px] text-muted-foreground">(corrigido)</span>}</TableCell>
          <TableCell className={CELL_CLASS}>
            <Badge variant={STATUS[s.status].variant} size="md">{STATUS[s.status].label}</Badge>
            {s.deliveredOn && <span className="num ml-2 text-xs text-muted-foreground">em {dateBR(s.deliveredOn)}</span>}
          </TableCell>
          {canEdit && <TableCell className={CELL_CLASS}>
            <Button variant="ghost" size="icon-sm" aria-label={`Corrigir ${s.n}ª estrela`} onClick={() => setOpen(s)}><IconPencil /></Button>
          </TableCell>}
        </TableRow>)}</TableBody>
      </Table></div>}
    {open && <StarDialog associateId={associateId} star={open} onOpenChange={(value) => { if (!value) setOpen(null); }} />}
  </SectionCard>;
}

// Anotações -------------------------------------------------------------------------------------------------------

/** Anotações de histórico: texto livre, sem data, para recuperar informações perdidas. */
export function NotesEditor({ associateId, notes, canEdit }: { associateId: string; notes: string | null; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveNotes, {} as ActionResult);
  useActionToast(state);
  return <SectionCard aria-labelledby="notes-title">
    <SectionHeader title="Anotações de histórico" titleId="notes-title" description="Informações para recuperar o histórico (sem data)." />
    {canEdit
      ? <ActionForm action={action} className="grid gap-3 px-4 py-3">
        <input type="hidden" name="associateId" value={associateId} />
        <Field id="life-notes" label="Anotações">
          <Textarea id="life-notes" name="notes" rows={4} maxLength={4000} defaultValue={notes ?? ""} />
        </Field>
        <div><Button type="submit" variant="outline" disabled={pending}>{pending ? "Salvando…" : "Salvar anotações"}</Button></div>
      </ActionForm>
      : <p className="m-0 px-4 py-3 text-sm whitespace-pre-line">{notes ?? <span className="text-xs text-muted-foreground">Sem anotações.</span>}</p>}
  </SectionCard>;
}
