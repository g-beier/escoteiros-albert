import { describe, expect, it } from "vitest";
import { addNode, createDraft, deletedTarget, draftChanges, draftPayload, draftRows, dropError, moveNode, removeNode, updateNode, type SavedCategory } from "./category-draft";

const cat = (id: string, code: string | null, name: string, parent_id: string | null, usage = 0): SavedCategory =>
  ({ id, code, name, parent_id, usage, active: true, ledger_code: null, kind: code?.startsWith("1") ? "receita" : code ? "despesa" : null });
const saved = [
  cat("r", "1", "Receitas", null), cat("r1", "1.1", "Mensalidades", "r", 3),
  cat("d", "2", "Despesas", null), cat("p", "2.1", "Programa", "d"), cat("a", "2.1.1", "Acampamento", "p", 2), cat("b", "2.1.2", "Acantonamento", "p"),
  cat("x", "2.2", "Administrativas", "d"),
  cat("old", null, "Alimentação", null, 1),
];
const codes = (draft: ReturnType<typeof createDraft>) => Object.fromEntries(draftRows(draft).map((row) => [row.node.name, row.code]));

describe("category draft", () => {
  it("rebuilds the tree in code order, legacy without code at the end", () => {
    const rows = draftRows(createDraft(saved));
    expect(rows.map((row) => row.code)).toEqual(["1", "1.1", "2", "2.1", "2.1.1", "2.1.2", "2.2", null]);
    expect(rows.find((row) => row.node.key === "p")).toMatchObject({ height: 1, subtreeUsage: 2 });
  });

  it("drags before/after/inside and renumbers", () => {
    let draft = createDraft(saved);
    draft = moveNode(draft, "b", "a", "before");
    expect(codes(draft)).toMatchObject({ Acantonamento: "2.1.1", Acampamento: "2.1.2" });
    draft = moveNode(draft, "x", "p", "before");
    expect(codes(draft)).toMatchObject({ Administrativas: "2.1", Programa: "2.2", Acampamento: "2.2.2" });
    draft = moveNode(draft, "p", "x", "inside");
    expect(codes(draft)).toMatchObject({ Programa: "2.1.1", Acantonamento: "2.1.1.1" });
    draft = moveNode(draft, "a", "b", "before");
    expect(codes(draft)).toMatchObject({ Acampamento: "2.1.1.1", Acantonamento: "2.1.1.2" });
  });

  it("refuses roots, cycles, depth, kind change with splits and dropping beside a root", () => {
    const draft = createDraft(saved);
    expect(dropError(draft, "d", "r", "after")).toMatch(/raiz/);
    expect(dropError(draft, "p", "a", "inside")).toMatch(/dentro dela mesma/);
    expect(dropError(draft, "p", "r", "inside")).toMatch(/Despesas para Receitas/);
    expect(dropError(draft, "b", "r", "inside")).toBeNull();
    expect(dropError(draft, "x", "d", "after")).toMatch(/Solte dentro/);
    let deep = draft;
    let parent = "x";
    for (let i = 0; i < 3; i++) { const [next, key] = addNode(deep, parent); deep = next; parent = key; }
    expect(dropError(deep, "p", parent, "inside")).toMatch(/5 níveis/);
    // antiga sem código entra na árvore
    expect(dropError(draft, "old", "x", "inside")).toBeNull();
  });

  it("deletes a subtree; splits go to the nearest ancestor still in the draft", () => {
    let draft = createDraft(saved);
    draft = removeNode(draft, "a");
    expect(deletedTarget(draft, draft.deleted[0])?.name).toBe("Programa");
    draft = removeNode(draft, "p");
    expect(draft.deleted.map((item) => [item.name, deletedTarget(draft, item)?.name])).toEqual([["Acampamento", "Despesas"], ["Programa", "Despesas"], ["Acantonamento", "Despesas"]]);
    expect(codes(draft)).toMatchObject({ Administrativas: "2.1" });
    expect(removeNode(draft, "d")).toBe(draft);
  });

  it("summarizes changes and builds the save payload with temporary keys", () => {
    const initial = createDraft(saved);
    let draft = updateNode(initial, "b", { name: "Acantonamento de Grupo" });
    const [withNew, key] = addNode(draft, "x", "Telefone");
    draft = removeNode(moveNode(withNew, "x", "p", "before"), "a");
    expect(draftChanges(draft, initial)).toMatchObject({ created: 1, renamed: 1, deleted: 1, movedSplits: 2 });
    const payload = draftPayload(draft);
    expect(payload.deleted).toEqual([{ id: "a", target: "p" }]);
    expect(payload.nodes.find((node) => node.key === key)).toMatchObject({ id: null, parent: "x", position: 0, name: "Telefone" });
    expect(payload.nodes.find((node) => node.key === "x")).toMatchObject({ parent: "d", position: 0 });
    expect(payload.nodes.some((node) => node.key === "d" || node.key === "old")).toBe(false);
  });
});
