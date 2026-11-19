import type { ScoutBranch } from "./model";

// Controle de dados pessoais (Doc 22, migration 041): itens de controle por diretoria, situação de cada item por
// associado, funções dos adultos e o público de cada associado. Puro: usado pelas telas e pelas ações.

// Diretorias ------------------------------------------------------------------------------------

export const DIRECTORATES = ["metodos_educativos", "administrativa", "financeira", "comunicacao"] as const;
export type Directorate = (typeof DIRECTORATES)[number];

export const directorateLabels: Record<Directorate, string> = {
  metodos_educativos: "Métodos Educativos",
  administrativa: "Administrativa",
  financeira: "Financeira",
  comunicacao: "Comunicação",
};

/** Diretoria na URL (`?ocultar=financeira,comunicacao`): o valor do banco com hífen. */
export const directorateSlug = (directorate: Directorate) => directorate.replaceAll("_", "-");
export function directorateFromSlug(slug: string): Directorate | null {
  const value = slug.replaceAll("-", "_");
  return (DIRECTORATES as readonly string[]).includes(value) ? value as Directorate : null;
}
export const isDirectorate = (value: string): value is Directorate => (DIRECTORATES as readonly string[]).includes(value);

/** Diretorias ocultas na matriz, de `?ocultar=` (slugs separados por vírgula), na ordem das diretorias. */
export function hiddenDirectorates(value: string | undefined | null): Directorate[] {
  const slugs = new Set((value ?? "").split(",").map((slug) => directorateFromSlug(slug.trim())).filter((d) => d !== null));
  return DIRECTORATES.filter((d) => slugs.has(d));
}
/** Valor de `?ocultar=` para estas diretorias (vazio = nenhuma oculta). */
export const hiddenParam = (hidden: readonly Directorate[]) => DIRECTORATES.filter((d) => hidden.includes(d)).map(directorateSlug).join(",");

// Público ---------------------------------------------------------------------------------------

export const CONTROL_AUDIENCES = ["jovem", "adulto", "responsavel"] as const;
export type ControlAudience = (typeof CONTROL_AUDIENCES)[number];

/** Rótulo no plural (abas do Doc 22, filtro da matriz). */
export const audienceLabels: Record<ControlAudience, string> = { jovem: "Jovens", adulto: "Adultos", responsavel: "Responsáveis" };
/** Rótulo no singular (configuração do item). */
export const audienceNames: Record<ControlAudience, string> = { jovem: "Jovem", adulto: "Adulto", responsavel: "Responsável" };
export const isAudience = (value: string): value is ControlAudience => (CONTROL_AUDIENCES as readonly string[]).includes(value);

/** Abas da matriz: os responsáveis aparecem sob cada jovem, na aba Jovens. */
export const MATRIX_AUDIENCES = ["jovem", "adulto"] as const;
export type MatrixAudience = (typeof MATRIX_AUDIENCES)[number];
/** Públicos cujas colunas entram na aba: Jovens mostra também os itens dos responsáveis. */
export const tabAudiences = (tab: MatrixAudience): ControlAudience[] => (tab === "jovem" ? ["jovem", "responsavel"] : ["adulto"]);

/** Público na URL (`?publico=jovens|adultos`). */
export const audienceSlugs: Record<MatrixAudience, string> = { jovem: "jovens", adulto: "adultos" };
/** Público de `?publico=`; aceita os valores antigos (jovem, escotista, dirigente). Padrão: jovens. */
export function audienceFromSlug(value: string | undefined | null): MatrixAudience {
  return value === "adultos" || value === "adulto" || value === "escotista" || value === "dirigente" ? "adulto" : "jovem";
}

// Funções do adulto -----------------------------------------------------------------------------

export const FUNCTION_KINDS = ["escotista", "dirigente"] as const;
export type FunctionKind = (typeof FUNCTION_KINDS)[number];
export const functionKindLabels: Record<FunctionKind, string> = { escotista: "Escotista", dirigente: "Dirigente" };
export const isFunctionKind = (value: string): value is FunctionKind => (FUNCTION_KINDS as readonly string[]).includes(value);

/** Linha de `associate_function_rows`. */
export type AssociateFunction = {
  id: string; associate_id: string; kind: FunctionKind; title: string | null; started_on: string | null; ended_on: string | null;
};

/** Função ativa na data `on`, como `associate_function_rows.active`: sem fim ou com fim depois de `on`. */
export function isFunctionActive(fn: Pick<AssociateFunction, "ended_on">, on: string) {
  return !fn.ended_on || fn.ended_on > on;
}

