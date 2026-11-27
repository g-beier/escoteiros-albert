import { describe, expect, it } from "vitest";
import { QUICK_ACTIONS, QUICK_DONE, isQuickKind } from "@/lib/inventory/quick";
import { quickArgs } from "./quick";

describe("registro rápido", () => {
  it("monta os argumentos de inventory_quick sem os nulos", () => {
    expect(quickArgs({ action: "write_off_lot", lot_id: "l1", quantity: 2, reason: "consumo", notes: null })).toEqual({
      p_action: "write_off_lot",
      p_args: { lot_id: "l1", quantity: 2, reason: "consumo" },
    });
    expect(
      quickArgs({
        action: "new_material",
        group_id: "g",
        name: "Lanterna",
        tracking: "lot",
        consumable: false,
        family_id: null,
        location_id: "loc",
        quantity: 4,
        condition: "bom",
        expires_on: null,
        tag: null,
        notes: "no celular",
      }).p_args,
    ).toEqual({
      group_id: "g",
      name: "Lanterna",
      tracking: "lot",
      consumable: false,
      location_id: "loc",
      quantity: 4,
      condition: "bom",
      notes: "no celular",
    });
  });

  it("toda ação tem confirmação; ajuste só em lote", () => {
    for (const action of QUICK_ACTIONS) expect(QUICK_DONE[action.kind]).toBeTruthy();
    expect(QUICK_ACTIONS.filter((action) => action.lotOnly).map((action) => action.kind)).toEqual(["ajustar"]);
    expect(isQuickKind("novo")).toBe(true);
    expect(isQuickKind("apagar")).toBe(false);
    expect(isQuickKind(undefined)).toBe(false);
  });
});
