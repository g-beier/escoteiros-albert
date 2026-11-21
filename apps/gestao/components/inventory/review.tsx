"use client";

import { createContext, useActionState, useContext, useState, type ReactNode } from "react";
import { IconCheck } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { toast } from "sonner";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { ActionForm } from "@geas/ui/components/action-form";

// Revisão dos movimentos pelo gestor: seleção na tabela de Movimentações (caixa por linha + todas) e barra
// "Marcar como revisado"; no histórico do material, um botão por linha. A action é `reviewMovements`.

type ReviewAction = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
type Selection = { ids: number[]; selected: Set<number>; toggle: (id: number, on: boolean) => void; setAll: (on: boolean) => void };

/**
 * Toast direto no resultado (e não via useActionToast): depois de revisar, a lista muda e o componente desmonta
 * antes de o efeito rodar.
 */
const withToast = (action: ReviewAction): ReviewAction => async (previous, formData) => {
  const result = await action(previous, formData);
  if (result.error) toast.error(result.error);
  else if (result.success) (result.tone === "neutral" ? toast.info : toast.success)(result.success);
  return result;
};

const SelectionContext = createContext<Selection | null>(null);
const useSelection = () => {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("ReviewSelection ausente");
  return value;
};

/** Envolve a tabela: `ids` são os movimentos para revisar visíveis. Use `key={ids.join(",")}` para zerar a seleção quando a lista muda. */
export function ReviewSelection({ ids, action, children }: { ids: number[]; action: ReviewAction; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selection: Selection = {
    ids, selected,
    toggle: (id, on) => setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id); else next.delete(id);
      return next;
    }),
    setAll: (on) => setSelected(on ? new Set(ids) : new Set()),
  };
  return <SelectionContext.Provider value={selection}>
    {ids.length > 0 && <ReviewBar action={action} />}
    {children}
  </SelectionContext.Provider>;
}

/** Barra acima da tabela: nota opcional e o botão com a contagem selecionada. */
function ReviewBar({ action }: { action: ReviewAction }) {
  const { ids, selected, setAll } = useSelection();
  const [result, formAction, pending] = useActionState(withToast(action), {});
  const count = selected.size;
  return <ActionForm action={formAction} result={result} className="surface flex flex-wrap items-end gap-3 px-4 py-3">
    {[...selected].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
    <div className="grid min-w-56 flex-1 gap-1.5">
      <Label htmlFor="review-notes">Nota da revisão (opcional)</Label>
      <Input id="review-notes" name="notes" maxLength={500} placeholder="Ex.: conferido com o chefe; contagem corrigida para 12" />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setAll(count < ids.length)}>
        {count < ids.length ? `Selecionar todos (${ids.length})` : "Limpar seleção"}
      </Button>
      <Button type="submit" disabled={pending || count === 0}>
        <IconCheck data-icon="inline-start" /> {pending ? "Salvando…" : `Marcar como revisado${count ? ` (${count})` : ""}`}
      </Button>
    </div>
  </ActionForm>;
}

/** Caixa do cabeçalho: marca ou desmarca todos os movimentos para revisar. */
export function ReviewCheckAll() {
  const { ids, selected, setAll } = useSelection();
  if (ids.length === 0) return null;
  const all = selected.size === ids.length;
  return <Checkbox aria-label="Selecionar todos os movimentos para revisar" checked={all} indeterminate={selected.size > 0 && !all}
    onCheckedChange={(on) => setAll(Boolean(on))} />;
}

/** Caixa da linha (só nos movimentos para revisar). */
export function ReviewCheck({ id, label }: { id: number; label: string }) {
  const { selected, toggle } = useSelection();
  return <Checkbox aria-label={`Selecionar para revisão: ${label}`} checked={selected.has(id)} onCheckedChange={(on) => toggle(id, Boolean(on))} />;
}

/** Botão de uma linha (histórico do material): revisa só aquele movimento, sem nota. */
export function ReviewButton({ id, action }: { id: number; action: ReviewAction }) {
  const [, formAction, pending] = useActionState(withToast(action), {});
  return <form action={formAction} className="inline">
    <input type="hidden" name="ids" value={id} />
    <Button type="submit" size="sm" variant="outline" disabled={pending}><IconCheck data-icon="inline-start" /> {pending ? "Salvando…" : "Revisar"}</Button>
  </form>;
}
