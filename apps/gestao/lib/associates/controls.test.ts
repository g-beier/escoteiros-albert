import { describe, expect, it } from "vitest";
import {
  activeFunctionKinds, addMonths, associateAudiences, audienceFromSlug, audiencesSummary, cellValue, columnTotals, filterBlocks, pendingCount, relativesOnce, scouterCounts, scouterSections, directorateFromSlug, directorateSlug, effectiveStatus,
  hiddenDirectorates, hiddenParam, isPending, matrixCell, matrixGroups, pendingByDirectorate, rowHasPending, shortDate, statusMap, suggestedValidUntil, validityLabel,
  type AssociateFunction, type ControlAudience, type ControlItem, type ControlStatusRow, type MatrixPerson,
} from "./controls";

const item = (id: string, audiences: ControlAudience[], extra: Partial<ControlItem> = {}): ControlItem => ({
  id, name: id, kind: "documento", value_kind: "situacao", directorate: "administrativa", audiences: audiences.map((audience) => ({ audience, initial_status: "pendente" })), validity_months: null, remove_on_leave: false, active: true, position: 0, ...extra,
});
const status = (associate_id: string, item_id: string, effective_status: ControlStatusRow["status"]): ControlStatusRow => ({
  associate_id, relative_id: null, item_id, status: effective_status, effective_status, status_date: null, valid_until: null, value_year: null, note: null, updated_at: "2026-01-01",
});
const fn = (associate_id: string, kind: AssociateFunction["kind"], started_on: string | null, ended_on: string | null = null): AssociateFunction =>
  ({ id: `${associate_id}-${kind}`, associate_id, kind, title: null, started_on, ended_on, section_id: null, section: null });

describe("situação e validade", () => {
  it("ok vencido vira desatualizado; o resto fica", () => {
    expect(effectiveStatus("ok", "2026-01-01", "2026-01-02")).toBe("desatualizado");
    expect(effectiveStatus("ok", "2026-01-02", "2026-01-02")).toBe("ok");
    expect(effectiveStatus("ok", null, "2026-01-02")).toBe("ok");
    expect(effectiveStatus("pendente", "2020-01-01", "2026-01-02")).toBe("pendente");
  });
  it("ok com ano antes do ano atual vira desatualizado", () => {
    expect(effectiveStatus("ok", null, "2026-11-19", 2025)).toBe("desatualizado");
    expect(effectiveStatus("ok", null, "2026-11-19", 2026)).toBe("ok");
    expect(effectiveStatus("ok", null, "2026-11-19", 2027)).toBe("ok");
    expect(effectiveStatus("pendente", null, "2026-11-19", 2020)).toBe("pendente");
  });
  it("célula de item que mostra ano ou data: o valor; sem valor ou item de situação: nulo", () => {
    const row = { ...status("a", "x", "ok"), value_year: 2026, valid_until: "2027-03-31" };
    expect(shortDate("2027-03-31")).toBe("31/03/27");
    expect(cellValue(item("x", ["jovem"], { value_kind: "ano" }), row)).toBe("2026");
    expect(cellValue(item("x", ["jovem"], { value_kind: "data" }), row)).toBe("31/03/27");
    expect(cellValue(item("x", ["jovem"]), row)).toBeNull();
    expect(cellValue(item("x", ["jovem"], { value_kind: "ano" }), { ...row, value_year: null })).toBeNull();
    expect(cellValue(item("x", ["jovem"], { value_kind: "data" }), { ...row, valid_until: null })).toBeNull();
    expect(cellValue(item("x", ["jovem"], { value_kind: "data" }), undefined)).toBeNull();
  });
  it("validade sugerida soma os meses do item à data (ou hoje), parando no fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(suggestedValidUntil("2026-03-10", 12, "2026-11-19")).toBe("2027-03-10");
    expect(suggestedValidUntil(null, 24, "2026-11-19")).toBe("2028-11-19");
    expect(suggestedValidUntil("2026-03-10", null, "2026-11-19")).toBeNull();
    expect(validityLabel(12)).toBe("1 ano");
    expect(validityLabel(24)).toBe("2 anos");
    expect(validityLabel(6)).toBe("6 meses");
    expect(validityLabel(null)).toBe("Não vence");
  });
  it("pendência: pendente, desatualizado, a verificar, a remover e sem registro", () => {
    expect(["pendente", "desatualizado", "a_verificar", "a_remover", "sem_registro"].every((s) => isPending(s as never))).toBe(true);
    expect(["ok", "convidado", "nao_se_aplica", "removido"].some((s) => isPending(s as never))).toBe(false);
  });
  it("diretoria na URL", () => {
    expect(directorateSlug("metodos_educativos")).toBe("metodos-educativos");
    expect(directorateFromSlug("metodos-educativos")).toBe("metodos_educativos");
    expect(directorateFromSlug("outra")).toBeNull();
    expect(hiddenDirectorates("comunicacao, financeira,outra")).toEqual(["financeira", "comunicacao"]);
    expect(hiddenDirectorates(undefined)).toEqual([]);
    expect(hiddenParam(["comunicacao", "metodos_educativos"])).toBe("metodos-educativos,comunicacao");
  });
});

