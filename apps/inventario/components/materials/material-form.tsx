"use client";

import { useActionState, useState } from "react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { saveMaterial } from "@/app/materiais/actions";
import { trackingOptions, type Tracking } from "@/lib/inventory";
import { Field } from "./fields";

export type MaterialDefaults = {
  id: string; name: string; family_id: string | null; tracking: Tracking; consumable: boolean;
  minimum_quantity: number | null; description: string | null; active: boolean;
};

/** Cadastro e edição do material. O controle (peça/quantidade) só muda enquanto não há estoque. */
export function MaterialForm({ families, material, hasStock = false }: { families: Option[]; material?: MaterialDefaults; hasStock?: boolean }) {
  const [state, action, pending] = useActionState(saveMaterial, {} as ActionResult);
  useActionToast(state);
  const [familyId, setFamilyId] = useState(material?.family_id ?? "");
  const [tracking, setTracking] = useState<string>(material?.tracking ?? "");
  const [consumable, setConsumable] = useState(material?.consumable ?? false);
  const [active, setActive] = useState(material?.active ?? true);
  const isLot = tracking === "lot";

  return <form action={action} className="grid gap-3 sm:grid-cols-2">
    {material && <input type="hidden" name="id" value={material.id} />}
    <Field id="material-name" label="Nome" className="sm:col-span-2">
      <Input id="material-name" name="name" required minLength={2} maxLength={120} defaultValue={material?.name} placeholder="Ex.: Barraca iglu 4 pessoas" />
    </Field>
    <Field id="material-family" label="Família">
      <OptionSelect id="material-family" value={familyId} onValueChange={setFamilyId} options={families} emptyLabel="Sem família" />
      <input type="hidden" name="familyId" value={familyId} />
    </Field>
    <Field id="material-tracking" label="Controle">
      <OptionSelect id="material-tracking" value={tracking} onValueChange={setTracking} options={trackingOptions} disabled={hasStock} />
      <input type="hidden" name="tracking" value={tracking} />
      <span className="text-[11px] text-muted-foreground">{hasStock
        ? "Não muda depois que o material tem lotes ou peças."
        : "Por peça: cada unidade com etiqueta (barraca, fogareiro). Por quantidade: contagem por divisão (canecas, remédios)."}</span>
    </Field>
    <Field id="material-minimum" label="Estoque mínimo">
      <Input id="material-minimum" name="minimum" type="number" inputMode="numeric" min={0} defaultValue={material?.minimum_quantity ?? ""} className="num" placeholder="Sem mínimo" />
    </Field>
    <div className="grid content-end gap-2 pb-1">
      <div className="flex items-center gap-2">
        <Checkbox id="material-consumable" checked={isLot && consumable} onCheckedChange={(checked) => setConsumable(checked === true)} disabled={!isLot} />
        <Label htmlFor="material-consumable">Consumível (acaba com o uso)</Label>
        <input type="hidden" name="consumable" value={isLot && consumable ? "on" : "off"} />
      </div>
      {material && <div className="flex items-center gap-2">
        <Checkbox id="material-active" checked={active} onCheckedChange={(checked) => setActive(checked === true)} />
        <Label htmlFor="material-active">Ativo</Label>
        <input type="hidden" name="active" value={active ? "on" : "off"} />
      </div>}
    </div>
    <Field id="material-description" label="Descrição" className="sm:col-span-2">
      <Textarea id="material-description" name="description" maxLength={500} rows={3} defaultValue={material?.description ?? ""} />
    </Field>
    <div className="flex justify-end sm:col-span-2">
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : material ? "Salvar material" : "Cadastrar material"}</Button>
    </div>
  </form>;
}
