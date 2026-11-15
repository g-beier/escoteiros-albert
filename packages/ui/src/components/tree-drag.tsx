"use client";

import { useState, type DragEvent } from "react";
import { IconGripVertical } from "@tabler/icons-react";
import { cn } from "@geas/ui/lib/utils";

/** Onde a linha arrastada cai em relação à linha alvo. */
export type DropPlace = "before" | "after" | "inside";

export const DROP_CLASS: Record<DropPlace, string> = {
  before: "shadow-[inset_0_2px_0_0_var(--color-primary)]",
  after: "shadow-[inset_0_-2px_0_0_var(--color-primary)]",
  inside: "bg-primary/10 shadow-[inset_0_0_0_2px_var(--color-primary)]",
};

type Options = {
  /** Por que não dá para soltar `key` em `target` ("" = sem motivo a mostrar), ou null se dá. */
  dropError: (key: string, target: string, place: DropPlace) => string | null;
  onDrop: (key: string, target: string, place: DropPlace) => void;
};

/**
 * Arrastar linhas de uma árvore em tabela (rubricas, divisões): o terço de cima da linha alvo solta antes,
 * o de baixo depois e o meio dentro. `rowProps` vai no `<tr>`; `DragHandle` é a alça na primeira célula.
 */
export function useTreeDrag({ dropError, onDrop }: Options) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; place: DropPlace } | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const end = () => { setDragKey(null); setDrop(null); setHint(null); };
  const placeFor = (event: DragEvent<HTMLElement>): DropPlace => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    return y < 0.3 ? "before" : y > 0.7 ? "after" : "inside";
  };

  return {
    dragKey,
    /** Mensagem de por que não dá para soltar aqui (durante o arrasto). */
    hint,
    dropFor: (key: string) => (drop?.key === key ? drop.place : null),
    rowProps: (key: string) => ({
      onDragOver: (event: DragEvent<HTMLTableRowElement>) => {
        if (!dragKey) return;
        const place = placeFor(event);
        const error = dropError(dragKey, key, place);
        if (error === null) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (drop?.key !== key || drop.place !== place) setDrop({ key, place });
          if (hint) setHint(null);
        } else {
          if (drop) setDrop(null);
          if (hint !== (error || null)) setHint(error || null);
        }
      },
      onDrop: (event: DragEvent<HTMLTableRowElement>) => {
        event.preventDefault();
        if (dragKey && drop?.key === key) onDrop(dragKey, key, drop.place);
        end();
      },
    }),
    handleProps: (key: string) => ({ onDragStart: () => setDragKey(key), onDragEnd: end }),
  };
}

/** Alça de arrastar; a imagem do arrasto é a linha inteira. */
export function DragHandle({ id, onDragStart, onDragEnd, className }: { id: string; onDragStart: () => void; onDragEnd: () => void; className?: string }) {
  return <span draggable aria-hidden title="Arraste para mover"
    className={cn("-ml-1 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing", className)}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
      const tr = event.currentTarget.closest("tr");
      if (tr) event.dataTransfer.setDragImage(tr, 16, tr.offsetHeight / 2);
      onDragStart();
    }}
    onDragEnd={onDragEnd}><IconGripVertical className="size-4" /></span>;
}

/** Espaço da alça, para alinhar as linhas que não se movem. */
export function DragHandleSpacer() {
  return <span className="-ml-1 w-5 shrink-0" aria-hidden />;
}