describe("público e funções", () => {
  it("público só pelo ramo: jovem ou adulto", () => {
    expect(associateAudiences("escoteiro")).toEqual(["jovem"]);
    expect(associateAudiences("pioneiro")).toEqual(["jovem"]);
    expect(associateAudiences("adulto")).toEqual(["adulto"]);
  });
  it("público na URL, com os valores antigos", () => {
    expect(audienceFromSlug("adultos")).toBe("adulto");
    expect(audienceFromSlug("escotista")).toBe("adulto");
    expect(audienceFromSlug("dirigente")).toBe("adulto");
    expect(audienceFromSlug("jovens")).toBe("jovem");
    expect(audienceFromSlug(undefined)).toBe("jovem");
  });
  it("funções ativas dividem a lista de adultos", () => {
    const kinds = activeFunctionKinds([fn("a", "escotista", "2025-01-01"), fn("a", "dirigente", "2024-01-01", "2025-01-01"), fn("b", "dirigente", "2020-01-01", "2026-11-19")], "2026-11-19");
    expect([...(kinds.get("a") ?? [])]).toEqual(["escotista"]);
    expect(kinds.has("b")).toBe(false);
  });
});

describe("matriz pessoa × item", () => {
  const items = [item("ficha", ["jovem", "adulto"]), item("atv", ["adulto"], { directorate: "metodos_educativos" })];
  const ana: MatrixPerson = { id: "ana", name: "Ana", active: true, audiences: ["jovem"] };
  const eva: MatrixPerson = { id: "eva", name: "Eva", active: true, audiences: ["adulto"] };
  const leo: MatrixPerson = { id: "leo", name: "Léo", active: false, audiences: ["jovem"] };
  const rows = statusMap([status("ana", "ficha", "ok"), status("eva", "ficha", "pendente"), status("leo", "ficha", "a_remover")]);

  it("célula: sem registro, fora do público e desligado", () => {
    expect(matrixCell(ana, items[0], rows)).toMatchObject({ status: "ok", applies: true });
    expect(matrixCell(ana, items[1], rows)).toMatchObject({ status: "sem_registro", applies: false });
    expect(matrixCell(eva, items[1], rows)).toMatchObject({ status: "sem_registro", applies: true });
    expect(matrixCell(leo, items[0], rows)).toMatchObject({ status: "a_remover" });
    expect(matrixCell(leo, items[1], rows)).toMatchObject({ applies: false });
  });
  it("célula fora do público ignora situação antiga, menos \"a remover\"", () => {
    const stale = statusMap([status("ana", "atv", "pendente"), status("eva", "atv", "a_remover")]);
    const jovem: MatrixPerson = { ...eva, audiences: ["jovem"] };
    expect(matrixCell(ana, items[1], stale)).toEqual({ status: "sem_registro", applies: false });
    expect(rowHasPending(ana, [items[1]], stale)).toBe(false);
    expect(matrixCell(jovem, items[1], stale)).toMatchObject({ status: "a_remover", applies: false });
  });
  it("só pendências, rodapé e contagem por diretoria", () => {
    expect(rowHasPending(ana, items, rows)).toBe(false);
    expect(rowHasPending(eva, items, rows)).toBe(true);
    expect(rowHasPending(leo, items, rows)).toBe(true);
    expect(columnTotals([ana, eva], items, rows)).toEqual({ ficha: { ok: 1, total: 2 }, atv: { ok: 0, total: 1 } });
    expect(pendingByDirectorate([ana, eva], items, rows)).toEqual({ administrativa: 1, metodos_educativos: 1, financeira: 0, comunicacao: 0 });
  });
});

