import { describe, expect, it } from "vitest";
import {
  activeRelativeIds, kinshipNoteError, kinshipText, linkableRelatives, linksByAssociate, relativeRows, roleText, siblingText, type RelativeLink,
} from "./relatives";

const link = (associate_id: string, relative_id: string, extra: Partial<RelativeLink> = {}): RelativeLink => ({
  id: `${associate_id}-${relative_id}`, associate_id, relative_id, relative_name: relative_id, relative_associate_id: null,
  kinship: "mae", kinship_note: null, legal: true, financial: false, position: 0, sibling_count: 0, ...extra,
});

describe("responsáveis", () => {
  it("parentesco e papéis em texto", () => {
    expect(kinshipText(link("a", "r"))).toBe("Mãe");
    expect(kinshipText(link("a", "r", { kinship: "outro", kinship_note: "Irmã" }))).toBe("Irmã");
    expect(kinshipText(link("a", "r", { kinship: "outro" }))).toBe("Outro");
    expect(roleText({ legal: true, financial: true })).toBe("responsável legal · financeiro");
    expect(roleText({ legal: false, financial: false })).toBe("");
    expect(siblingText(1)).toBe("compartilhado com 1 irmão");
    expect(siblingText(2)).toBe("compartilhado com 2 irmãos");
  });
  it("descrição obrigatória só para outro", () => {
    expect(kinshipNoteError("mae", null)).toBeNull();
    expect(kinshipNoteError("outro", null)).toMatch(/Descreva/);
    expect(kinshipNoteError("outro", "x".repeat(41))).toMatch(/40/);
    expect(kinshipNoteError("outro", "Avó")).toBeNull();
  });
  it("vínculos por jovem, em ordem; linhas da matriz; ativos pelo jovem", () => {
    const links = [link("a", "tio", { kinship: "outro", kinship_note: "Tio" }), link("a", "pai", { kinship: "pai" }), link("a", "mae"), link("b", "mae")];
    const by = linksByAssociate(links);
    expect(by.get("a")!.map((l) => l.relative_id)).toEqual(["mae", "pai", "tio"]);
    const active = activeRelativeIds(links, new Set(["b"]));
    expect([...active]).toEqual(["mae"]);
    expect(relativeRows(by.get("a")!, active)).toEqual([
      { id: "mae", name: "mae", relative: true, audiences: ["responsavel"], active: true, detail: "Mãe" },
      { id: "pai", name: "pai", relative: true, audiences: ["responsavel"], active: false, detail: "Pai" },
      { id: "tio", name: "tio", relative: true, audiences: ["responsavel"], active: false, detail: "Tio" },
    ]);
  });
  it("responsável que também é associado ativo sai da matriz; desligado, volta", () => {
    const links = [link("a", "mae", { relative_associate_id: "adulta" }), link("a", "pai", { kinship: "pai" })];
    const ids = (active: Set<string>) => relativeRows(links, new Set(["mae", "pai"]), active).map((r) => r.id);
    expect(ids(new Set(["a", "adulta"]))).toEqual(["pai"]);
    expect(ids(new Set(["a"]))).toEqual(["mae", "pai"]);
  });
  it("vincular existente: só os que não estão ligados ao jovem, por nome", () => {
    const relatives = [{ id: "2", name: "Zélia", associate_id: null, notes: null }, { id: "1", name: "Ana", associate_id: null, notes: null }, { id: "3", name: "Bruno", associate_id: null, notes: null }];
    expect(linkableRelatives(relatives, [{ relative_id: "3" }]).map((r) => r.name)).toEqual(["Ana", "Zélia"]);
  });
});
