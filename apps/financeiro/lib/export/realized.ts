import { sortCategories, type CategoryItem, type CategoryKind } from "@/lib/categories";

export type RealizedSum = { category_id: string; month: number; amount_cents: number };

export type RealizedRow = {
  id: string;
  label: string;
  /** Código e nome do cadastro (raiz sintética: "1"/"2" e "Receitas"/"Despesas"). */
  code: string | null;
  name: string;
  /** 0 = raiz (1. Receitas / 2. Despesas). */
  depth: number;
  kind: CategoryKind;
  /** Valor lançado diretamente nesta rubrica por mês, em centavos, já com sinal de exibição (despesa positiva). */
  own: number[];
  /** Índices (em `rows`) dos filhos diretos. */
  children: number[];
  /** Total por mês: próprio + filhos. */
  total: number[];
  /** Rubrica sem pai no cadastro, colocada sob a raiz do seu tipo (o filtro por subárvore da raiz não a alcança). */
  adopted?: boolean;
};

export type RealizedModel = { year: number; rows: RealizedRow[]; roots: Partial<Record<CategoryKind, number>> };

const zeros = () => Array<number>(12).fill(0);
const ROOT_NAMES: Record<CategoryKind, string> = { receita: "Receitas", despesa: "Despesas" };

/**
 * Matriz rubrica × mês do Realizado. Mostra rubricas ativas com código e qualquer rubrica
 * com movimento no ano (com seus ancestrais). Despesas aparecem positivas; estornos aparecem negativos.
 * Rubricas antigas sem código entram sob a raiz do seu tipo (ou pelo sinal do saldo anual, se sem tipo).
 */
export function buildRealizedModel(categories: CategoryItem[], sums: RealizedSum[], year: number): RealizedModel {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const raw = new Map<string, number[]>();
  for (const s of sums) {
    if (s.month < 1 || s.month > 12) continue;
    const values = raw.get(s.category_id) ?? zeros();
    values[s.month - 1] += Number(s.amount_cents);
    raw.set(s.category_id, values);
  }
  const moved = (id: string) => raw.get(id)?.some((v) => v !== 0) ?? false;
  const kindOf = (c: CategoryItem): CategoryKind => c.kind ?? ((raw.get(c.id) ?? []).reduce((a, b) => a + b, 0) < 0 ? "despesa" : "receita");

  // inclui ativas com código, as com movimento e os ancestrais de ambas
  const included = new Set<string>();
  for (const c of categories) {
    if (!((c.active && c.code) || moved(c.id))) continue;
    let current: CategoryItem | undefined = c;
    while (current && !included.has(current.id)) {
      included.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }

  const children = new Map<string, CategoryItem[]>();
  const rootByKind = new Map<CategoryKind, CategoryItem>();
  const orphans: CategoryItem[] = [];
  for (const c of sortCategories(categories.filter((c) => included.has(c.id)))) {
    if (c.code && !c.code.includes(".") && !c.parent_id) { rootByKind.set(kindOf(c), c); continue; }
    if (c.parent_id && included.has(c.parent_id)) children.set(c.parent_id, [...(children.get(c.parent_id) ?? []), c]);
    else orphans.push(c);
  }

  const rows: RealizedRow[] = [];
  const roots: RealizedModel["roots"] = {};
  const add = (c: CategoryItem | null, kind: CategoryKind, depth: number, extra: CategoryItem[] = []): number => {
    const index = rows.length;
    const sign = kind === "despesa" ? -1 : 1;
    const label = c ? (c.code ? `${c.code}. ${c.name}` : `${c.name} (sem código)`) : `${kind === "receita" ? 1 : 2}. ${ROOT_NAMES[kind]}`;
    const row: RealizedRow = { id: c?.id ?? `root-${kind}`, label, code: c ? c.code : kind === "receita" ? "1" : "2", name: c?.name ?? ROOT_NAMES[kind], depth, kind, own: (c ? raw.get(c.id) ?? zeros() : zeros()).map((v) => sign * v || 0), children: [], total: zeros() };
    rows.push(row);
    for (const child of c ? children.get(c.id) ?? [] : []) row.children.push(add(child, kind, depth + 1));
    for (const child of extra) { const i = add(child, kind, depth + 1); rows[i].adopted = true; row.children.push(i); }
    row.total = row.own.map((v, m) => v + row.children.reduce((sum, i) => sum + rows[i].total[m], 0));
    return index;
  };
  for (const kind of ["receita", "despesa"] as const) {
    const extra = orphans.filter((c) => kindOf(c) === kind);
    const root = rootByKind.get(kind);
    if (!root && !extra.length) continue;
    roots[kind] = add(root ?? null, kind, 0, extra);
  }
  return { year, rows, roots };
}

/**
 * Filtro da lista para uma linha (tokens de `encodeCategorySelection`): a própria rubrica já cobre os descendentes
 * do cadastro; só as adotadas (sem pai, postas sob a raiz) e a raiz sintética precisam de tokens próprios.
 */
export function rowFilterTokens(model: RealizedModel, index: number): string[] {
  const row = model.rows[index];
  const own = row.id.startsWith("root-") ? [] : [row.id];
  return [...own, ...row.children.filter((i) => model.rows[i].adopted).map((i) => model.rows[i].id)];
}