describe("matriz única", () => {
  it("diretorias na ordem, itens do público por posição, ocultas e vazias fora", () => {
    const items = [
      item("site", ["adulto"], { directorate: "comunicacao", position: 2 }),
      item("insta", ["jovem", "adulto"], { directorate: "comunicacao", position: 1 }),
      item("ficha", ["jovem", "adulto"], { directorate: "metodos_educativos", position: 1 }),
      item("paxtu", ["jovem", "adulto"], { position: 1 }),
      item("velho", ["adulto"], { position: 2, active: false }),
    ];
    const ids = (groups: ReturnType<typeof matrixGroups>) => groups.map((g) => `${g.directorate}:${g.items.map((i) => i.id).join("+")}`);
    expect(ids(matrixGroups(items, "adulto"))).toEqual(["metodos_educativos:ficha", "administrativa:paxtu", "comunicacao:insta+site"]);
    expect(ids(matrixGroups(items, "jovem", ["administrativa"]))).toEqual(["metodos_educativos:ficha", "comunicacao:insta"]);
  });
});

describe("responsáveis na matriz e valor inicial", () => {
  const items = [
    item("paxtu", ["jovem", "adulto", "responsavel"]),
    item("ficha", ["adulto", "responsavel"], { directorate: "metodos_educativos" }),
    item("medica", ["jovem"], { directorate: "metodos_educativos" }),
  ];
  const relStatus = (relative_id: string, item_id: string, s: ControlStatusRow["status"]): ControlStatusRow =>
    ({ ...status("", item_id, s), associate_id: null, relative_id });
  const bia: MatrixPerson = { id: "bia", name: "Bia", active: true, audiences: ["jovem"] };
  const caio: MatrixPerson = { id: "caio", name: "Caio", active: true, audiences: ["jovem"] };
  // mesmo id de associado e de responsável não se confundem
  const mae: MatrixPerson = { id: "bia", name: "Rosa", active: true, audiences: ["responsavel"], relative: true };
  const rows = statusMap([status("bia", "paxtu", "ok"), status("bia", "medica", "ok"), relStatus("bia", "paxtu", "pendente"), relStatus("bia", "ficha", "ok"), status("caio", "paxtu", "ok"), status("caio", "medica", "ok")]);

  it("aba Jovens: itens de jovem ou de responsável", () => {
    const ids = (tab: "jovem" | "adulto") => matrixGroups(items, tab).flatMap((g) => g.items.map((i) => i.id));
    expect(ids("jovem")).toEqual(["ficha", "medica", "paxtu"]);
    expect(ids("adulto")).toEqual(["ficha", "paxtu"]);
  });
  it("célula do responsável usa a situação dele; fora do público é cinza", () => {
    expect(matrixCell(mae, items[0], rows)).toMatchObject({ status: "pendente", applies: true });
    expect(matrixCell(bia, items[0], rows)).toMatchObject({ status: "ok", applies: true });
    expect(matrixCell(mae, items[2], rows)).toMatchObject({ applies: false });
    expect(matrixCell(bia, items[1], rows)).toMatchObject({ applies: false });
  });
  it("busca e só pendências pelo bloco; responsável compartilhado conta uma vez", () => {
    const blocks = [{ person: bia, relatives: [mae] }, { person: caio, relatives: [mae] }, { person: { ...caio, id: "duda", name: "Duda" }, relatives: [] }];
    const names = (list: ReturnType<typeof filterBlocks>) => list.map((b) => b.person.name);
    expect(names(filterBlocks(blocks, items, rows, { matches: (n) => n === "Rosa", pendingOnly: false }))).toEqual(["Bia", "Caio"]);
    expect(names(filterBlocks(blocks, items, rows, { matches: () => true, pendingOnly: true }))).toEqual(["Bia", "Caio", "Duda"]);
    expect(names(filterBlocks(blocks.slice(0, 2), items, rows, { matches: (n) => n === "Caio", pendingOnly: true }))).toEqual(["Caio"]);
    expect(pendingCount([bia, mae, caio, mae], items, rows)).toBe(1);
  });
  it("resumo dos públicos com o valor inicial", () => {
    expect(audiencesSummary([{ audience: "responsavel", initial_status: null }, { audience: "jovem", initial_status: "pendente" }])).toBe("Jovem: Pend. · Responsável: —");
  });
});

