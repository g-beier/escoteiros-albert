"use client";

import { useState, type ReactNode } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Badge } from "@geas/ui/components/badge";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Label } from "@geas/ui/components/label";
import { Input } from "@geas/ui/components/input";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { addFunction, deleteFunction, endFunction, updateFunction } from "@/app/(associados)/associados/actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import {
  FUNCTION_KINDS,
  functionKindLabels,
  isFunctionActive,
  type AssociateFunction,
} from "@/lib/associates/controls";
import { branchLabels, SECTION_BRANCHES, type SectionItem } from "@/lib/associates/model";
import { dateBR } from "@/lib/format";
import { Field } from "./associate-form";

const kindOptions = FUNCTION_KINDS.map((value) => ({ value, label: functionKindLabels[value] }));

type Dialog = { kind: "nova" } | { kind: "editar" | "encerrar" | "apagar"; fn: AssociateFunction } | null;

/** Seções que o escotista pode escolher: as ativas (mais a atual da função), na ordem dos ramos e por nome. */
function sectionOptions(sections: SectionItem[], currentId: string | null) {
  return sections
    .filter((s) => s.active || s.id === currentId)
    .sort(
      (a, b) =>
        SECTION_BRANCHES.indexOf(a.branch) - SECTION_BRANCHES.indexOf(b.branch) ||
        a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
    )
    .map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} (inativa)`, detail: branchLabels[s.branch] }));
}

/**
 * Funções do adulto (escotista de uma seção, dirigente), atuais e encerradas. Quem edita adiciona e, por linha, só
 * "Editar": encerrar e apagar ficam no diálogo de edição. O escotista conta no efetivo da seção (Configurações › Seções).
 */
export function AssociateFunctions({
  associateName,
  associateId,
  functions,
  sections,
  canEdit,
  today,
}: {
  associateName: string;
  associateId: string;
  functions: AssociateFunction[];
  sections: SectionItem[];
  canEdit: boolean;
  today: string;
}) {
  const [open, setOpen] = useState<Dialog>(null);
  const close = (value: boolean) => {
    if (!value) setOpen(null);
  };
  const active = functions.filter((fn) => isFunctionActive(fn, today)).length;
  const label = (fn: AssociateFunction) => [functionKindLabels[fn.kind], fn.title].filter(Boolean).join(": ");

  return (
    <SectionCard aria-labelledby="functions-title">
      <SectionHeader
        title="Funções"
        titleId="functions-title"
        description="Escotista (de uma seção), dirigente, honorífico ou comissão fiscal, com início e fim."
      >
        <SectionCount>
          {active} {active === 1 ? "ativa" : "ativas"}
        </SectionCount>
        {canEdit && (
          <Button onClick={() => setOpen({ kind: "nova" })}>
            <IconPlus data-icon="inline-start" /> Adicionar função
          </Button>
        )}
      </SectionHeader>
      {functions.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Nenhuma função: aparece em “Sem função” na lista.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableCaption className="sr-only">Funções do associado</TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD_CLASS}>Função</TableHead>
                <TableHead className={HEAD_CLASS}>Seção</TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-28")}>Início</TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-28")}>Fim</TableHead>
                {canEdit && (
                  <TableHead className={cn(HEAD_CLASS, "w-20")}>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {functions.map((fn) => {
                const current = isFunctionActive(fn, today);
                return (
                  <TableRow key={fn.id} className={cn(!current && "text-muted-foreground")}>
                    <TableCell className={cn(CELL_CLASS, "font-medium whitespace-normal")}>
                      {label(fn)}
                      {fn.elected && (
                        <Badge variant="outline" className="ml-2 align-middle">
                          eleito
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>
                      {fn.section ?? (fn.kind === "escotista" ? <span className="text-caution">sem seção</span> : "—")}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, "num")}>
                      {fn.started_on ? dateBR(fn.started_on) : "—"}
                    </TableCell>
                    <TableCell className={cn(CELL_CLASS, "num")}>
                      {fn.ended_on ? dateBR(fn.ended_on) : <span className="text-success">em exercício</span>}
                    </TableCell>
                    {canEdit && (
                      <TableCell className={CELL_CLASS}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOpen({ kind: "editar", fn })}
                          aria-label={`Editar ${label(fn)}`}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canEdit && (
        <>
          {open?.kind === "nova" && (
            <FunctionDialog
              onOpenChange={close}
              title={`Nova função de ${associateName}`}
              sections={sections}
              today={today}
              hidden={{ associateId }}
            />
          )}
          {open?.kind === "editar" && (
            <FunctionDialog
              key={open.fn.id}
              onOpenChange={close}
              title={`Editar ${label(open.fn)}`}
              sections={sections}
              today={today}
              hidden={{ functionId: open.fn.id }}
              fn={open.fn}
              footerStart={
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setOpen({ kind: "apagar", fn: open.fn })}
                  >
                    Apagar
                  </Button>
                  {!open.fn.ended_on && (
                    <Button type="button" variant="outline" onClick={() => setOpen({ kind: "encerrar", fn: open.fn })}>
                      Encerrar
                    </Button>
                  )}
                </>
              }
            />
          )}
          {open && (open.kind === "encerrar" || open.kind === "apagar") && (
            <>
              <ActionDialog
                open={open.kind === "encerrar"}
                onOpenChange={close}
                title={`Encerrar ${label(open.fn)}`}
                action={endFunction}
                submitLabel="Encerrar função"
                hidden={{ functionId: open.fn.id }}
                description="A função fica no histórico, com a data de fim."
              >
                <Field id="function-end" label="Fim">
                  <Input
                    id="function-end"
                    name="endedOn"
                    type="date"
                    required
                    min={open.fn.started_on ?? undefined}
                    max={today}
                    defaultValue={today}
                    className="num"
                  />
                </Field>
              </ActionDialog>
              <ActionDialog
                open={open.kind === "apagar"}
                onOpenChange={close}
                title={`Apagar ${label(open.fn)}?`}
                action={deleteFunction}
                submitLabel="Apagar"
                destructive
                hidden={{ functionId: open.fn.id }}
                description="Use só para corrigir um lançamento errado; para registrar que a função acabou, encerre."
              >
                <span className="sr-only">Confirme para apagar.</span>
              </ActionDialog>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}

/**
 * Nova função (sem `fn`) ou edição. Grade de 2 colunas: Tipo | Cargo; Seção (só escotista, obrigatória) numa linha
 * própria, na metade esquerda; Início | Fim (na edição) sempre lado a lado.
 */
function FunctionDialog({
  onOpenChange,
  title,
  sections,
  today,
  hidden,
  fn,
  footerStart,
}: {
  onOpenChange: (open: boolean) => void;
  title: string;
  sections: SectionItem[];
  today: string;
  hidden: Record<string, string>;
  fn?: AssociateFunction;
  /** Na edição: Apagar e Encerrar, que trocam para os diálogos de confirmação. */
  footerStart?: ReactNode;
}) {
  const [kind, setKind] = useState<string>(fn?.kind ?? "escotista");
  const [sectionId, setSectionId] = useState(fn?.section_id ?? "");
  const options = sectionOptions(sections, fn?.section_id ?? null);
  const [elected, setElected] = useState(fn?.elected ?? false);
  const scouter = kind === "escotista";
  const board = kind === "dirigente";
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title={title}
      action={fn ? updateFunction : addFunction}
      submitLabel={fn ? "Salvar função" : "Adicionar função"}
      hidden={{ ...hidden, kind, sectionId: scouter ? sectionId : "", elected: board && elected ? "on" : "" }}
      footerStart={footerStart}
      description={
        fn
          ? "Corrige a função. Fim vazio: em exercício."
          : "Um adulto pode ter várias funções ao mesmo tempo, inclusive escotista e dirigente."
      }
    >
      <Field id="function-kind" label="Tipo">
        <OptionSelect id="function-kind" value={kind} onValueChange={setKind} options={kindOptions} />
      </Field>
      <Field id="function-title" label="Cargo (opcional)">
        <Input
          id="function-title"
          name="title"
          maxLength={80}
          defaultValue={fn?.title ?? ""}
          placeholder="Ex.: Chefe de seção, Presidente"
        />
      </Field>
      {scouter && (
        <Field
          id="function-section"
          label="Seção"
          className="sm:col-start-1"
          hint={options.length ? undefined : "Nenhuma seção ativa: cadastre em Configurações › Seções."}
        >
          <OptionSelect id="function-section" value={sectionId} onValueChange={setSectionId} options={options} />
        </Field>
      )}
      {board && (
        <div className="flex items-center gap-2 sm:col-start-1 sm:pt-1">
          <Checkbox
            id="function-elected"
            checked={elected}
            onCheckedChange={(checked) => setElected(checked === true)}
          />
          <Label htmlFor="function-elected">Eleito (membro eleito da diretoria)</Label>
        </div>
      )}
      <Field id="function-start" label="Início" className="sm:col-start-1">
        <Input
          id="function-start"
          name="startedOn"
          type="date"
          required
          max={today}
          defaultValue={fn ? (fn.started_on ?? "") : today}
          className="num"
        />
      </Field>
      {fn && (
        <Field id="function-end-edit" label="Fim (opcional)">
          <Input
            id="function-end-edit"
            name="endedOn"
            type="date"
            max={today}
            defaultValue={fn.ended_on ?? ""}
            className="num"
          />
        </Field>
      )}
    </ActionDialog>
  );
}
