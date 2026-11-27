import { EXPIRY_WARNING_DAYS, daysUntil } from "@/lib/inventory/vocabulary";
import type { Db } from "@/lib/server/db";
import { expiringLots, summary } from "./materials";
import { pendingCount } from "./movements";

export type InventoryOverview = {
  materials: number;
  estimatedValueCents: number;
  belowMinimum: number;
  expired: number;
  expiringSoon: number;
  /** Só para quem revisa (gestor); nulo para os demais. */
  pendingReview: number | null;
};

/** Números do Inventário para o Início geral (os mesmos do Resumo do módulo). */
export async function overview(db: Db, groupId: string, today: string, canManage: boolean): Promise<InventoryOverview> {
  const until = new Date(Date.parse(`${today}T12:00:00Z`) + EXPIRY_WARNING_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [materials, lots, pending] = await Promise.all([
    summary(db, groupId),
    expiringLots(db, groupId, until),
    canManage ? pendingCount(db, groupId) : Promise.resolve(null),
  ]);
  const expired = lots.filter((lot) => daysUntil(lot.expires_on) < 0).length;
  return {
    materials: materials.length,
    estimatedValueCents: materials.reduce((sum, m) => sum + Number(m.estimated_value_cents ?? 0), 0),
    belowMinimum: materials.filter((m) => m.below_minimum).length,
    expired,
    expiringSoon: lots.length - expired,
    pendingReview: pending,
  };
}