/** Tipos de função ativos por associado (id → tipos). */
export function activeFunctionKinds(functions: AssociateFunction[], on: string): Map<string, Set<FunctionKind>> {
  const kinds = new Map<string, Set<FunctionKind>>();
  for (const fn of functions) {
    if (!isFunctionActive(fn, on)) continue;
    const set = kinds.get(fn.associate_id) ?? new Set<FunctionKind>();
    set.add(fn.kind);
    kinds.set(fn.associate_id, set);
  }
  return kinds;
}

/** Público do associado (como a visão `associate_audiences`): só pelo ramo; as funções não mudam o público. */
export function associateAudiences(branch: ScoutBranch): ControlAudience[] {
  return [branch === "adulto" ? "adulto" : "jovem"];
}

// Itens de controle -----------------------------------------------------------------------------

export const CONTROL_ITEM_KINDS = ["documento", "sistema", "canal", "etapa"] as const;
export type ControlItemKind = (typeof CONTROL_ITEM_KINDS)[number];
export const itemKindLabels: Record<ControlItemKind, string> = { documento: "Documento", sistema: "Sistema", canal: "Canal", etapa: "Etapa" };
export const isItemKind = (value: string): value is ControlItemKind => (CONTROL_ITEM_KINDS as readonly string[]).includes(value);

/**
 * O que a célula da matriz mostra: a situação (selo) ou um valor da situação, como no Doc 22: o ano ("Ano-base do
 * registro": `value_year`) ou a data curta ("Validade do registro": `valid_until`), com a cor da situação efetiva.
 */
export const CONTROL_VALUE_KINDS = ["situacao", "ano", "data"] as const;
export type ControlValueKind = (typeof CONTROL_VALUE_KINDS)[number];
export const valueKindLabels: Record<ControlValueKind, string> = { situacao: "Situação", ano: "Ano", data: "Data" };
export const isValueKind = (value: string): value is ControlValueKind => (CONTROL_VALUE_KINDS as readonly string[]).includes(value);

/**
 * Público do item (linha de `control_item_audiences`): linha presente = se aplica; `initial_status` é a situação
 * gravada quando a pessoa é cadastrada (nula = sem registro).
 */
export type ItemAudience = { audience: ControlAudience; initial_status: ControlStatus | null };

/** Linha de `control_items` com os seus públicos (na ordem de CONTROL_AUDIENCES). */
export type ControlItem = {
  id: string; name: string; kind: ControlItemKind; value_kind: ControlValueKind; directorate: Directorate; audiences: ItemAudience[];
  validity_months: number | null; remove_on_leave: boolean; active: boolean; position: number;
};

/** O item vale para alguém com estes públicos. */
export const itemApplies = (item: Pick<ControlItem, "audiences">, audiences: readonly ControlAudience[]) =>
  item.audiences.some((a) => audiences.includes(a.audience));

/** Públicos do item na ordem de CONTROL_AUDIENCES, sem repetir. */
export function sortAudiences(audiences: readonly ItemAudience[]): ItemAudience[] {
  const by = new Map(audiences.map((a) => [a.audience, a]));
  return CONTROL_AUDIENCES.flatMap((audience) => (by.has(audience) ? [by.get(audience)!] : []));
}

/** Resumo para a lista de itens: "Jovem: Pend. · Responsável: —" ("—" = sem registro). */
export const audiencesSummary = (audiences: readonly ItemAudience[]) =>
  sortAudiences(audiences).map((a) => `${audienceNames[a.audience]}: ${a.initial_status ? statusShortLabels[a.initial_status] : "—"}`).join(" · ");

/** Itens da diretoria na ordem escolhida (posição; empate pelo nome). */
export function orderedItems<T extends Pick<ControlItem, "position" | "name">>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

export const validityLabel = (months: number | null) =>
  months === null ? "Não vence" : months % 12 === 0 ? `${months / 12} ${months === 12 ? "ano" : "anos"}` : `${months} ${months === 1 ? "mês" : "meses"}`;

// Situação --------------------------------------------------------------------------------------

export const CONTROL_STATUSES = ["ok", "pendente", "desatualizado", "a_verificar", "convidado", "nao_se_aplica", "a_remover", "removido"] as const;
export type ControlStatus = (typeof CONTROL_STATUSES)[number];
export const isControlStatus = (value: string): value is ControlStatus => (CONTROL_STATUSES as readonly string[]).includes(value);

export const statusLabels: Record<ControlStatus, string> = {
  ok: "OK",
  pendente: "Pendente",
  desatualizado: "Desatualizado",
  a_verificar: "A verificar",
  convidado: "Convidado",
  nao_se_aplica: "Não se aplica",
  a_remover: "A remover",
  removido: "Removido",
};

