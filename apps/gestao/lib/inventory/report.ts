// PDF de conferência do inventário (/inventario/relatorios/conferencia): conteúdo puro. Por divisão, na ordem da
// árvore, os materiais na ordem escolhida (017), com quantidade, estado, validade e etiquetas das peças, e colunas em
// branco para a contagem à mão. Cada divisão raiz é uma parte (página nova); dados em lib/server/inventory/report.ts.

import { compareLines, conditionBreakdown } from "./material-list";
import type { LocationPath } from "./locations";
import type { MaterialRow, StockRow } from "./model";
import { CONDITION_LABELS } from "./vocabulary";

export const COUNT_SHEET_TITLE = "Conferência do inventário";
/** Linhas em branco no fim de cada divisão (material achado que não está na lista). */
export const BLANK_COUNT_ROWS = 2;

export type CountSheetLine = {
  materialId: string;
  name: string;
  quantity: number;
  /** Estado: o único, ou a quebra "2 ruim · 7 bom". */
  condition: string | null;
  /** Validade mais próxima, "31/03/27". */
  expiry: string | null;
  /** Etiquetas das peças, resumidas ("GEAS-001: 0001–0005, 0007"). */
  tags: string | null;
};
export type CountSheetBlock = { locationId: string; title: string; depth: number; lines: CountSheetLine[] };
export type CountSheetPart = { locationId: string; title: string; blocks: CountSheetBlock[] };
export type CountSheet = { parts: CountSheetPart[] };

export type UnitTag = { material_id: string; location_id: string; tag: string | null };

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/**
 * Etiquetas resumidas por família, números seguidos em faixa: ["GEAS-001-0001", "GEAS-001-0002", "GEAS-001-0004"]
 * → "GEAS-001: 0001–0002, 0004". Peças sem etiqueta entram como "+N sem etiqueta".
 */
export function tagSummary(tags: (string | null)[]): string | null {
  const byFamily = new Map<string, number[]>();
  let untagged = 0;
  for (const tag of tags) {
    const match = tag ? /^GEAS-(\d{3})-(\d{4})$/.exec(tag) : null;
    if (!match) { untagged += 1; continue; }
    byFamily.set(match[1], [...(byFamily.get(match[1]) ?? []), Number(match[2])]);
  }
  const pad = (n: number) => String(n).padStart(4, "0");
  const parts = [...byFamily].sort(([a], [b]) => a.localeCompare(b)).map(([family, numbers]) => {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const ranges: string[] = [];
    for (let i = 0; i < sorted.length; i += 1) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
      ranges.push(j > i ? `${pad(sorted[i])}–${pad(sorted[j])}` : pad(sorted[i]));
      i = j;
    }
    return `GEAS-${family}: ${ranges.join(", ")}`;
  });
  if (untagged > 0) parts.push(`+${untagged} sem etiqueta`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Folha de conferência: as divisões de `scopeId` (ela e as de dentro) ou todas, cada raiz uma parte. Só divisões com
 * material entram (as superiores delas também, como título). Materiais inativos ficam de fora.
 */
export function countSheet(input: {
  paths: LocationPath[]; stock: StockRow[]; materials: Pick<MaterialRow, "id" | "name" | "active" | "minimum_quantity" | "below_minimum">[];
  positions: Map<string, number>; units: UnitTag[]; scopeId?: string;
}): CountSheet {
  const { paths, stock, positions, units, scopeId } = input;
  const materials = new Map(input.materials.filter((m) => m.active).map((m) => [m.id, m]));
  const scope = scopeId ? paths.filter((row) => row.ancestors.includes(scopeId)) : paths.filter((row) => row.active);
  const scopeIds = new Set(scope.map((row) => row.id));
  const tagsAt = new Map<string, (string | null)[]>();
  for (const unit of units) {
    const key = `${unit.location_id}|${unit.material_id}`;
    tagsAt.set(key, [...(tagsAt.get(key) ?? []), unit.tag]);
  }

  const byLocation = new Map<string, CountSheetLine[]>();
  const order = compareLines("posicao", "asc");
  const lines = stock.filter((row) => scopeIds.has(row.location_id) && materials.has(row.material_id))
    .map((row) => ({ ...row, material: materials.get(row.material_id)!, previous: [null, null] as [null, null], position: positions.get(`${row.location_id}|${row.material_id}`) ?? null }))
    .sort(order);
  for (const line of lines) {
    const kinds = Object.values(line.conditions).filter((quantity) => (quantity ?? 0) > 0).length;
    byLocation.set(line.location_id, [...(byLocation.get(line.location_id) ?? []), {
      materialId: line.material_id, name: line.material.name, quantity: line.quantity,
      condition: kinds > 1 ? conditionBreakdown(line.conditions) : line.worst_condition ? CONDITION_LABELS[line.worst_condition] : null,
      expiry: line.next_expiry ? shortDate(line.next_expiry) : null,
      tags: tagSummary(tagsAt.get(`${line.location_id}|${line.material_id}`) ?? []),
    }]);
  }

  const filled = scope.filter((row) => byLocation.has(row.id));
  const visible = new Set(filled.flatMap((row) => row.ancestors));
  const top = scopeId ? scope.find((row) => row.id === scopeId) : undefined;
  const roots = top ? [top] : scope.filter((row) => row.depth === 0);
  const parts = roots.filter((root) => visible.has(root.id)).map((root): CountSheetPart => ({
    locationId: root.id,
    title: root.path,
    blocks: scope.filter((row) => row.ancestors.includes(root.id) && byLocation.has(row.id)).map((row) => ({
      locationId: row.id, title: row.path, depth: row.depth - root.depth, lines: byLocation.get(row.id) ?? [],
    })),
  }));
  return { parts };
}
