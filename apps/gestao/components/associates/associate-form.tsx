"use client";

import { Link } from "@geas/ui/components/link";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Field as ChoiceField, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@geas/ui/components/field";
import { Label } from "@geas/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@geas/ui/components/radio-group";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { saveAssociate } from "@/app/(associados)/associados/actions";
import { quickAssociate } from "@/app/(gestao)/rapido/actions";
import { NICKNAME_MAX, REGISTRATIONS, registrationLabels, type AssociateProfile, type Placement, type Registration } from "@/lib/associates/model";
import { EMPTY_PLACEMENT, PlacementFields, PlacementSelect, type Catalog } from "./placement-select";
import { ActionForm } from "@geas/ui/components/action-form";

/** Campo com rótulo visível acima. */
export function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return <div className={cn("grid content-start gap-1.5", className)}>
    <Label htmlFor={id}>{label}</Label>
    {children}
    {hint && <p className="m-0 text-[11px] text-muted-foreground">{hint}</p>}
  </div>;
}

/**
 * Cadastro e edição do associado, com a divisão (ramo, seção, equipe). Na edição ela é corrigida sem histórico (055):
 * a passagem de ramo, cerimônia registrada, fica no detalhe. Datas opcionais; sem data de entrada, a entrada fica
 * registrada na data do cadastro.
 * `quick`: cadastro pelo registro rápido (/rapido/associado), que fica para a Diretoria revisar.
 * Registro e apelido (054) só na edição: o cadastro novo começa com registro provisório.
 */

const REGISTRATION_HINTS: Record<Registration, string> = {
  provisorio: "Ainda sem o registro anual efetivado na UEB.",
  definitivo: "Registro efetivado na UEB.",
};
export function AssociateForm({ catalog, associate, today, quick = false }: { catalog: Catalog; associate?: AssociateProfile; today: string; quick?: boolean }) {
  const [state, action, pending] = useActionState(quick ? quickAssociate : saveAssociate, {} as ActionResult);
  useActionToast(state);
  const current: Placement | undefined = associate && { branch: associate.branch, sectionId: associate.section_id ?? "", patrolId: associate.patrol_id ?? "" };
  const [place, setPlace] = useState(current ?? EMPTY_PLACEMENT);
  const creating = !associate;
  const [registration, setRegistration] = useState<string>(associate?.registration ?? "provisorio");

  return <ActionForm action={action} result={state} className="grid gap-4">
    {associate && <input type="hidden" name="id" value={associate.id} />}
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <Field id="associate-name" label="Nome">
        <Input id="associate-name" name="name" required minLength={2} maxLength={120} defaultValue={associate?.name} autoComplete="off" />
      </Field>
      <Field id="associate-placement" label="Ramo, seção e equipe"
        hint={creating ? "Adulto é só o ramo. Seção e equipe são opcionais: dá para completar depois, editando." : "Corrige o cadastro, sem histórico. A passagem para o ramo seguinte é no detalhe."}>
        <PlacementSelect id="associate-placement" catalog={catalog} value={place} current={current} onValueChange={setPlace} />
        <PlacementFields value={place} />
      </Field>
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
    {!creating && <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-xs font-medium">Registro</legend>
        <input type="hidden" name="registration" value={registration} />
        <RadioGroup value={registration} onValueChange={(value) => setRegistration(String(value))} className="grid gap-2 sm:grid-cols-2" aria-label="Registro">
          {REGISTRATIONS.map((value) => <FieldLabel key={value} htmlFor={`associate-registration-${value}`} className="has-data-checked:border-primary">
            <ChoiceField orientation="horizontal">
              <FieldContent>
                <FieldTitle>{registrationLabels[value]}</FieldTitle>
                <FieldDescription>{REGISTRATION_HINTS[value]}</FieldDescription>
              </FieldContent>
              <RadioGroupItem value={value} id={`associate-registration-${value}`} />
            </ChoiceField>
          </FieldLabel>)}
        </RadioGroup>
      </fieldset>
      <Field id="associate-nickname" label="Apelido (opcional)" hint={`Até ${NICKNAME_MAX} letras; usado em referências curtas nos relatórios, ex.: “Ver Manu”.`}>
        <Input id="associate-nickname" name="nickname" maxLength={NICKNAME_MAX} defaultValue={associate?.nickname ?? ""} autoComplete="off" placeholder="Ex.: Manu" />
      </Field>
    </div>}
    <Field id="associate-notes" label="Observações">
      <Textarea id="associate-notes" name="notes" maxLength={500} rows={3} defaultValue={associate?.notes ?? ""} />
    </Field>
    <div className="flex flex-wrap gap-2">
      <Button type="submit" size="lg" disabled={pending || !place.branch}>{pending ? "Salvando…" : creating ? "Cadastrar associado" : "Salvar"}</Button>
      <Link href={associate ? `/associados/${associate.id}` : quick ? "/rapido" : "/associados"} className={buttonVariants({ variant: "outline", size: "lg" })}>Cancelar</Link>
    </div>
  </ActionForm>;
}