/** Rótulo curto para a matriz (o completo vai no título e para leitores de tela). */
export const statusShortLabels: Record<ControlStatus, string> = {
  ok: "OK",
  pendente: "Pend.",
  desatualizado: "Desat.",
  a_verificar: "Verificar",
  convidado: "Conv.",
  nao_se_aplica: "N/A",
  a_remover: "Remover",
  removido: "Removido",
};

/** Situação efetiva ou "sem registro" (sem linha em `control_statuses`). */
export type CellStatus = ControlStatus | "sem_registro";
export const cellStatusLabel = (status: CellStatus) => (status === "sem_registro" ? "Sem registro" : statusLabels[status]);

/** Situações que pedem ação (Pendência); "sem registro" também conta. */
const PENDING: readonly CellStatus[] = ["pendente", "desatualizado", "a_verificar", "a_remover", "sem_registro"];
export const isPending = (status: CellStatus) => PENDING.includes(status);

/** Tom do selo de cada situação (cor + texto, nunca só cor). */
export type StatusTone = "ok" | "warn" | "danger" | "info" | "muted" | "empty";
export const statusTone: Record<CellStatus, StatusTone> = {
  ok: "ok",
  pendente: "danger",
  desatualizado: "warn",
  a_verificar: "warn",
  convidado: "info",
  nao_se_aplica: "muted",
  a_remover: "danger",
  removido: "muted",
  sem_registro: "empty",
};

/** Linha de `control_status_rows`: de um associado ou de um responsável (exatamente um dos dois). */
export type ControlStatusRow = {
  associate_id: string | null; relative_id: string | null; item_id: string; status: ControlStatus; effective_status: ControlStatus;
  status_date: string | null; valid_until: string | null; value_year: number | null; note: string | null; updated_at: string;
};

/** Como a visão: ok com validade antes de `today` ou ano antes do ano de `today` vira desatualizado. */
export function effectiveStatus(status: ControlStatus, validUntil: string | null, today: string, valueYear: number | null = null): ControlStatus {
  const expired = (validUntil !== null && validUntil < today) || (valueYear !== null && valueYear < Number(today.slice(0, 4)));
  return status === "ok" && expired ? "desatualizado" : status;
}

/** Data curta da célula: `AAAA-MM-DD` → `dd/mm/aa`. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** Valor mostrado na célula de um item que mostra ano ou data; nulo = mostra a situação (selo). */
export function cellValue(item: Pick<ControlItem, "value_kind">, row: Pick<ControlStatusRow, "value_year" | "valid_until"> | undefined): string | null {
  if (!row) return null;
  if (item.value_kind === "ano") return row.value_year === null ? null : String(row.value_year);
  if (item.value_kind === "data") return row.valid_until ? shortDate(row.valid_until) : null;
  return null;
}

/** Soma meses a uma data `AAAA-MM-DD`, parando no último dia do mês (31/01 + 1 mês = 28 ou 29/02). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Validade sugerida ao marcar ok: data da situação (ou hoje) + meses do item; nula se o item não vence. */
export function suggestedValidUntil(statusDate: string | null, validityMonths: number | null, today: string): string | null {
  return validityMonths === null ? null : addMonths(statusDate || today, validityMonths);
}

/** Situação da célula pessoa × item: a efetiva da linha, ou "sem registro". */
export const cellStatus = (row: Pick<ControlStatusRow, "effective_status"> | undefined): CellStatus => row?.effective_status ?? "sem_registro";

/** Pessoa de uma situação: associado (id) ou responsável (`r:` + id), para não confundir os dois. */
export const personKey = (person: { id: string; relative?: boolean }) => (person.relative ? `r:${person.id}` : person.id);
const rowPersonKey = (row: Pick<ControlStatusRow, "associate_id" | "relative_id">) =>
  row.relative_id ? `r:${row.relative_id}` : row.associate_id ?? "";

/** Chave do mapa de situações (`personKey` × item). */
export const statusKey = (key: string, itemId: string) => `${key}:${itemId}`;

export function statusMap(rows: ControlStatusRow[]): Map<string, ControlStatusRow> {
  return new Map(rows.map((row) => [statusKey(rowPersonKey(row), row.item_id), row]));
}

// Matriz pessoa × item (/associados/controle) ---------------------------------------------------

/**
 * Pessoa da matriz: associado ou, com `relative`, responsável (linha abaixo do jovem). `detail`: seção (jovens),
 * funções (adultos) ou parentesco (responsáveis), em texto pequeno abaixo do nome.
 */
