import { Link } from "@geas/ui/components/link";
import { cn } from "@geas/ui/lib/utils";
import {
  cellStatusLabel, cellValue, directorateLabels, itemKindLabels, matrixCell, statusMap, statusShortLabels, statusTone, validityLabel,
  type ControlItem, type ControlStatusRow, type Directorate, type MatrixPerson,
} from "@/lib/associates/controls";
import { chunk, cvCols, cvRows } from "@/components/shell/cv-rows";
import { dateBR } from "@/lib/format";
import { ControlBadge } from "./control-badge";
import { ControlMatrixEditor } from "./control-matrix-editor";

const HEAD = "h-auto border-0 bg-muted px-1.5 py-1.5 text-left align-bottom text-[11px] font-semibold text-muted-foreground";
/** Coluna do nome: mesma borda forte das divisões entre diretorias, para seguir visível ao rolar. */
const STICKY = "sticky left-0 z-10 w-44 min-w-44 max-w-44 border-0";
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

/**
 * Estilo das células do corpo, uma vez só no `<table>` (variantes do Tailwind), e não repetido em cada uma das
 * milhares de células: no App Router cada classe vai duas vezes na página (HTML + payload RSC). As células levam só
 * `data-e` (borda à esquerda: `s` suave, `S` forte entre diretorias), `data-na` (fora do público) e o selo `data-t`
 * (tom da situação, como `ControlBadge`).
 */
const BODY = [
  "[&_td]:border-0 [&_td]:px-0.5 [&_td]:py-0.5 [&_td]:text-center [&_td]:shadow-[inset_0_-1px_0_var(--grid)]",
  "[&_td[data-e=s]]:shadow-[inset_1px_0_0_var(--grid),inset_0_-1px_0_var(--grid)]",
  "[&_td[data-e=S]]:shadow-[inset_2px_0_0_var(--grid-strong),inset_0_-1px_0_var(--grid)]",
  "[&_td[data-na]]:bg-[var(--grid)] [&_tr:hover_td:not([data-na])]:bg-muted/40",
  "[&_td_button]:inline-flex [&_td_button]:min-h-7 [&_td_button]:w-full [&_td_button]:items-center [&_td_button]:justify-center [&_td_button]:gap-0.5",
  "[&_td_button]:rounded-md [&_td_button]:px-0.5 [&_td_button:hover]:bg-muted [&_td_button:focus-visible]:ring-2 [&_td_button:focus-visible]:ring-ring/40 [&_td_button:focus-visible]:outline-none",
  "[&_[data-v]]:inline-flex [&_[data-v]]:min-h-7 [&_[data-v]]:items-center [&_[data-note]]:text-muted-foreground",
  "[&_[data-t]]:inline-flex [&_[data-t]]:h-5 [&_[data-t]]:items-center [&_[data-t]]:justify-center [&_[data-t]]:rounded-full [&_[data-t]]:border [&_[data-t]]:px-2 [&_[data-t]]:text-[11px] [&_[data-t]]:font-semibold [&_[data-t]]:whitespace-nowrap",
  "[&_[data-t=ok]]:border-success/30 [&_[data-t=ok]]:bg-success-soft [&_[data-t=ok]]:text-success",
  "[&_[data-t=warn]]:border-[var(--orange)]/30 [&_[data-t=warn]]:bg-[var(--orange-soft)] [&_[data-t=warn]]:text-[var(--orange-dark)]",
  "[&_[data-t=danger]]:border-destructive/30 [&_[data-t=danger]]:bg-destructive-soft [&_[data-t=danger]]:text-destructive",
  "[&_[data-t=info]]:border-primary/20 [&_[data-t=info]]:bg-[var(--purple-soft)] [&_[data-t=info]]:text-[var(--purple-dark)]",
  "[&_[data-t=muted]]:border-border [&_[data-t=muted]]:bg-muted [&_[data-t=muted]]:text-muted-foreground",
  "[&_[data-t=empty]]:border-dashed [&_[data-t=empty]]:border-border [&_[data-t=empty]]:bg-transparent [&_[data-t=empty]]:text-muted-foreground",
].join(" ");
const EDGE_ATTR: Record<Edge, "s" | "S" | undefined> = { none: undefined, soft: "s", strong: "S" };

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
 * Componente de servidor: as células não têm handler; quem edita ganha um só ouvinte delegado (`ControlMatrixEditor`).
 */
