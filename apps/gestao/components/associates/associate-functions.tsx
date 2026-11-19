"use client";

import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { addFunction, deleteFunction, endFunction } from "@/app/(associados)/associados/actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import { FUNCTION_KINDS, functionKindLabels, isFunctionActive, type AssociateFunction } from "@/lib/associates/controls";
import { dateBR } from "@/lib/format";
import { Field } from "./associate-form";

const kindOptions = FUNCTION_KINDS.map((value) => ({ value, label: functionKindLabels[value] }));

type Dialog = { kind: "nova" } | { kind: "encerrar" | "apagar"; fn: AssociateFunction } | null;

/** Funções do adulto (escotista, dirigente), atuais e encerradas. Quem edita adiciona, encerra e apaga. */
export function AssociateFunctions({ associateName, associateId, functions, canEdit, today }: {
  associateName: string; associateId: string; functions: AssociateFunction[]; canEdit: boolean; today: string;
}) {
  const [open, setOpen] = useState<Dialog>(null);
  const [kind, setKind] = useState("escotista");
  const close = (value: boolean) => { if (!value) setOpen(null); };
  const active = functions.filter((fn) => isFunctionActive(fn, today)).length;
  const label = (fn: AssociateFunction) => [functionKindLabels[fn.kind], fn.title].filter(Boolean).join(": ");

  return <SectionCard aria-labelledby="functions-title">
    <SectionHeader title="Funções" titleId="functions-title" description="Escotista (de seção) ou dirigente (diretoria), com início e fim. Definem os itens de controle que se aplicam.">
      <SectionCount>{active} {active === 1 ? "ativa" : "ativas"}</SectionCount>
      {canEdit && <Button onClick={() => { setKind("escotista"); setOpen({ kind: "nova" }); }}><IconPlus /> Adicionar função</Button>}
    </SectionHeader>
    {functions.length === 0
      ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhuma função: aparece em “Sem função” na lista.</p>
      : <div className="overflow-x-auto"><Table className="min-w-[560px]">
        <TableCaption className="sr-only">Funções do associado</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={HEAD_CLASS}>Função</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28")}>Início</TableHead>
          <TableHead className={cn(HEAD_CLASS, "w-28")}>Fim</TableHead>
          {canEdit && <TableHead className={cn(HEAD_CLASS, "w-48")}><span className="sr-only">Ações</span></TableHead>}
        </TableRow></TableHeader>
        <TableBody>{functions.map((fn) => {
          const current = isFunctionActive(fn, today);
          return <TableRow key={fn.id} className={cn(!current && "text-muted-foreground")}>
            <TableCell className={cn(CELL_CLASS, "whitespace-normal font-medium")}>{label(fn)}</TableCell>
            <TableCell className={cn(CELL_CLASS, "num")}>{fn.started_on ? dateBR(fn.started_on) : "—"}</TableCell>
            <TableCell className={cn(CELL_CLASS, "num")}>{fn.ended_on ? dateBR(fn.ended_on) : <span className="text-success">em exercício</span>}</TableCell>
            {canEdit && <TableCell className={CELL_CLASS}><div className="flex items-center gap-1.5">
              {!fn.ended_on && <Button variant="outline" size="sm" onClick={() => setOpen({ kind: "encerrar", fn })} aria-label={`Encerrar ${label(fn)}`}>Encerrar</Button>}
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen({ kind: "apagar", fn })} aria-label={`Apagar ${label(fn)}`}>Apagar</Button>
            </div></TableCell>}
          </TableRow>;
        })}</TableBody>
      </Table></div>}

    {canEdit && <>
      <ActionDialog open={open?.kind === "nova"} onOpenChange={close} title={`Nova função de ${associateName}`} action={addFunction} submitLabel="Adicionar função"
        hidden={{ associateId, kind }} description="Um adulto pode ter várias funções ao mesmo tempo, inclusive escotista e dirigente.">
        <Field id="function-kind" label="Tipo">
          <OptionSelect id="function-kind" value={kind} onValueChange={setKind} options={kindOptions} />
        </Field>
        <Field id="function-start" label="Início">
          <Input id="function-start" name="startedOn" type="date" required max={today} defaultValue={today} className="num" />
        </Field>
        <Field id="function-title" label="Cargo (opcional)" className="sm:col-span-2">
          <Input id="function-title" name="title" maxLength={80} placeholder="Ex.: Chefe de seção, Presidente" />
        </Field>
      </ActionDialog>
      {open && open.kind !== "nova" && <>
        <ActionDialog open={open.kind === "encerrar"} onOpenChange={close} title={`Encerrar ${label(open.fn)}`} action={endFunction} submitLabel="Encerrar função"
          hidden={{ functionId: open.fn.id }} description="A função fica no histórico, com a data de fim.">
          <Field id="function-end" label="Fim">
            <Input id="function-end" name="endedOn" type="date" required min={open.fn.started_on ?? undefined} defaultValue={today} className="num" />
          </Field>
        </ActionDialog>
        <ActionDialog open={open.kind === "apagar"} onOpenChange={close} title={`Apagar ${label(open.fn)}?`} action={deleteFunction} submitLabel="Apagar" destructive
          hidden={{ functionId: open.fn.id }} description="Use só para corrigir um lançamento errado; para registrar que a função acabou, encerre.">
          <span className="sr-only">Confirme para apagar.</span>
        </ActionDialog>
      </>}
    </>}
  </SectionCard>;
}
