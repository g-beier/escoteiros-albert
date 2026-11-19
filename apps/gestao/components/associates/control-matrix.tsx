"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@geas/ui/lib/utils";
import {
  cellStatusLabel, cellValue, directorateLabels, itemKindLabels, matrixCell, statusMap, validityLabel,
  type ControlItem, type ControlStatusRow, type Directorate, type MatrixPerson,
} from "@/lib/associates/controls";
import { dateBR } from "@/lib/format";
import { ControlBadge } from "./control-badge";
import { ControlStatusDialog, type StatusTarget } from "./control-status-dialog";

const HEAD = "h-auto border-0 bg-muted px-1.5 py-1.5 text-left align-bottom text-[11px] font-semibold text-muted-foreground";
/** Coluna do nome: mesma borda forte das divisões entre diretorias, para seguir visível ao rolar. */
const STICKY = "sticky left-0 z-10 w-44 min-w-44 max-w-44 border-0";
/** Zera a borda do CSS legado (`td { border-top }` em theme.css), que somava uma segunda linha de outro tom. */
const CELL = "border-0";
/** Largura fixa das colunas de item: a tabela não estica, as colunas se acumulam à esquerda. */
const ITEM_COL = "w-24 min-w-24 max-w-24";
/** Faixa de cada diretoria, como as cores do Doc 22. */
const BAND: Record<Directorate, string> = {
  metodos_educativos: "bg-[var(--purple-soft)]",
  administrativa: "bg-destructive-soft",
  financeira: "bg-success-soft",
  comunicacao: "bg-[var(--orange-soft)]",
};
/**
 * Grade desenhada com sombras internas (box-shadow inset), não com bordas: bordas de cores ou larguras diferentes se
 * encontram em chanfro nos cantos (efeito 3D). Sombras se sobrepõem em retângulos, sem cruzamento. Uma só cor
 * (`--grid`, a mesma do fundo das células "não se aplica") para linhas e colunas; a borda forte (`--grid-strong`)
 * fica por cima, entre diretorias e à direita do nome. Linhas verticais suaves só no corpo.
 */
const LINE_B = "shadow-[inset_0_-1px_0_var(--grid)]";
const LINE_B_SOFT = "shadow-[inset_1px_0_0_var(--grid),inset_0_-1px_0_var(--grid)]";
const LINE_B_STRONG = "shadow-[inset_2px_0_0_var(--grid-strong),inset_0_-1px_0_var(--grid)]";
const LINE_B_STICKY = "shadow-[inset_-2px_0_0_var(--grid-strong),inset_0_-1px_0_var(--grid)]";
type Edge = "none" | "soft" | "strong";
const LINE: Record<Edge, string> = { none: LINE_B, soft: LINE_B_SOFT, strong: LINE_B_STRONG };
/** "Não se aplica a este tipo de pessoa": célula cinza preenchida, sem texto (como o Doc 22). */
const NOT_APPLICABLE = "bg-[var(--grid)]";

type Group = { directorate: Directorate; items: ControlItem[] };

/**
 * Linha da matriz: um associado ou, com `parent` (nome do jovem), um dos seus responsáveis, logo abaixo dele e
 * recuado. O responsável compartilhado por irmãos aparece sob cada um, com as mesmas situações.
 */
export type MatrixRow = { key: string; person: MatrixPerson; parent?: string };

/**
 * Matriz única pessoa × item: linhas = associados; colunas = itens, agrupados por diretoria (linha de cabeçalho com
 * o nome da diretoria, borda forte entre os grupos). Só a área dos itens rola na horizontal: a coluna do nome é
 * estreita e fixa (nome truncado, completo no título) e a página não rola de lado. Quem edita clica na célula
 * (botão) e abre o diálogo da situação. Item fora do público da pessoa: célula cinza, sem texto.
 */
