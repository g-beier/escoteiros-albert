"use client";

import { useState } from "react";
import { IconArrowsExchange, IconLogin2, IconLogout2, IconTrash } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { moveAssociate, leaveAssociate, rejoinAssociate, requestDeletion } from "@/app/(associados)/associados/actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import {
  branchLabels,
  DELETION_DAYS,
  nextBranch,
  placementLabel,
  type AssociateProfile,
  type Placement,
} from "@/lib/associates/model";
import { Field } from "./associate-form";
import { PlacementFields, PlacementSelect, type Catalog } from "./placement-select";

type Dialog = "passagem" | "desligar" | "reingressar" | "excluir" | null;

/**
 * Ações do detalhe: Passagem (só jovens, para o ramo seguinte) e Desligar (ativo) ou Reingressar (desligado), cada uma
 * num diálogo com data. Corrigir ramo, seção ou equipe é na edição do cadastro, sem passagem no histórico. Excluir (só
 * Editor, `canDelete`): cadastro errado ou em duplicidade, com motivo; fica em quarentena antes de sumir de vez (018).
 */
export function AssociateActions({
  associate,
  catalog,
  today,
  canDelete = false,
}: {
  associate: AssociateProfile;
  catalog: Catalog;
  today: string;
  canDelete?: boolean;
}) {
  const [open, setOpen] = useState<Dialog>(null);
  const current: Placement = {
    branch: associate.branch,
    sectionId: associate.section_id ?? "",
    patrolId: associate.patrol_id ?? "",
  };
  const next = nextBranch(associate.branch);
  const start: Placement = { branch: next ?? "", sectionId: "", patrolId: "" };
  const [place, setPlace] = useState(start);
  const onOpenChange = (value: boolean) => {
    if (!value) setOpen(null);
  };
  const hidden = { associateId: associate.id };

  return (
    <>
      {associate.active ? (
        <>
          {next && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setPlace(start);
                setOpen("passagem");
              }}
            >
              <IconArrowsExchange data-icon="inline-start" /> Passagem
            </Button>
          )}
          <Button variant="outline" size="lg" onClick={() => setOpen("desligar")}>
            <IconLogout2 data-icon="inline-start" /> Desligar
          </Button>
        </>
      ) : (
        <Button variant="outline" size="lg" onClick={() => setOpen("reingressar")}>
          <IconLogin2 data-icon="inline-start" /> Reingressar
        </Button>
      )}
      {canDelete && (
        <Button variant="outline" size="lg" className="text-destructive" onClick={() => setOpen("excluir")}>
          <IconTrash data-icon="inline-start" /> Excluir
        </Button>
      )}

      <ActionDialog
        open={open === "passagem"}
        onOpenChange={onOpenChange}
        title="Passagem"
        action={moveAssociate}
        submitLabel="Registrar passagem"
        hidden={hidden}
        description={
          <>
            Cerimônia de passagem de {placementLabel(associate)} para o ramo {next ? branchLabels[next] : ""}, com a
            data. Para corrigir ramo, seção ou equipe, use Editar.
          </>
        }
      >
        <DateField id="move-date" label="Data da passagem" today={today} />
        <Field
          id="move-placement"
          label="Para"
          hint={next === "adulto" ? undefined : "Seção e equipe do novo ramo, se já souber."}
        >
          <PlacementSelect
            id="move-placement"
            catalog={catalog}
            value={place}
            current={current}
            only={next ?? undefined}
            onValueChange={setPlace}
          />
          <PlacementFields value={place} />
        </Field>
      </ActionDialog>

      <ActionDialog
        open={open === "desligar"}
        onOpenChange={onOpenChange}
        title={`Desligar ${associate.name}`}
        action={leaveAssociate}
        submitLabel="Desligar"
        hidden={hidden}
        destructive
        description="Sai do efetivo a partir da data. O histórico fica; reingressar abre um novo período."
      >
        <DateField id="leave-date" label="Data do desligamento" today={today} />
        <ReasonField id="leave-reason" />
      </ActionDialog>

      <ActionDialog
        open={open === "excluir"}
        onOpenChange={onOpenChange}
        title={`Excluir ${associate.name}`}
        action={requestDeletion}
        submitLabel="Excluir cadastro"
        hidden={hidden}
        destructive
        description={
          <>
            Para cadastro errado ou em duplicidade (quem saiu do grupo se <strong>desliga</strong>). Some das telas
            agora e fica {DELETION_DAYS} dias em quarentena: até lá, dá para restaurar em Configurações › Excluídos;
            depois, é apagado de vez com funções, controle e vida escoteira.
          </>
        }
      >
        <Field id="delete-reason" label="Motivo" className="sm:col-span-2">
          <Input
            id="delete-reason"
            name="reason"
            required
            maxLength={200}
            placeholder="Ex.: cadastro em duplicidade de Ana Souza"
          />
        </Field>
      </ActionDialog>

      <ActionDialog
        open={open === "reingressar"}
        onOpenChange={onOpenChange}
        title={`Reingressar ${associate.name}`}
        action={rejoinAssociate}
        submitLabel="Reingressar"
        hidden={hidden}
        description={`Volta ao efetivo em ${placementLabel(associate)}. Para corrigir ramo, seção ou equipe, edite o cadastro depois.`}
      >
        <DateField id="rejoin-date" label="Data do reingresso" today={today} />
        <ReasonField id="rejoin-reason" />
      </ActionDialog>
    </>
  );
}

function DateField({ id, label, today }: { id: string; label: string; today: string }) {
  return (
    <Field id={id} label={label}>
      <Input id={id} name="date" type="date" required max={today} defaultValue={today} className="num" />
    </Field>
  );
}

function ReasonField({ id }: { id: string }) {
  return (
    <Field id={id} label="Motivo (opcional)">
      <Input id={id} name="reason" maxLength={120} placeholder="Ex.: mudou de cidade" />
    </Field>
  );
}
