import type { Condition, MovementChannel, MovementKind, Origin, ReviewStatus, Tracking, WriteOffReason } from "./vocabulary";

// Formas dos dados do Inventário que as telas recebem de lib/server/inventory (docs/inventario/modelo.md).

/** Material na lista (inventory_material_rows): totais de todas as divisões. */
export type MaterialRow = {
  id: string; name: string; tracking: Tracking; consumable: boolean; minimum_quantity: number | null; active: boolean;
  quantity: number; next_expiry: string | null; below_minimum: boolean;
  /** Lojinha (021): tem lote à venda com saldo; menor preço entre eles. */
  for_sale: boolean; sale_price_cents: number | null;
};

/** Quantidade e valor de um material numa divisão (inventory_stock_by_location). */
export type StockRow = {
  material_id: string; location_id: string; quantity: number; value_cents: number; next_expiry: string | null;
  /** Pior condição entre lotes e peças da divisão (042); null se nenhum tem condição. */
  worst_condition: Condition | null;
  /** Quantidade por condição ({ bom: 7, ruim: 2 }). */
  conditions: Partial<Record<Condition, number>>;
  /** Faixa do valor unitário (lotes e peças sem valor ficam de fora). */
  min_unit_cents: number | null; max_unit_cents: number | null;
  /** Lojinha (021): quantidade à venda na divisão (null = nada) e faixa de preço dos lotes à venda. */
  sale_quantity?: number | null; min_sale_cents?: number | null; max_sale_cents?: number | null;
};

/** Material no detalhe, com família e totais. */
export type Material = {
  id: string; name: string; tracking: Tracking; consumable: boolean; minimum_quantity: number | null; description: string | null; active: boolean;
  for_sale: boolean; sale_price_cents: number | null;
  family_id: string | null; family_name: string | null; family_code: string | null;
  quantity: number; estimated_value_cents: number; next_expiry: string | null; below_minimum: boolean;
};

/** Campos editáveis do material (formulário). */
export type MaterialDefaults = {
  id: string; name: string; family_id: string | null; tracking: Tracking; consumable: boolean;
  minimum_quantity: number | null; description: string | null; active: boolean;
};

/** Lote com saldo; `path` é preenchido pela tela a partir das divisões. */
export type Lot = {
  id: string; location_id: string; quantity: number; condition: Condition | null;
  unit_value_cents: number | null; expires_on: string | null; acquired_on: string | null; origin: Origin;
  supplier: string | null; invoice: string | null; notes: string | null;
  /** Variação do item ("modelo antigo"): lotes com variação diferente não se juntam. */
  variant: string | null;
  /** Lojinha (021): lote à venda no Financeiro, com preço próprio; lote à venda só junta com lote à venda do mesmo preço. */
  for_sale: boolean; sale_price_cents: number | null;
};
export type LotRow = Lot & { path: string };

export type Unit = {
  id: string; location_id: string; tag: string | null; legacy_code: string | null; description: string | null;
  condition: Condition | null; unit_value_cents: number | null; acquired_on: string | null; origin: Origin;
  supplier: string | null; invoice: string | null; notes: string | null;
  written_off_at: string | null; write_off_reason: WriteOffReason | null;
};
export type UnitRow = Unit & { path: string };

/** Movimento no histórico do material. */
export type Movement = {
  id: number; kind: MovementKind; quantity: number | null; from_location_id: string | null; to_location_id: string | null;
  from_condition: Condition | null; to_condition: Condition | null; write_off_reason: WriteOffReason | null;
  notes: string | null; details: Record<string, unknown>; review_status: ReviewStatus; created_by: string | null; created_at: string;
  review_notes: string | null; reviewed_by: string | null; reviewed_at: string | null; channel: MovementChannel;
  lot_id: string | null; unit_id: string | null;
};

/** Movimento nas listas (Movimentações), com o nome do material. */
export type MovementListRow = Pick<Movement, "id" | "kind" | "quantity" | "from_location_id" | "to_location_id" | "from_condition"
  | "to_condition" | "write_off_reason" | "notes" | "review_status" | "created_at" | "details" | "lot_id" | "unit_id"
  | "created_by" | "review_notes" | "reviewed_by" | "reviewed_at" | "channel"> & {
  material_id: string; material_name: string;
  /** Divisão atual do lote ou da peça (ajuste e edição não gravam divisão no movimento). */
  item_location_id: string | null;
  /** Etiqueta ou código antigo da peça. */
  unit_label: string | null;
};

export type MovementFilters = { review?: ReviewStatus; kind?: MovementKind };

/** Lote vencido ou perto de vencer (Início do Gestão). */
export type ExpiringLot = { id: string; quantity: number; expires_on: string; location_id: string; material_id: string; material_name: string };

/** Material ativo (totais do Início do Gestão). */
export type MaterialSummary = Pick<MaterialRow, "id" | "name" | "quantity" | "minimum_quantity" | "below_minimum"> & { estimated_value_cents: number };

export type FamilyItem = { id: string; name: string; code: string | null; active: boolean; materials: number; tagged: number };

/** Divisão na tela de Configurações: árvore, descrição e quanto material há nela. */
export type LocationItem = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  path: string;
  depth: number;
  ancestors: string[];
  active: boolean;
  /** Lotes com saldo e peças ativas nesta divisão. */
  own: number;
  /** O mesmo, somando as subdivisões. */
  total: number;
};

// Entradas das funções de escrita (já validadas pela action).

export type EntryInput = {
  unitValueCents: number | null; acquiredOn: string | null; origin: Origin | null;
  supplier: string | null; invoice: string | null; notes: string | null;
};

export type MaterialInput = {
  id: string | null; familyId: string | null; name: string; tracking: Tracking; consumable: boolean;
  minimumQuantity: number | null; description: string | null; active: boolean;
};

/** Ações da edição em massa na lista de Materiais (`inventory_bulk`, 011). */
export const BULK_ACTIONS = ["transferir", "condicao", "baixa", "familia", "consumivel", "venda"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
/** Linha selecionada: o material numa divisão (`locationId` nulo = material sem estoque). */
export type BulkTarget = { materialId: string; locationId: string | null };