export function ControlMatrix({ groups, people, rows, canEdit, today, caption }: {
  groups: Group[]; people: MatrixRow[]; rows: ControlStatusRow[]; canEdit: boolean; today: string; caption: string;
}) {
  const [target, setTarget] = useState<StatusTarget | null>(null);
  const map = useMemo(() => statusMap(rows), [rows]);
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const firstOfGroup = useMemo(() => new Set(groups.map((group) => group.items[0]?.id)), [groups]);
  const firstItem = items[0]?.id;
  const edge = (item: ControlItem): Edge => item.id === firstItem ? "none" : firstOfGroup.has(item.id) ? "strong" : "soft";

  return <>
    <div className="w-full max-w-full overflow-x-auto overscroll-x-contain" data-testid="control-matrix-scroll">
      <table className="w-max border-separate [--grid:color-mix(in_oklab,var(--foreground)_10%,var(--card))] [--grid-strong:color-mix(in_oklab,var(--foreground)_28%,var(--card))] border-spacing-0 text-xs" lang="pt-BR">
        <caption className="sr-only">{caption}</caption>
        <colgroup><col className="w-44" /></colgroup>
        <colgroup>{items.map((item) => <col key={item.id} className={ITEM_COL} />)}</colgroup>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className={cn(HEAD, STICKY, LINE_B_STICKY, "z-20 px-2")}>Associado</th>
            {groups.map((group, index) => <th key={group.directorate} scope="colgroup" colSpan={group.items.length}
              className={cn(HEAD, index > 0 ? LINE_B_STRONG : LINE_B, BAND[group.directorate], "py-1 text-center text-xs font-semibold text-foreground uppercase")}>
              {directorateLabels[group.directorate]}
            </th>)}
          </tr>
          <tr>
            {items.map((item) => <th key={item.id} scope="col" className={cn(HEAD, ITEM_COL, "px-2.5 py-1.5 text-center align-middle text-[11px] font-semibold leading-tight tracking-normal text-foreground normal-case whitespace-normal", LINE[edge(item) === "soft" ? "none" : edge(item)])}
              title={`${item.name} · ${itemKindLabels[item.kind]} · ${validityLabel(item.validity_months)}`}>
              {/* Fonte pequena com quebra de linha, centralizada, como no Doc 22. */}
              {item.name}
            </th>)}
          </tr>
        </thead>
        <tbody>{people.map(({ key, person, parent }) => {
          const who = parent ? `${person.name} (responsável de ${parent})` : person.name;
          const sub = [!person.active && "desligado", person.detail].filter(Boolean).join(" · ");
          return <tr key={key} className="group" data-relative={parent ? "" : undefined}>
            <th scope="row" className={cn(STICKY, LINE_B_STICKY, "bg-card py-1 pr-2 text-left text-xs font-medium tracking-normal text-foreground normal-case group-hover:bg-muted",
              parent ? "pl-5 font-normal" : "pl-2", !person.active && "text-muted-foreground")}>
              {parent
                ? <span title={who} className="block truncate"><span className="sr-only">Responsável: </span>{person.name}</span>
                : <Link href={`/associados/${person.id}`} title={person.name} className="block truncate hover:underline">{person.name}</Link>}
              {sub && <span className="block truncate text-[10px] font-normal text-muted-foreground" title={sub}>{sub}</span>}
            </th>
            {items.map((item) => {
              const cell = matrixCell(person, item, map);
              if (!cell.applies && !cell.row) {
                // Fora do público do item: cinza preenchido, sem texto e sem edição.
                return <td key={item.id} className={cn(CELL, "px-0.5 py-0.5", NOT_APPLICABLE, LINE[edge(item)])}>
                  <span className="sr-only">não se aplica a este tipo de pessoa</span>
                </td>;
              }
              // item que mostra um valor (ano, data): o valor na cor da situação; a situação vai no nome acessível
              const value = cellValue(item, cell.row);
              const label = `${item.name}, ${who}: ${value ? `${value} (${cellStatusLabel(cell.status)})` : cellStatusLabel(cell.status)}`;
              const detail = cell.row && [cell.row.status_date && `data ${dateBR(cell.row.status_date)}`, cell.row.valid_until && `validade ${dateBR(cell.row.valid_until)}`, cell.row.note].filter(Boolean).join(" · ");
              const badge = <ControlBadge status={cell.status} value={value} short />;
              return <td key={item.id} className={cn(CELL, "px-0.5 py-0.5 text-center group-hover:bg-muted/40", LINE[edge(item)])} title={detail || undefined}>
                {canEdit
                  ? <button type="button" aria-label={`Editar ${label}`}
                    onClick={() => setTarget({ person: { id: person.id, name: person.name, relative: person.relative, context: parent && `responsável de ${parent}` }, item, row: cell.row })}
                    className="inline-flex min-h-7 w-full items-center justify-center gap-0.5 rounded-md px-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">
                    {badge}{cell.row?.note && <span aria-hidden className="text-muted-foreground">*</span>}
                  </button>
                  : <span className="inline-flex min-h-7 items-center">{badge}</span>}
              </td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </div>
    {canEdit && <ControlStatusDialog target={target} today={today} onClose={() => setTarget(null)} />}
  </>;
}

/** Legenda da matriz: cinza (fora do público), N/A (marcado à mão) e "—" (sem registro). */
export function ControlLegend() {
  return <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground">
    <span aria-hidden className={cn("inline-block h-3 w-5 rounded-sm align-middle", NOT_APPLICABLE)} /> cinza: não se aplica a este tipo de pessoa
    <span aria-hidden>·</span> <ControlBadge status="nao_se_aplica" short /> marcado como não se aplica
    <span aria-hidden>·</span> <ControlBadge status="sem_registro" short /> sem registro (pendência)
  </p>;
}
