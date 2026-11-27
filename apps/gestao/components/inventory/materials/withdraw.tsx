"use client";

import { useState } from "react";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import {
  Field as ChoiceField,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@geas/ui/components/field";
import { Input } from "@geas/ui/components/input";
import { MoneyInput } from "@geas/ui/components/money-input";
import type { Option } from "@geas/ui/components/option-controls";
import { RadioGroup, RadioGroupItem } from "@geas/ui/components/radio-group";
import { cn } from "@geas/ui/lib/utils";
import { addLot, writeOffLot } from "@/app/(inventario)/inventario/materiais/actions";
import { ConditionPill } from "@/components/inventory/condition-pill";
import { dateBR, writeOffOptions, type Condition } from "@/lib/inventory/vocabulary";
import { ActionDialog, type FormAction } from "@/components/shell/action-dialog";
import {
  ConditionField,
  EntryFields,
  Field,
  LocationField,
  NotesField,
  QuantityField,
  SaleFields,
  SelectField,
  VariantField,
} from "./fields";

// Saída do estoque como baixa (consumo, perda, descarte…), o caminho normal quando unidades saem. "Corrigir
// contagem" fica para quando o registro estava errado. Usado no detalhe do material e na lista de Materiais.

export type WithdrawLot = {
  id: string;
  location_id: string;
  path: string;
  quantity: number;
  condition: Condition | null;
  expires_on: string | null;
  variant: string | null;
};

/** Rótulo da saída: consumível consome; o resto dá baixa. */
export const withdrawLabel = (consumable: boolean) => (consumable ? "Consumir" : "Dar baixa");

/** Vence antes sai primeiro; sem validade por último. */
const byExpiry = (a: WithdrawLot, b: WithdrawLot) => (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999");

/** Campos da baixa: lote (cartões, quando há mais de um), quantidade, motivo e observação; o id do lote vai oculto. */
function WithdrawFields({
  consumable,
  lots,
  defaultLotId,
  defaultQuantity = 1,
}: {
  consumable: boolean;
  lots: WithdrawLot[];
  defaultLotId?: string;
  defaultQuantity?: number;
}) {
  const sorted = [...lots].sort(byExpiry);
  const [lotId, setLotId] = useState(defaultLotId ?? sorted[0]?.id ?? "");
  const lot = sorted.find((row) => row.id === lotId);
  return (
    <>
      <input type="hidden" name="lotId" value={lotId} />
      {sorted.length > 1 && (
        <fieldset className="m-0 grid gap-2 border-0 p-0 sm:col-span-2">
          <legend className="mb-1.5 text-xs font-medium">Lote</legend>
          <RadioGroup
            value={lotId}
            onValueChange={(value) => setLotId(String(value))}
            className="grid gap-2"
            aria-label="Lote"
          >
            {sorted.map((row) => (
              <FieldLabel key={row.id} htmlFor={`withdraw-lot-${row.id}`} className="has-data-checked:border-primary">
                <ChoiceField orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>
                      <span className="num">{row.quantity} un.</span>
                      {row.variant && <span>{row.variant}</span>}
                      {row.condition && <ConditionPill condition={row.condition} />}
                    </FieldTitle>
                    <FieldDescription>
                      {row.path}
                      {row.expires_on && (
                        <>
                          {" "}
                          · vence <span className="num">{dateBR(row.expires_on)}</span>
                        </>
                      )}
                    </FieldDescription>
                  </FieldContent>
                  <RadioGroupItem value={row.id} id={`withdraw-lot-${row.id}`} />
                </ChoiceField>
              </FieldLabel>
            ))}
          </RadioGroup>
        </fieldset>
      )}
      <QuantityField
        key={lotId}
        id="withdraw-quantity"
        label={lot ? `Quantidade (de ${lot.quantity})` : "Quantidade"}
        max={lot?.quantity}
        defaultValue={Math.min(defaultQuantity, lot?.quantity ?? defaultQuantity)}
      />
      <SelectField
        id="withdraw-reason"
        name="reason"
        label="Motivo"
        options={writeOffOptions}
        defaultValue={consumable ? "consumo" : ""}
      />
      <NotesField id="withdraw-notes" />
    </>
  );
}

const WITHDRAW_HINT = (
  <>
    Saída definitiva do estoque, com o motivo no histórico. Se a contagem estava errada (nada saiu de fato), use{" "}
    <strong>Corrigir contagem</strong> no material.
  </>
);

/** Diálogo de baixa (detalhe do material): motivo "Consumo" já escolhido para consumíveis. */
export function WithdrawDialog({
  materialId,
  materialName,
  consumable,
  lots,
  defaultLotId,
  defaultQuantity = 1,
  onOpenChange,
}: {
  materialId: string;
  materialName: string;
  consumable: boolean;
  lots: WithdrawLot[];
  defaultLotId?: string;
  defaultQuantity?: number;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title={`${withdrawLabel(consumable)}: ${materialName}`}
      action={writeOffLot}
      submitLabel={withdrawLabel(consumable)}
      destructive={!consumable}
      hidden={{ materialId }}
      description={WITHDRAW_HINT}
    >
      <WithdrawFields
        consumable={consumable}
        lots={lots}
        defaultLotId={defaultLotId}
        defaultQuantity={defaultQuantity}
      />
    </ActionDialog>
  );
}

/** Entrada de um lote novo (detalhe do material). */
export function AddLotDialog({
  materialId,
  locations,
  canSell = false,
  onOpenChange,
}: {
  materialId: string;
  locations: Option[];
  /** Editor do Inventário: o lote pode entrar já à venda na Lojinha. */
  canSell?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Adicionar lote"
      description="Entrada de unidades deste material numa divisão."
      action={addLot}
      submitLabel="Adicionar"
      hidden={{ materialId }}
    >
      <LocationField id="lot-new-location" locations={locations} />
      <QuantityField id="lot-new-quantity" defaultValue={1} />
      <ConditionField id="lot-new-condition" defaultValue="bom" />
      <VariantField id="lot-new-variant" />
      <Field id="lot-new-expires" label="Validade">
        <Input id="lot-new-expires" name="expiresOn" type="date" className="num" />
      </Field>
      <EntryFields prefix="lot-new" />
      {canSell && <SaleFields prefix="lot-new" />}
    </ActionDialog>
  );
}

type Direction = "remover" | "incluir";

/** Remover = baixa (lotId); incluir = lote novo na divisão da linha. A direção vai no formulário. */
const moveStock: FormAction = (previous, formData) =>
  (formData.get("direction") === "incluir" ? addLot : writeOffLot)(previous, formData);

/**
 * Diálogo ± de uma linha da lista de Materiais (material por quantidade numa divisão): escolhe entre remover
 * (baixa/consumo, o padrão quando há saldo) e incluir (entrada nesta divisão). Aberto pelo `StockEditor`, que
 * carrega os lotes da linha ao clicar (a lista não leva os lotes de cada linha no HTML).
 */
export function RowStockDialog({
  materialId,
  materialName,
  consumable,
  lots,
  locationId,
  locationPath,
  onOpenChange,
}: {
  materialId: string;
  materialName: string;
  consumable: boolean;
  lots: WithdrawLot[];
  locationId: string;
  locationPath: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [direction, setDirection] = useState<Direction>(lots.length > 0 ? "remover" : "incluir");
  const out = direction === "remover";
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title={materialName}
      action={moveStock}
      submitLabel={out ? withdrawLabel(consumable) : "Incluir"}
      destructive={out && !consumable}
      hidden={{ materialId, direction, ...(out ? {} : { locationId, origin: "nao_informada" }) }}
      description={
        out ? (
          WITHDRAW_HINT
        ) : (
          <>
            Entrada de unidades em <strong>{locationPath || "—"}</strong>. Se já houver um lote igual, a quantidade soma
            nele.
          </>
        )
      }
    >
      <RadioGroup
        value={direction}
        onValueChange={(value) => setDirection(value as Direction)}
        aria-label="Incluir ou remover"
        className="grid grid-cols-2 gap-2 sm:col-span-2"
      >
        {(
          [
            ["remover", "Retirar", IconMinus, lots.length === 0],
            ["incluir", "Incluir", IconPlus, false],
          ] as const
        ).map(([value, title, Icon, disabled]) => (
          <FieldLabel
            key={value}
            htmlFor={`stock-${value}`}
            className={cn("has-data-checked:border-primary", disabled && "opacity-50")}
          >
            <ChoiceField orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  <Icon className="size-4" aria-hidden /> {title}
                </FieldTitle>
              </FieldContent>
              <RadioGroupItem value={value} id={`stock-${value}`} disabled={disabled} />
            </ChoiceField>
          </FieldLabel>
        ))}
      </RadioGroup>
      {out ? (
        <WithdrawFields consumable={consumable} lots={lots} />
      ) : (
        <>
          <QuantityField id="stock-in-quantity" defaultValue={1} />
          <ConditionField id="stock-in-condition" defaultValue="bom" />
          <VariantField id="stock-in-variant" />
          <Field id="stock-in-expires" label="Validade">
            <Input id="stock-in-expires" name="expiresOn" type="date" className="num" />
          </Field>
          <Field id="stock-in-value" label="Valor estimado (unidade)">
            <MoneyInput id="stock-in-value" name="value" />
          </Field>
          <NotesField id="stock-in-notes" />
        </>
      )}
    </ActionDialog>
  );
}
