"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { saveAssociate } from "@/app/(associados)/associados/actions";
import type { AssociateProfile } from "@/lib/associates/model";
import { EMPTY_PLACEMENT, PlacementFields, PlacementSelect, type Catalog } from "./placement-select";

/** Campo com rótulo visível acima. */
export function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return <div className={cn("grid content-start gap-1.5", className)}>
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint && <p className="m-0 text-[11px] text-muted-foreground">{hint}</p>}
  </div>;
}

/**
 * Cadastro e edição do associado. No cadastro escolhe-se a divisão (ramo, seção, equipe); depois ela só muda por
 * passagem, no detalhe. Datas opcionais; sem data de entrada, a entrada fica registrada na data do cadastro.
 */
export function AssociateForm({ catalog, associate, today }: { catalog: Catalog; associate?: AssociateProfile; today: string }) {
  const [state, action, pending] = useActionState(saveAssociate, {} as ActionResult);
  useActionToast(state);
  const [place, setPlace] = useState(EMPTY_PLACEMENT);
  const creating = !associate;

  return <form action={action} className="grid gap-4">
    {associate && <input type="hidden" name="id" value={associate.id} />}
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <Field id="associate-name" label="Nome">
        <Input id="associate-name" name="name" required minLength={2} maxLength={120} defaultValue={associate?.name} autoComplete="off" />
      </Field>
      {creating && <Field id="associate-placement" label="Ramo, seção e equipe" hint="Adulto é só o ramo. A equipe é opcional.">
        <PlacementSelect id="associate-placement" catalog={catalog} value={place} onValueChange={setPlace} />
        <PlacementFields value={place} />
      </Field>}
    </div>
    <div className="grid items-start gap-4 sm:grid-cols-3">
      <Field id="associate-birth" label="Nascimento">
        <Input id="associate-birth" name="birthDate" type="date" max={today} defaultValue={associate?.birth_date ?? ""} className="num" />
      </Field>
      <Field id="associate-promise" label="Promessa">
        <Input id="associate-promise" name="promiseDate" type="date" max={today} defaultValue={associate?.promise_date ?? ""} className="num" />
      </Field>
      <Field id="associate-joined" label="Entrada no grupo" hint={creating ? "Vazio = hoje no histórico, sem data de entrada." : undefined}>
        <Input id="associate-joined" name="joinedOn" type="date" max={today} defaultValue={associate?.joined_on ?? ""} className="num" />
      </Field>
    </div>
    <Field id="associate-notes" label="Observações">
      <Textarea id="associate-notes" name="notes" maxLength={500} rows={3} defaultValue={associate?.notes ?? ""} />
    </Field>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" size="lg" disabled={pending || (creating && !place.branch)}>{pending ? "Salvando…" : creating ? "Cadastrar associado" : "Salvar"}</Button>
      <Link href={associate ? `/associados/${associate.id}` : "/associados"} className={buttonVariants({ variant: "outline", size: "lg" })}>Cancelar</Link>
    </div>
  </form>;
}
