"use client";

import { useActionState, useState } from "react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { createItem } from "@/app/actions";
import { conditionOptions } from "@/lib/inventory";

type State = ActionResult & { saved: number };

export function ItemForm({ locations }: { locations: Option[] }) {
  // `saved` conta os cadastros: muda a key dos campos e os devolve ao estado inicial depois de cada sucesso.
  const [state, action, pending] = useActionState(async (previous: State, formData: FormData): Promise<State> => {
    const result = await createItem(previous, formData);
    return { ...result, saved: previous.saved + (result.success ? 1 : 0) };
  }, { saved: 0 });
  useActionToast(state);

  return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,2fr)_minmax(160px,1fr)_minmax(180px,1fr)]">
    <ItemFields key={state.saved} locations={locations} />
    <div className="flex justify-end sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar item"}</Button></div>
  </form>;
}

function ItemFields({ locations }: { locations: Option[] }) {
  const [locationId, setLocationId] = useState("");
  const [condition, setCondition] = useState("bom");
  return <>
    <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1"><Label htmlFor="item-name">Nome do item</Label><Input id="item-name" name="name" required minLength={2} maxLength={120} /></div>
    <div className="grid gap-1.5"><Label htmlFor="item-category">Categoria</Label><Input id="item-category" name="category" placeholder="Ex.: Camping" maxLength={80} /></div>
    <div className="grid gap-1.5"><Label htmlFor="item-location">Local</Label>
      <OptionSelect id="item-location" value={locationId} onValueChange={setLocationId} options={locations} emptyLabel="Sem local definido" />
      <input type="hidden" name="locationId" value={locationId} /></div>
    <div className="grid gap-1.5"><Label htmlFor="item-quantity">Quantidade</Label><Input id="item-quantity" name="quantity" type="number" inputMode="numeric" min={0} defaultValue={1} required className="num" /></div>
    <div className="grid gap-1.5"><Label htmlFor="item-minimum">Estoque mínimo</Label><Input id="item-minimum" name="minimum" type="number" inputMode="numeric" min={0} defaultValue={0} required className="num" /></div>
    <div className="grid gap-1.5"><Label htmlFor="item-condition">Condição</Label>
      <OptionSelect id="item-condition" value={condition} onValueChange={setCondition} options={conditionOptions} />
      <input type="hidden" name="condition" value={condition} /></div>
  </>;
}