describe("escotistas nas seções", () => {
  const scouter = (associate_id: string, section_id: string, ended_on: string | null = null): AssociateFunction =>
    ({ id: `${associate_id}-${section_id}`, associate_id, kind: "escotista", title: null, started_on: "2024-01-01", ended_on, section_id, section: section_id.toUpperCase() });
  const functions = [scouter("a", "s1"), scouter("a", "s1"), scouter("b", "s1"), scouter("c", "s2", "2025-01-01"), scouter("d", "s2"), fn("e", "dirigente", null)];

  it("conta pessoas ativas com função ativa, uma vez por seção", () => {
    expect(scouterCounts(functions, new Set(["a", "b", "c", "e"]), "2026-11-19")).toEqual({ s1: 2 });
  });
  it("seções de cada escotista", () => {
    expect(scouterSections([...functions, scouter("a", "s0")], "2026-11-19")).toEqual(new Map([["a", ["S0", "S1"]], ["b", ["S1"]], ["d", ["S2"]]]));
  });
});

describe("relativesOnce", () => {
  const youth = (id: string): MatrixPerson => ({ id, name: id, active: true, audiences: ["jovem"] });
  const relative = (id: string): MatrixPerson => ({ id, name: id, active: true, audiences: ["responsavel"], relative: true });

  it("responsável compartilhado só sob o primeiro irmão da lista", () => {
    const blocks = relativesOnce([
      { person: youth("ana"), relatives: [relative("mae"), relative("pai")] },
      { person: youth("bia"), relatives: [relative("mae")] },
      { person: youth("caio"), relatives: [relative("pai"), relative("avo")] },
    ]);
    expect(blocks.map((b) => [b.person.id, b.relatives.map((r) => r.id)])).toEqual([["ana", ["mae", "pai"]], ["bia", []], ["caio", ["avo"]]]);
  });
  it("família recomposta: fica sob o jovem casa (legal), não sob o primeiro da lista", () => {
    // Luana: "outro" da Isa (primeira da lista) e mãe legal da Sol
    const blocks = [
      { person: youth("isa"), relatives: [relative("roberto"), relative("luana")] },
      { person: youth("sol"), relatives: [relative("luana"), relative("roberto")] },
    ];
    const homes = new Map([["luana", "sol"], ["roberto", "isa"]]);
    expect(relativesOnce(blocks, homes).map((b) => [b.person.id, b.relatives.map((r) => r.id)])).toEqual([["isa", ["roberto"]], ["sol", ["luana"]]]);
    // casa fora dos blocos mostrados (filtro): fica no primeiro mostrado
    expect(relativesOnce(blocks.slice(0, 1), homes)[0].relatives.map((r) => r.id)).toEqual(["roberto", "luana"]);
  });
  it("associado com o mesmo id do responsável não conta", () => {
    expect(relativesOnce([{ person: youth("x"), relatives: [] }, { person: youth("y"), relatives: [relative("x")] }])[1].relatives).toHaveLength(1);
  });
});
