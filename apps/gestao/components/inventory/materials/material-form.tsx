"use client";

import { useActionState, useState } from "react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import {
  Field as ChoiceField,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@geas/ui/components/field";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { RadioGroup, RadioGroupItem } from "@geas/ui/components/radio-group";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { saveMaterial } from "@/app/(inventario)/inventario/materiais/actions";
import type { MaterialDefaults } from "@/lib/inventory/model";
import type { Tracking } from "@/lib/inventory/vocabulary";
import { ConditionField, Field, LocationField, SelectField } from "./fields";
import { originOptions } from "@/lib/inventory/vocabulary";
import { ActionForm } from "@geas/ui/components/action-form";

export type { MaterialDefaults };

/** Como o material é controlado: cartões com o que cada opção significa e exemplos. */
const TRACKING_CHOICES: { value: Tracking; title: string; description: string; examples: string }[] = [
  {
    value: "unit",
    title: "Por peça",
    description: "Cada unidade tem etiqueta, divisão e condição próprias.",
    examples: "Barraca, fogareiro, lampião",
  },
  {
    value: "lot",
    title: "Por quantidade",
    description: "Contagem por divisão, em lotes; pode ter validade.",
    examples: "Canecas, cordas, remédios",
  },
];

/** Peças de uma vez no cadastro (entram sem etiqueta; etiquetar no detalhe). */
const MAX_UNITS_ON_CREATE = 50;

/**
 * Cadastro e edição do material. O controle (peça/quantidade) só muda enquanto não há estoque.
 * No cadastro, a primeira entrada (lote ou peças) pode ser registrada junto.
 */
export function MaterialForm({
  families,
  locations = [],
  material,
  hasStock = false,
  back,
}: {
  families: Option[];
  locations?: Option[];
  material?: MaterialDefaults;
  hasStock?: boolean;
  /** Lista com filtros para onde o detalhe volta depois de salvar (`voltar`). */
  back?: string;
}) {
  const [state, action, pending] = useActionState(saveMaterial, {} as ActionResult);
  useActionToast(state);
  const [familyId, setFamilyId] = useState(material?.family_id ?? "");
  const [tracking, setTracking] = useState<string>(material?.tracking ?? "");
  const [consumable, setConsumable] = useState(material?.consumable ?? false);
  const [active, setActive] = useState(material?.active ?? true);
  const [withStock, setWithStock] = useState(false);
  const isLot = tracking === "lot";
  const creating = !material;

  return (
    <ActionForm action={action} result={state} className="grid gap-4">
      {material && <input type="hidden" name="id" value={material.id} />}
      {back && <input type="hidden" name="voltar" value={back} />}
      <Field id="material-name" label="Nome">
        <Input
          id="material-name"
          name="name"
          required
          minLength={2}
          maxLength={120}
          defaultValue={material?.name}
          placeholder="Ex.: Barraca iglu 4 pessoas"
        />
      </Field>

      {/* Fora do fieldset: um fieldset desabilitado não envia os campos de dentro, nem os ocultos. */}
      <input type="hidden" name="tracking" value={tracking} />
      <fieldset className="grid gap-1.5" disabled={hasStock}>
        <legend className="mb-1.5 text-xs font-medium">Controle</legend>
        <RadioGroup
          value={tracking}
          onValueChange={(value) => setTracking(String(value))}
          className="grid gap-2 sm:grid-cols-2"
          aria-label="Controle"
        >
          {TRACKING_CHOICES.map((choice) => (
            <FieldLabel
              key={choice.value}
              htmlFor={`material-tracking-${choice.value}`}
              className="has-data-checked:border-primary"
            >
              <ChoiceField orientation="horizontal">
                <FieldContent>
                  <FieldTitle>{choice.title}</FieldTitle>
                  <FieldDescription>{choice.description}</FieldDescription>
                  <FieldDescription className="italic">Ex.: {choice.examples}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={choice.value} id={`material-tracking-${choice.value}`} />
              </ChoiceField>
            </FieldLabel>
          ))}
        </RadioGroup>
        {hasStock && (
          <span className="text-[11px] text-muted-foreground">Não muda depois que o material tem lotes ou peças.</span>
        )}
      </fieldset>

      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field id="material-family" label="Família">
          <OptionSelect
            id="material-family"
            value={familyId}
            onValueChange={setFamilyId}
            options={families}
            emptyLabel="Sem família"
          />
          <input type="hidden" name="familyId" value={familyId} />
        </Field>
        <Field id="material-minimum" label="Estoque mínimo">
          <Input
            id="material-minimum"
            name="minimum"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={material?.minimum_quantity ?? ""}
            className="num"
            placeholder="Sem mínimo"
          />
        </Field>
      </div>

      {(isLot || material) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {isLot && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="material-consumable"
                checked={consumable}
                onCheckedChange={(checked) => setConsumable(checked === true)}
              />
              <Label htmlFor="material-consumable">Consumível (acaba com o uso)</Label>
            </div>
          )}
          {material && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="material-active"
                checked={active}
                onCheckedChange={(checked) => setActive(checked === true)}
              />
              <Label htmlFor="material-active">Ativo</Label>
              <input type="hidden" name="active" value={active ? "on" : "off"} />
            </div>
          )}
        </div>
      )}
      <input type="hidden" name="consumable" value={isLot && consumable ? "on" : "off"} />

      <Field id="material-description" label="Descrição">
        <Textarea
          id="material-description"
          name="description"
          maxLength={500}
          rows={3}
          defaultValue={material?.description ?? ""}
        />
      </Field>

      {creating && (
        <section aria-labelledby="first-entry-title" className="grid gap-3 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="material-with-stock"
              checked={withStock}
              onCheckedChange={(checked) => setWithStock(checked === true)}
              disabled={!tracking}
            />
            <Label htmlFor="material-with-stock" id="first-entry-title">
              Registrar a primeira entrada agora
            </Label>
            <input type="hidden" name="withStock" value={withStock && tracking ? "on" : "off"} />
          </div>
          {!tracking && (
            <p className="m-0 text-xs text-muted-foreground">Escolha o controle para registrar a entrada.</p>
          )}
          {withStock && tracking && (
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <LocationField id="entry-location" locations={locations} />
              <Field id="entry-quantity" label={isLot ? "Quantidade" : "Quantidade de peças"}>
                <Input
                  id="entry-quantity"
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={isLot ? undefined : MAX_UNITS_ON_CREATE}
                  defaultValue={1}
                  required
                  className="num"
                />
                {!isLot && (
                  <span className="text-[11px] text-muted-foreground">
                    Até {MAX_UNITS_ON_CREATE}; as peças entram sem etiqueta (etiquete no detalhe do material).
                  </span>
                )}
              </Field>
              <ConditionField id="entry-condition" defaultValue="bom" />
              {isLot && (
                <Field id="entry-expires" label="Validade">
                  <Input id="entry-expires" name="expiresOn" type="date" className="num" />
                </Field>
              )}
              <Field id="entry-value" label="Valor estimado (unidade)">
                <Input id="entry-value" name="value" inputMode="decimal" placeholder="Ex.: 35,00" className="num" />
              </Field>
              <Field id="entry-acquired" label="Data de entrada">
                <Input id="entry-acquired" name="acquiredOn" type="date" className="num" />
              </Field>
              <SelectField
                id="entry-origin"
                name="origin"
                label="Origem"
                options={originOptions}
                defaultValue="nao_informada"
              />
            </div>
          )}
        </section>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : material ? "Salvar material" : "Cadastrar material"}
        </Button>
      </div>
    </ActionForm>
  );
}