export type MatrixPerson = { id: string; name: string; active: boolean; audiences: ControlAudience[]; detail?: string | null; relative?: boolean };
export type MatrixCell = { status: CellStatus; applies: boolean; row?: ControlStatusRow };

/**
 * Célula: fora do público do item é "não se aplica a este tipo de pessoa" (cinza), salvo se houver registro (ex.:
 * "a remover" de quem saiu da função); desligados sem registro não são cobrados (só os itens com registro contam).
 */
export function matrixCell(person: MatrixPerson, item: ControlItem, rows: Map<string, ControlStatusRow>): MatrixCell {
  const row = rows.get(statusKey(personKey(person), item.id));
  const applies = itemApplies(item, person.audiences);
  if (!row && (!applies || !person.active)) return { status: "sem_registro", applies: false };
  return { status: cellStatus(row), applies, row };
}

/**
 * Colunas da matriz única: diretorias visíveis, na ordem, cada uma com os itens ativos da aba (Jovens: itens de
 * jovem ou de responsável; Adultos: itens de adulto).
 */
export function matrixGroups(items: ControlItem[], tab: MatrixAudience, hidden: readonly Directorate[] = []): { directorate: Directorate; items: ControlItem[] }[] {
  const audiences = tabAudiences(tab);
  return DIRECTORATES.filter((d) => !hidden.includes(d))
    .map((directorate) => ({
      directorate,
      items: orderedItems(items.filter((item) => item.active && item.directorate === directorate && itemApplies(item, audiences))),
    }))
    .filter((group) => group.items.length > 0);
}

/** A linha tem alguma pendência entre os itens mostrados. */
export const rowHasPending = (person: MatrixPerson, items: ControlItem[], rows: Map<string, ControlStatusRow>) =>
  items.some((item) => {
    const cell = matrixCell(person, item, rows);
    return (cell.applies || cell.row) && isPending(cell.status);
  });

/** Bloco da aba Jovens: o jovem e, logo abaixo, os seus responsáveis (o compartilhado aparece sob cada irmão). */
export type MatrixBlock = { person: MatrixPerson; relatives: MatrixPerson[] };

/** Filtros da matriz por bloco: a busca e "só pendências" valem se o jovem ou um dos seus responsáveis atende. */
export function filterBlocks(blocks: MatrixBlock[], items: ControlItem[], rows: Map<string, ControlStatusRow>,
  { matches, pendingOnly }: { matches: (name: string) => boolean; pendingOnly: boolean }): MatrixBlock[] {
  return blocks.filter((block) => {
    const people = [block.person, ...block.relatives];
    return people.some((p) => matches(p.name)) && (!pendingOnly || people.some((p) => rowHasPending(p, items, rows)));
  });
}

/** Pendências dos ativos a quem o item se aplica; cada pessoa conta uma vez (responsável compartilhado também). */
export function pendingCount(people: MatrixPerson[], items: ControlItem[], rows: Map<string, ControlStatusRow>): number {
  const seen = new Set<string>();
  let count = 0;
  for (const person of people) {
    const key = personKey(person);
    if (!person.active || seen.has(key)) continue;
    seen.add(key);
    for (const item of items) {
      const cell = matrixCell(person, item, rows);
      if (cell.applies && isPending(cell.status)) count += 1;
    }
  }
  return count;
}

/** Rodapé por coluna: quantos ok entre as pessoas a quem o item se aplica. */
export function columnTotals(people: MatrixPerson[], items: ControlItem[], rows: Map<string, ControlStatusRow>): Record<string, { ok: number; total: number }> {
  const totals: Record<string, { ok: number; total: number }> = {};
  for (const item of items) {
    let ok = 0;
    let total = 0;
    for (const person of people) {
      const cell = matrixCell(person, item, rows);
      if (!cell.applies) continue;
      total += 1;
      if (cell.status === "ok") ok += 1;
    }
    totals[item.id] = { ok, total };
  }
  return totals;
}

/** Pendências por diretoria (para o resumo): células com pendência entre ativos a quem o item se aplica. */
export function pendingByDirectorate(people: MatrixPerson[], items: ControlItem[], rows: Map<string, ControlStatusRow>): Record<Directorate, number> {
  const counts = Object.fromEntries(DIRECTORATES.map((d) => [d, 0])) as Record<Directorate, number>;
  for (const item of items) {
    if (!item.active) continue;
    for (const person of people) {
      const cell = matrixCell(person, item, rows);
      if ((cell.applies || cell.row) && isPending(cell.status)) counts[item.directorate] += 1;
    }
  }
  return counts;
}
