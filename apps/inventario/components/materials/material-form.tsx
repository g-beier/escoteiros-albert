"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { deleteMaterial, saveMaterial } from "@/app/materiais/actions";
import { originOptions, type Tracking } from "@/lib/inventory";
import { ConditionField, Field, LocationField, QuantityField, SelectField } from "./fields";

export type MaterialDefaults = {
  id: string; name: string; family_id: string | null; tracking: Tracking; consumable: boolean;
  minimum_quantity: number | null; description: string | null; active: boolean;
};

function todaySP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Cadastro e edição do material. Consumível ⇒ controle por quantidade; senão, por peça. */
export function MaterialForm({ families, locations = [], material, hasStock = false }: {
  families: Option[];
  /** Divisões ativas; necessário só no cadastro com entrada opcional. */
  locations?: Option[];
  material?: MaterialDefaults;
  hasStock?: boolean;
}) {
  const [state, action, pending] = useActionState(saveMaterial, {} as ActionResult);
  useActionToast(state);
  const [familyId, setFamilyId] = useState(material?.family_id ?? "");
  const [consumable, setConsumable] = useState(material?.consumable ?? false);
  const [active, setActive] = useState(material?.active ?? true);
  const [withStock, setWithStock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();
  const isNew = !material;
  /** Consumível = por quantidade; senão por peça. Com estoque, o controle já gravado não muda. */
  const tracking: Tracking = hasStock && material
    ? material.tracking
    : consumable || material?.tracking === "lot" && !consumable && !isNew
      ? "lot"
      : "unit";
  const isLot = tracking === "lot";

  function remove() {
    if (!material) return;
    startDelete(async () => {
      const result = await deleteMaterial(material.id);
      if (result.error) {
        toast.error(result.error);
        setConfirmDelete(false);
        return;
      }
      toast.info(result.success ?? "Material excluído.");
      router.push("/");
    });
  }

  return <>
    <form action={action} className="grid gap-3">
      {material && <input type="hidden" name="id" value={material.id} />}
      <input type="hidden" name="tracking" value={tracking} />
      <Field id="material-name" label="Nome" required>
        <Input id="material-name" name="name" required minLength={2} maxLength={120} defaultValue={material?.name} placeholder="Ex.: Barraca iglu 4 pessoas" />
      </Field>
      {isNew && <ConditionField id="stock-condition" label="Estado" required />}
      <Field id="material-family" label="Categoria" required>
        <OptionSelect id="material-family" value={familyId} onValueChange={setFamilyId} options={families} emptyLabel="Escolha a categoria" />
        <input type="hidden" name="familyId" value={familyId} />
      </Field>
      {isNew && <LocationField id="stock-location" locations={locations} className="" required />}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Label className="font-normal" title={hasStock ? "Não muda depois que há estoque." : "Marcado: contagem por divisão. Desmarcado: peça com etiqueta."}>
          <Checkbox
            checked={consumable}
            disabled={hasStock}
            onCheckedChange={(checked) => setConsumable(checked === true)}
            onPointerDown={(event) => event.stopPropagation()}
          />
          Consumível
        </Label>
        <input type="hidden" name="consumable" value={consumable ? "on" : "off"} />
        {isNew && <>
          <Label className="font-normal">
            <Checkbox
              checked={withStock}
              onCheckedChange={(checked) => setWithStock(checked === true)}
              onPointerDown={(event) => event.stopPropagation()}
            />
            Registrar estoque
          </Label>
          <input type="hidden" name="withStock" value={withStock ? "on" : "off"} />
        </>}
        {material && <>
          <Label className="font-normal">
            <Checkbox
              checked={active}
              onCheckedChange={(checked) => setActive(checked === true)}
              onPointerDown={(event) => event.stopPropagation()}
            />
            Ativo
          </Label>
          <input type="hidden" name="active" value={active ? "on" : "off"} />
        </>}
      </div>

      {!isNew && <Field id="material-minimum" label="Estoque mínimo">
        <Input id="material-minimum" name="minimum" type="number" inputMode="numeric" min={0} defaultValue={material?.minimum_quantity ?? ""} className="num" placeholder="Sem mínimo" />
      </Field>}

      {isNew && withStock && <div className="grid gap-3 rounded-xl bg-muted/40 p-3" aria-label="Estoque">
        <SelectField id="stock-origin" name="origin" label="Origem" options={originOptions} defaultValue="nao_informada" />
        <QuantityField
          id="stock-quantity"
          label={isLot ? "Quantidade" : "Quantidade de peças"}
          required={false}
        />
        <Field id="material-minimum" label="Estoque mínimo">
          <Input id="material-minimum" name="minimum" type="number" inputMode="numeric" min={0} className="num" placeholder="Sem mínimo" />
        </Field>
        <Field id="stock-value" label="Valor estimado (unidade)">
          <Input id="stock-value" name="value" inputMode="decimal" placeholder="Ex.: 35,00" className="num" />
        </Field>
        <Field id="stock-acquired" label="Data de entrada">
          <Input id="stock-acquired" name="acquiredOn" type="date" defaultValue={todaySP()} className="num" />
        </Field>
        {isLot && <Field id="stock-expires" label="Validade">
          <Input id="stock-expires" name="expiresOn" type="date" className="num" />
        </Field>}
      </div>}

      <Field id="material-description" label="Descrição">
        <Textarea id="material-description" name="description" maxLength={500} rows={3} defaultValue={material?.description ?? ""} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div>{material && <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}><IconTrash /> Excluir material</Button>}</div>
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : material ? "Salvar material" : "Cadastrar material"}</Button>
      </div>
    </form>

    {material && <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir material?</DialogTitle>
          <DialogDescription>
            “{material.name}” sai do cadastro, com o histórico de movimentos. Só é possível se não houver estoque (lotes ou peças ativas);
            se ainda houver, dê baixa antes. A exclusão fica na auditoria.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={remove} disabled={deleting}>{deleting ? "Excluindo…" : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </>;
}
