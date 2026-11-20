"use client";

import { useState } from "react";
import { IconArrowsExchange, IconLogin2, IconLogout2 } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { moveAssociate, leaveAssociate, rejoinAssociate } from "@/app/(associados)/associados/actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import { placementLabel, type AssociateProfile, type Placement } from "@/lib/associates/model";
import { Field } from "./associate-form";
import { PlacementFields, PlacementSelect, type Catalog } from "./placement-select";

type Dialog = "passagem" | "desligar" | "reingressar" | null;

/** Ações do detalhe: Passagem (só jovens) e Desligar (ativo) ou Reingressar (desligado), cada uma num diálogo com data. */
export function AssociateActions({ associate, catalog, today }: { associate: AssociateProfile; catalog: Catalog; today: string }) {
  const [open, setOpen] = useState<Dialog>(null);
  const current: Placement = { branch: associate.branch, sectionId: associate.section_id ?? "", patrolId: associate.patrol_id ?? "" };
  const [place, setPlace] = useState(current);
  const onOpenChange = (value: boolean) => { if (!value) setOpen(null); };
  const hidden = { associateId: associate.id };

  return <>
    {associate.active
      ? <>
        {associate.branch !== "adulto" && <Button variant="outline" size="lg" onClick={() => { setPlace(current); setOpen("passagem"); }}><IconArrowsExchange data-icon="inline-start" /> Passagem</Button>}
        <Button variant="outline" size="lg" onClick={() => setOpen("desligar")}><IconLogout2 data-icon="inline-start" /> Desligar</Button>
      </>
      : <Button variant="outline" size="lg" onClick={() => setOpen("reingressar")}><IconLogin2 data-icon="inline-start" /> Reingressar</Button>}

    <ActionDialog open={open === "passagem"} onOpenChange={onOpenChange} title="Passagem" action={moveAssociate} submitLabel="Registrar passagem" hidden={hidden}
      description={<>Mudança de ramo, seção ou equipe a partir da data. Hoje: {placementLabel(associate)}. Pioneiro que vira adulto passa para o ramo Adulto.</>}>
      <DateField id="move-date" label="Data da passagem" today={today} />
      <Field id="move-placement" label="Para">
        <PlacementSelect id="move-placement" catalog={catalog} value={place} current={current} onValueChange={setPlace} />
        <PlacementFields value={place} />
      </Field>
    </ActionDialog>

    <ActionDialog open={open === "desligar"} onOpenChange={onOpenChange} title={`Desligar ${associate.name}`} action={leaveAssociate} submitLabel="Desligar" hidden={hidden} destructive
      description="Sai do efetivo a partir da data. O histórico fica; reingressar abre um novo período.">
      <DateField id="leave-date" label="Data do desligamento" today={today} />
      <ReasonField id="leave-reason" />
    </ActionDialog>

    <ActionDialog open={open === "reingressar"} onOpenChange={onOpenChange} title={`Reingressar ${associate.name}`} action={rejoinAssociate} submitLabel="Reingressar" hidden={hidden}
      description={`Volta ao efetivo em ${placementLabel(associate)}. Para mudar de ramo ou seção, faça uma passagem depois.`}>
      <DateField id="rejoin-date" label="Data do reingresso" today={today} />
      <ReasonField id="rejoin-reason" />
    </ActionDialog>
  </>;
}

function DateField({ id, label, today }: { id: string; label: string; today: string }) {
  return <Field id={id} label={label}>
    <Input id={id} name="date" type="date" required max={today} defaultValue={today} className="num" />
  </Field>;
}

function ReasonField({ id }: { id: string }) {
  return <Field id={id} label="Motivo (opcional)">
    <Input id={id} name="reason" maxLength={120} placeholder="Ex.: mudou de cidade" />
  </Field>;
}
