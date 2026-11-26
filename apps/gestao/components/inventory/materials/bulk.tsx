"use client";

import { useRef, useState, type ReactNode } from "react";
import { IconArrowsTransferUp, IconCategory, IconCircleHalf2, IconPackageExport, IconShoppingBag, IconToolsKitchen2, IconX } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import type { Option } from "@geas/ui/components/option-controls";
import { bulkEdit } from "@/app/(inventario)/inventario/materiais/actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import type { BulkAction } from "@/lib/inventory/model";
import { conditionOptions, writeOffOptions } from "@/lib/inventory/vocabulary";
import { NotesField, SelectField } from "./fields";

/**
 * Seleção em massa da lista de Materiais, com um só ouvinte (delegado), como o StockEditor: as caixas são
 * `input[data-sel]` renderizadas no servidor, com o valor `"material|divisão"`; a do cabeçalho é `input[data-sel-all]`.
 * Shift + clique marca o intervalo desde a última caixa clicada. Com algo marcado, aparece a barra de ações no rodapé.
 * A página monta este componente com `key` = endereço da lista: trocar filtro ou aba começa uma seleção nova.
 */
export function BulkSelection({ locations, families, canSell = false, children }: {
  locations: Option[]; families: Option[];
  /** Editor do Inventário: marca ou tira materiais da Lojinha (à venda no Financeiro). */
  canSell?: boolean; children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<BulkAction | null>(null);

  const boxes = () => [...(frame.current?.querySelectorAll<HTMLInputElement>("input[data-sel]") ?? [])];
  const sync = () => {
    const all = boxes();
    const checked = all.filter((box) => box.checked).map((box) => box.value);
    setSelected(checked);
    const head = frame.current?.querySelector<HTMLInputElement>("input[data-sel-all]");
    if (head) {
      head.checked = all.length > 0 && checked.length === all.length;
      head.indeterminate = checked.length > 0 && checked.length < all.length;
    }
  };

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const box = (event.target as HTMLElement).closest<HTMLInputElement>("input[data-sel], input[data-sel-all]");
    if (!box) return;
    const all = boxes();
    if (box.hasAttribute("data-sel-all")) {
      for (const row of all) row.checked = box.checked;
      last.current = null;
    } else {
      const index = all.indexOf(box);
      if (event.shiftKey && last.current !== null && last.current !== index) {
        const [from, to] = last.current < index ? [last.current, index] : [index, last.current];
        for (const row of all.slice(from, to + 1)) row.checked = box.checked;
      }
      last.current = index;
    }
    sync();
  }

  function clear() {
    for (const box of boxes()) box.checked = false;
    last.current = null;
    sync();
  }

  const withStock = selected.filter((key) => !key.endsWith("|")).length;
  const materials = new Set(selected.map((key) => key.split("|")[0])).size;
  const count = `${selected.length} ${selected.length === 1 ? "linha" : "linhas"}`;
  const stockNote = withStock < selected.length ? ` As ${selected.length - withStock} sem estoque ficam de fora.` : "";
  const wholeMaterial = `Vale para o material inteiro, em todas as divisões (${materials} ${materials === 1 ? "material" : "materiais"}).`;
  const common = { open: true, onOpenChange: (open: boolean) => { if (!open) setDialog(null); }, action: async (...args: Parameters<typeof bulkEdit>) => {
    const result = await bulkEdit(...args);
    if (!result.error) clear();
    return result;
  } };
  const hidden = (action: BulkAction) => ({ action, targets: JSON.stringify(selected) });

  return <>
    <div ref={frame} onClick={onClick} className="contents">{children}</div>
    {/* Contagem e "limpar" ficam juntos (não quebram); só o grupo de ações quebra linha quando falta espaço. */}
    {selected.length > 0 && <div role="region" aria-label="Ações com os materiais selecionados"
      className="surface fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 shadow-lg">
      <div className="flex shrink-0 items-center gap-1">
        <Button size="icon-lg" variant="ghost" onClick={clear} aria-label="Limpar seleção" title="Limpar seleção"><IconX /></Button>
        <span className="text-sm font-semibold whitespace-nowrap" aria-live="polite">{count} selecionada{selected.length === 1 ? "" : "s"}</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="lg" variant="outline" disabled={!withStock} onClick={() => setDialog("transferir")}><IconArrowsTransferUp data-icon="inline-start" /> Alterar divisão</Button>
        <Button size="lg" variant="outline" onClick={() => setDialog("familia")}><IconCategory data-icon="inline-start" /> Alterar família</Button>
        <Button size="lg" variant="outline" disabled={!withStock} onClick={() => setDialog("condicao")}><IconCircleHalf2 data-icon="inline-start" /> Condição</Button>
        <Button size="lg" variant="outline" onClick={() => setDialog("consumivel")}><IconToolsKitchen2 data-icon="inline-start" /> Consumível</Button>
        {canSell && <Button size="lg" variant="outline" onClick={() => setDialog("venda")}><IconShoppingBag data-icon="inline-start" /> À venda</Button>}
        <Button size="lg" variant="outline" disabled={!withStock} onClick={() => setDialog("baixa")}><IconPackageExport data-icon="inline-start" /> Dar baixa</Button>
      </div>
    </div>}

    {dialog === "transferir" && <ActionDialog {...common} title={`Alterar divisão: ${count}`} submitLabel="Transferir" hidden={hidden("transferir")}
      description={`Tudo o que cada material tem na divisão da linha (lotes e peças) vai para a divisão escolhida; lotes iguais se juntam.${stockNote}`}>
      <SelectField id="bulk-location" name="locationId" label="Nova divisão" options={locations} className="sm:col-span-2" />
      <NotesField id="bulk-transfer-notes" />
    </ActionDialog>}
    {dialog === "condicao" && <ActionDialog {...common} title={`Condição: ${count}`} submitLabel="Registrar condição" hidden={hidden("condicao")}
      description={`Todos os lotes e peças de cada linha passam para a condição escolhida.${stockNote}`}>
      <SelectField id="bulk-condition" name="condition" label="Condição" options={conditionOptions} className="sm:col-span-2" />
      <NotesField id="bulk-condition-notes" />
    </ActionDialog>}
    {dialog === "baixa" && <ActionDialog {...common} destructive title={`Dar baixa: ${count}`} submitLabel="Dar baixa em tudo" hidden={hidden("baixa")}
      description={`Baixa de toda a quantidade de cada linha (lotes e peças daquela divisão). Para baixar só parte, use o ± da linha.${stockNote}`}>
      <SelectField id="bulk-reason" name="reason" label="Motivo" options={writeOffOptions} className="sm:col-span-2" />
      <NotesField id="bulk-writeoff-notes" />
    </ActionDialog>}
    {dialog === "familia" && <ActionDialog {...common} title={`Alterar família: ${count}`} submitLabel="Alterar família" hidden={hidden("familia")} description={wholeMaterial}>
      <SelectField id="bulk-family" name="familyId" label="Família" options={families} emptyLabel="Sem família" className="sm:col-span-2" />
    </ActionDialog>}
    {dialog === "consumivel" && <ActionDialog {...common} title={`Consumível: ${count}`} submitLabel="Salvar" hidden={hidden("consumivel")}
      description={`${wholeMaterial} Consumível é só para material por quantidade.`}>
      <SelectField id="bulk-consumable" name="consumable" label="Consumível" defaultValue="sim" className="sm:col-span-2"
        options={[{ value: "sim", label: "Sim: some com o uso (consumir)" }, { value: "nao", label: "Não: patrimônio (dar baixa)" }]} />
    </ActionDialog>}
    {dialog === "venda" && <ActionDialog {...common} title={`Lojinha: ${count}`} submitLabel="Salvar" hidden={hidden("venda")}
      description={`${wholeMaterial} Só material por quantidade: os por peça ficam de fora. O preço de venda não muda (defina no cadastro do material).`}>
      <SelectField id="bulk-sale" name="forSale" label="À venda na Lojinha" defaultValue="sim" className="sm:col-span-2"
        options={[{ value: "sim", label: "Sim: aparece nos itens vendidos do Financeiro" }, { value: "nao", label: "Não: tira da Lojinha" }]} />
    </ActionDialog>}
  </>;
}
