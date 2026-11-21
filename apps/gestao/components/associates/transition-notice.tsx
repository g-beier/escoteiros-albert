"use client";

import { useActionState } from "react";
import { IconAlertTriangle, IconArrowsRightLeft, IconHourglass } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { setTransition } from "@/app/(associados)/associados/actions";
import { TRANSITIONS, type Transition } from "@/lib/associates/alerts";
import { dateBR } from "@/lib/format";

const TONE = {
  aviso: "border-caution/40 bg-caution-soft",
  iniciada: "border-primary/30 bg-accent/40",
  critico: "border-destructive/40 bg-destructive/10",
} as const;

/**
 * Transição de ramo no cadastro do jovem (alertas em lib/associates/alerts.ts): o alerta do momento, as datas e o botão
 * "Começamos a transição" (no Pioneiro, "Partida programada"), que troca o aviso por "em transição". A passagem ou o
 * desligamento, no cabeçalho, encerram a transição.
 */
export function TransitionNotice({ associateId, transition, branch, canEdit, today }: {
  associateId: string; transition: Transition; branch: string; canEdit: boolean; today: string;
}) {
  const [state, action, pending] = useActionState(setTransition, {} as ActionResult);
  useActionToast(state);
  const rule = TRANSITIONS.find((t) => t.branch === branch);
  const partida = branch === "pioneiro";
  const Icon = transition.level === "critico" ? IconAlertTriangle : transition.level === "iniciada" ? IconArrowsRightLeft : IconHourglass;
  return <form action={action} role="note" aria-label={transition.label}
    className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm", TONE[transition.level])}>
    <input type="hidden" name="id" value={associateId} />
    <input type="hidden" name="date" value={today} />
    <Icon className={cn("size-5 shrink-0", transition.level === "critico" ? "text-destructive" : transition.level === "aviso" ? "text-caution" : "text-primary")} aria-hidden />
    <div className="min-w-0 flex-1">
      <p className="m-0"><strong>{transition.label}:</strong> {transition.text}.</p>
      <p className="m-0 text-xs text-muted-foreground">
        {transition.startedOn && <>{partida ? "Programada" : "Iniciada"} em <span className="num">{dateBR(transition.startedOn)}</span> · </>}
        {partida ? "Partida até" : "Passagem até"} <span className="num">{dateBR(transition.criticalOn)}</span>
        {transition.level === "critico" && (partida ? ": desligue ou faça a passagem para adulto." : ": registre a passagem.")}
      </p>
    </div>
    {canEdit && (transition.startedOn
      ? <Button type="submit" name="clear" value="1" variant="ghost" disabled={pending}>Desmarcar</Button>
      : <Button type="submit" variant="outline" disabled={pending}>{pending ? "Marcando…" : rule?.startAction ?? "Começamos a transição"}</Button>)}
  </form>;
}