export function ControlMatrix({ groups, people, rows, canEdit, today, caption }: {
  groups: Group[]; people: MatrixRow[]; rows: ControlStatusRow[]; canEdit: boolean; today: string; caption: string;
}) {
  const map = statusMap(rows);
  const items = groups.flatMap((group) => group.items);
  const firstOfGroup = new Set(groups.map((group) => group.items[0]?.id));
  const firstItem = items[0]?.id;
  const edge = (item: ControlItem): Edge => item.id === firstItem ? "none" : firstOfGroup.has(item.id) ? "strong" : "soft";

  const matrix = <div className="w-full max-w-full scroll-x-reserved" data-testid="control-matrix-scroll">
      <table style={cvCols(["11rem", `repeat(${items.length}, 6rem)`])} className={cn("cv-table w-max border-separate [--grid:color-mix(in_oklab,var(--foreground)_10%,var(--card))] [--grid-strong:color-mix(in_oklab,var(--foreground)_28%,var(--card))] border-spacing-0 text-xs", BODY)} lang="pt-BR">
        <caption className="sr-only">{caption}</caption>
        <colgroup><col className="w-44" /></colgroup>
        <colgroup>{items.map((item) => <col key={item.id} className={ITEM_COL} />)}</colgroup>
        {/* Cabeçalho em duas linhas: as linhas viram `contents` na grade (`cv-table`) e as células ocupam as faixas. */}
        <thead>
          <tr className="contents!">
            <th scope="col" rowSpan={2} className={cn(HEAD, STICKY, LINE_B_STICKY, "z-20 row-span-2 px-2")}>Associado</th>
            {groups.map((group, index) => <th key={group.directorate} scope="colgroup" colSpan={group.items.length} style={{ gridColumn: `span ${group.items.length}` }}
              className={cn(HEAD, index > 0 ? LINE_B_STRONG : LINE_B, BAND[group.directorate], "py-1 text-center text-xs font-semibold text-foreground uppercase")}>
              {directorateLabels[group.directorate]}
            </th>)}
          </tr>
          <tr className="contents!">
            {items.map((item) => <th key={item.id} scope="col" className={cn(HEAD, ITEM_COL, "px-2.5 py-1.5 text-center align-middle text-[11px] font-semibold leading-tight tracking-normal text-foreground normal-case whitespace-normal", LINE[edge(item) === "soft" ? "none" : edge(item)])}
              title={`${item.name} · ${itemKindLabels[item.kind]} · ${validityLabel(item.validity_months)}`}>
              {/* Fonte pequena com quebra de linha, centralizada, como no Doc 22. */}
              {item.name}
            </th>)}
          </tr>
        </thead>
        {/* Corpo em blocos de linhas (`cv-rows`): o navegador pula estilo, layout e pintura dos que estão fora da tela. */}
        {chunk(people).map((block, index) => <tbody key={index} className="cv-rows" style={cvRows(block.length, "2.5rem")}>{block.map(({ key, person, parent }) => {
          const who = parent ? `${person.name} (responsável de ${parent})` : person.name;
          const sub = [!person.active && "desligado", person.detail].filter(Boolean).join(" · ");
          // pessoa na linha (uma vez), não em cada célula: o editor lê daqui e acha o item pela coluna
          return <tr key={key} className="group" data-relative={person.relative ? "" : undefined} data-person-id={canEdit ? person.id : undefined}
            data-person-name={canEdit ? person.name : undefined} data-context={canEdit && parent ? `responsável de ${parent}` : undefined}>
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
                return <td key={item.id} data-na="" data-e={EDGE_ATTR[edge(item)]}><span className="sr-only">não se aplica a este tipo de pessoa</span></td>;
              }
              // item que mostra um valor (ano, data): o valor na cor da situação; a situação vai no nome acessível
              const value = cellValue(item, cell.row);
              const status = cellStatusLabel(cell.status);
              const label = `${item.name}, ${who}: ${value ? `${value} (${status})` : status}`;
              const detail = cell.row && [cell.row.status_date && `data ${dateBR(cell.row.status_date)}`, cell.row.valid_until && `validade ${dateBR(cell.row.valid_until)}`, cell.row.note].filter(Boolean).join(" · ");
              const text = value ?? (cell.status === "sem_registro" ? "—" : statusShortLabels[cell.status]);
              const tone = statusTone[cell.status];
              return <td key={item.id} data-e={EDGE_ATTR[edge(item)]} title={detail || undefined}>
                {canEdit
                  // o nome acessível (aria-label) diz item, pessoa e situação: o selo dentro fica só visual
                  ? <button type="button" aria-label={`Editar ${label}`} data-cell=""><span data-t={tone} aria-hidden className={value ? "num" : undefined}>{text}</span>{cell.row?.note && <span aria-hidden data-note="">*</span>}</button>
                  : <span data-v=""><span data-t={tone} className={value ? "num" : undefined}><span aria-hidden>{text}</span><span className="sr-only">{value ? ` (${status})` : status}</span></span></span>}
              </td>;
            })}
          </tr>;
        })}</tbody>)}
      </table>
    </div>;
  return canEdit ? <ControlMatrixEditor items={items} rows={rows} today={today}>{matrix}</ControlMatrixEditor> : matrix;
}

/** Legenda da matriz: cinza (fora do público), N/A (marcado à mão) e "—" (sem registro). */
export function ControlLegend() {
  return <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground">
    <span aria-hidden className={cn("inline-block h-3 w-5 rounded-sm align-middle", NOT_APPLICABLE)} /> cinza: não se aplica a este tipo de pessoa
    <span aria-hidden>·</span> <ControlBadge status="nao_se_aplica" short /> marcado como não se aplica
    <span aria-hidden>·</span> <ControlBadge status="sem_registro" short /> sem registro (pendência)
  </p>;
}
