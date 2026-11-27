"use client";

import { useActionState, useState } from "react";
import { IconAlertTriangle, IconAward } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { ActionForm } from "@geas/ui/components/action-form";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { deliverStar, switchPeriod } from "@/app/(associados)/associados/life-actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import { dateBR } from "@/lib/format";
import { lifeBranchLabel, lifeBranchShort, type LifeMismatch, type Star } from "@/lib/associates/scout-life";
import { Field } from "../associate-form";

/**
 * Estrela a entregar (aviso que começa 15 dias antes e fica até a entrega): "Certificado entregue" grava a data e
 * quita as estrelas anteriores.
 */
export function StarNotice({
  associateId,
  star,
  previous,
  canEdit,
  today,
}: {
  associateId: string;
  star: Star;
  previous: number;
  canEdit: boolean;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const late = star.dueOn <= today;
  return (
    <div
      role="note"
      aria-label="Estrela de atividade a entregar"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm",
        late ? "border-caution/40 bg-caution-soft" : "border-primary/30 bg-accent/40",
      )}
    >
      <IconAward className={cn("size-5 shrink-0", late ? "text-caution" : "text-primary")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="m-0">
          <strong>{star.n}ª estrela de atividade</strong>
          {star.branch && ` (${lifeBranchShort(star.branch)})`}: {late ? "certificado a entregar" : "chega em breve"}.
        </p>
        <p className="m-0 text-xs text-muted-foreground">
          {late ? "Completou em" : "Completa em"} <span className="num">{dateBR(star.dueOn)}</span>
          {previous > 0 && ` · entregar também quita ${previous === 1 ? "a anterior" : `as ${previous} anteriores`}`}
        </p>
      </div>
      {canEdit && (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Certificado entregue
        </Button>
      )}
      {open && (
        <ActionDialog
          open
          onOpenChange={setOpen}
          title={`Entrega da ${star.n}ª estrela`}
          action={deliverStar}
          submitLabel="Registrar entrega"
          hidden={{ associateId, star: String(star.n) }}
          description="Registra a entrega do certificado. As estrelas anteriores ficam resolvidas junto."
        >
          <Field id="star-delivered" label="Data da entrega">
            <Input
              id="star-delivered"
              name="date"
              type="date"
              required
              max={today}
              defaultValue={today}
              className="num"
            />
          </Field>
        </ActionDialog>
      )}
    </div>
  );
}

const MISMATCH_TEXT = {
  abrir: (m: Extract<LifeMismatch, { kind: "abrir" }>) =>
    `O cadastro diz ${lifeBranchLabel(m.expected)}, mas não há período vigente.`,
  encerrar: (m: Extract<LifeMismatch, { kind: "encerrar" }>) =>
    `Há período vigente (${lifeBranchLabel(m.open.branch)}), mas o cadastro não conta mais (desligado ou sem função de escotista ou dirigente).`,
  trocar: (m: Extract<LifeMismatch, { kind: "trocar" }>) =>
    `O período vigente é ${lifeBranchLabel(m.open.branch)}, mas o cadastro diz ${lifeBranchLabel(m.expected)}.`,
};
const MISMATCH_ACTION = { abrir: "Abrir período", encerrar: "Encerrar período", trocar: "Trocar período" };

/** O período vigente não bate com o cadastro: ajuste em uma data (sugerida pelo último evento do cadastro). */
export function MismatchNotice({
  associateId,
  mismatch,
  canEdit,
  today,
}: {
  associateId: string;
  mismatch: LifeMismatch;
  canEdit: boolean;
  today: string;
}) {
  const [state, action, pending] = useActionState(switchPeriod, {} as ActionResult);
  useActionToast(state);
  const text =
    mismatch.kind === "abrir"
      ? MISMATCH_TEXT.abrir(mismatch)
      : mismatch.kind === "encerrar"
        ? MISMATCH_TEXT.encerrar(mismatch)
        : MISMATCH_TEXT.trocar(mismatch);
  const next = mismatch.kind === "encerrar" ? "" : mismatch.expected;
  return (
    <ActionForm
      action={action}
      result={state}
      role="note"
      aria-label="Período vigente diferente do cadastro"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-sm"
    >
      <input type="hidden" name="associateId" value={associateId} />
      <input type="hidden" name="branch" value={next} />
      <IconAlertTriangle className="mb-1 size-5 shrink-0 self-start text-caution" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <p className="m-0">{text}</p>
        <p className="m-0 text-xs text-muted-foreground">
          O período vigente segue o cadastro sozinho nas passagens, desligamentos, reingressos e funções; ajuste aqui o
          que ficou diferente.
        </p>
      </div>
      {canEdit && (
        <>
          <Field id="mismatch-date" label="Na data">
            <Input
              id="mismatch-date"
              name="date"
              type="date"
              required
              max={today}
              defaultValue={mismatch.date}
              className="w-40 num"
            />
          </Field>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Ajustando…" : MISMATCH_ACTION[mismatch.kind]}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
