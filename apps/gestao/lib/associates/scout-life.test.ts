import { describe, expect, it } from "vitest";
import type { AssociateMove, AssociateMovement } from "./model";
import {
  addDays, addYears, barSegments, starBranch, countedSegments, lifeMismatch, lifeSummary, missingSuggestions, starDates, suggestPeriods, timeline,
  type LifePeriod,
} from "./scout-life";

const period = (branch: LifePeriod["branch"], started_on: string, ended_on: string | null = null, id = `${branch}-${started_on}`): LifePeriod =>
  ({ id, branch, started_on, ended_on, place: null, source: "manual" });
const movement = (kind: "entrada" | "saida", movement_date: string): AssociateMovement =>
  ({ id: `${kind}-${movement_date}`, kind, movement_date, reason: null, created_at: `${movement_date}T00:00:00Z` });
const move = (move_date: string, from_branch: AssociateMove["from_branch"], to_branch: AssociateMove["to_branch"]): AssociateMove =>
  ({ id: `m-${move_date}`, move_date, from_branch, to_branch, from_section_id: null, to_section_id: null, to_patrol_id: null, created_at: "" });

describe("addYears", () => {
  it("29/2 vira 28/2 em ano comum", () => {
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
  });
});

describe("contagem", () => {
  it("começa na promessa: o que vem antes não conta", () => {
    expect(countedSegments([period("lobinho", "2020-03-01")], "2020-06-10")).toEqual([{ branch: "lobinho", start: "2020-06-10", end: null }]);
    expect(countedSegments([period("lobinho", "2018-03-01", "2019-01-01"), period("lobinho", "2020-03-01")], "2020-06-10")).toHaveLength(1);
    expect(countedSegments([period("lobinho", "2020-03-01")], null)).toEqual([]);
  });

  it("sem lacunas, a estrela cai no aniversário da promessa", () => {
    const segments = countedSegments([period("lobinho", "2022-10-02", "2024-12-08"), period("escoteiro", "2024-12-08")], "2022-10-02");
    expect(starDates(segments, "2026-11-24")).toEqual(["2023-10-02", "2024-10-02", "2025-10-02", "2026-10-02", "2027-10-02"]);
  });

  it("a lacuna empurra as estrelas seguintes", () => {
    // 2 anos, lacuna de 1 ano (366 dias: 2012 é bissexto), volta; a 2ª cai no último dia do período.
    const segments = countedSegments([period("lobinho", "2010-01-10", "2012-01-10"), period("adulto", "2013-01-10")], "2010-01-10");
    expect(starDates(segments, "2015-06-01")).toEqual(["2011-01-10", "2012-01-10", "2014-01-11", "2015-01-11", "2016-01-11"]);
  });

  it("sem período vigente, não projeta a próxima", () => {
    const segments = countedSegments([period("senior", "2020-05-01", "2022-08-01")], "2020-05-01");
    expect(starDates(segments, "2026-01-01")).toEqual(["2021-05-01", "2022-05-01"]);
  });
});

describe("lifeSummary", () => {
  const today = "2026-11-24";
  const periods = [period("lobinho", "2018-12-09", "2022-03-26"), period("escoteiro", "2022-03-26", "2025-12-06"), period("senior", "2025-12-06")];

  it("anos, estrelas por ramo, próxima e lacunas", () => {
    const summary = lifeSummary({ periods, promiseDate: "2018-12-09", today });
    expect(summary.years).toBe(7);
    expect(summary.stars.map((s) => s.branch)).toEqual(["lobinho", "lobinho", "lobinho", "escoteiro", "escoteiro", "escoteiro", "escoteiro", "senior"]);
    expect(summary.byBranch).toEqual({ lobinho: 3, escoteiro: 4 });
    expect(summary.next).toMatchObject({ n: 8, dueOn: "2026-12-09", status: "pendente" });
    expect(summary.hasGaps).toBe(false);
    expect(summary.open).toBe(true);
  });

  it("ramo da estrela: o de mais atividade no ano, sem janeiro e fevereiro", () => {
    // Ano 2025-03-01 → 2026-03-01: Lobinho até 2025-08-31 (6 meses), Escoteiro depois (6 meses, 2 deles de férias).
    const summary = lifeSummary({ periods: [period("lobinho", "2024-03-01", "2025-09-01"), period("escoteiro", "2025-09-01")], promiseDate: "2024-03-01", today: "2026-03-05" });
    expect(summary.stars[1]).toMatchObject({ n: 2, dueOn: "2026-03-01", computedBranch: "lobinho" });
  });

  it("conta de férias por intervalos bate com a contagem dia a dia", () => {
    const segments = countedSegments([period("lobinho", "1998-11-20", "2001-02-10"), period("escoteiro", "2001-02-10", "2003-07-01"), period("senior", "2004-01-15")], "1998-11-20");
    const naive = (from: string, to: string) => {
      const days = new Map<string, number>();
      for (const s of segments) for (let d = s.start > from ? s.start : from; d < (s.end && s.end < to ? s.end : to); d = addDays(d, 1)) {
        if (![1, 2].includes(Number(d.slice(5, 7)))) days.set(s.branch, (days.get(s.branch) ?? 0) + 1);
      }
      return [...days].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    for (const [from, to] of [["1999-11-20", "2000-11-20"], ["2000-11-20", "2001-11-20"], ["2002-11-20", "2004-05-20"], ["2003-03-01", "2004-03-01"]]) {
      expect(starBranch(segments, from, to)).toBe(naive(from, to));
    }
  });

  it("aviso de entrega 15 dias antes e até a entrega; entregar quita as anteriores", () => {
    const pending = lifeSummary({ periods, promiseDate: "2018-12-09", today, records: [{ star: 5, branch: null, delivered_on: "2023-12-20" }] });
    expect(pending.pending?.n).toBe(7); // a atrasada vem antes da que chega em 15 dias
    expect(pending.stars.filter((s) => s.status === "entregue").map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(pending.stars.filter((s) => s.status === "pendente").map((s) => s.n)).toEqual([6, 7, 8]);
    const delivered = lifeSummary({ periods, promiseDate: "2018-12-09", today, records: [{ star: 7, branch: null, delivered_on: "2026-11-20" }] });
    expect(delivered.pending?.n).toBe(8); // em 15 dias
    expect(lifeSummary({ periods, promiseDate: "2018-12-09", today, records: [{ star: 8, branch: null, delivered_on: "2026-11-20" }] }).pending).toBeNull();
    const early = lifeSummary({ periods, promiseDate: "2018-12-09", today: "2026-11-20", records: [{ star: 7, branch: null, delivered_on: "2025-12-10" }] });
    expect(early.pending).toBeNull(); // a 8ª ainda está a mais de 15 dias
  });

  it("ramo corrigido vale na contagem por ramo", () => {
    const summary = lifeSummary({ periods, promiseDate: "2018-12-09", today, records: [{ star: 4, branch: "lobinho", delivered_on: null }] });
    expect(summary.stars[3]).toMatchObject({ branch: "lobinho", computedBranch: "escoteiro", overridden: true });
    expect(summary.byBranch).toEqual({ lobinho: 4, escoteiro: 3 });
  });

  it("lacuna depois da promessa", () => {
    const summary = lifeSummary({ periods: [period("senior", "2023-07-01", "2025-10-01"), period("senior", "2026-04-01")], promiseDate: "2023-07-01", today });
    expect(summary.hasGaps).toBe(true);
    expect(summary.years).toBe(2);
  });

  it("sem promessa não conta", () => {
    const summary = lifeSummary({ periods, promiseDate: null, today });
    expect(summary).toMatchObject({ years: 0, stars: [], countFrom: null });
  });
});

describe("períodos não contabilizados (Regra 173)", () => {
  const x = (started_on: string, ended_on: string) => ({ id: started_on, started_on, ended_on, reason: "licenca" as const, note: null });
  it("viram lacuna: partem o trecho e empurram as estrelas", () => {
    const periods = [period("escoteiro", "2020-03-01")];
    const free = lifeSummary({ periods, promiseDate: "2020-03-01", today: "2026-11-24" });
    const paused = lifeSummary({ periods, promiseDate: "2020-03-01", today: "2026-11-24", exclusions: [x("2022-05-01", "2022-09-01")] });
    expect(free.stars.map((s) => s.dueOn).slice(0, 3)).toEqual(["2021-03-01", "2022-03-01", "2023-03-01"]);
    expect(paused.stars.map((s) => s.dueOn).slice(0, 3)).toEqual(["2021-03-01", "2022-03-01", "2023-07-02"]); // 123 dias depois
    expect(paused.hasGaps).toBe(true);
    expect(countedSegments(periods, "2020-03-01", [x("2022-05-01", "2022-09-01")])).toEqual([
      { branch: "escoteiro", start: "2020-03-01", end: "2022-05-01" }, { branch: "escoteiro", start: "2022-09-01", end: null },
    ]);
  });
  it("cobrindo o trecho inteiro, ou fora dele", () => {
    const periods = [period("lobinho", "2018-01-01", "2019-01-01"), period("escoteiro", "2019-01-01", "2020-01-01")];
    expect(countedSegments(periods, "2018-01-01", [x("2017-06-01", "2019-01-01")])).toEqual([{ branch: "escoteiro", start: "2019-01-01", end: "2020-01-01" }]);
    expect(countedSegments(periods, "2018-01-01", [x("2021-01-01", "2022-01-01")])).toHaveLength(2);
  });
  it("na barra, o trecho fica marcado", () => {
    const bar = barSegments([period("escoteiro", "2020-01-01", "2024-01-01")], "2020-01-01", "2020-01-01", "2024-01-01", undefined, [x("2021-01-01", "2022-01-01")]);
    expect(bar.map((b) => b.excluded)).toEqual([null, "licenca", null]);
  });
});

describe("lifeMismatch", () => {
  const today = "2026-11-24";
  it("cadastro e vigente iguais", () => {
    expect(lifeMismatch({ associate: { branch: "escoteiro", active: true }, periods: [period("escoteiro", "2024-01-01")], functions: [], moves: [], movements: [], today })).toBeNull();
  });
  it("trocar na data da passagem", () => {
    const result = lifeMismatch({ associate: { branch: "senior", active: true }, periods: [period("escoteiro", "2024-01-01")], functions: [],
      moves: [move("2026-03-10", "escoteiro", "senior")], movements: [], today });
    expect(result).toMatchObject({ kind: "trocar", expected: "senior", date: "2026-03-10" });
  });
  it("encerrar na data do desligamento", () => {
    const result = lifeMismatch({ associate: { branch: "escoteiro", active: false }, periods: [period("escoteiro", "2024-01-01")], functions: [],
      moves: [], movements: [movement("entrada", "2024-01-01"), movement("saida", "2026-06-01")], today });
    expect(result).toMatchObject({ kind: "encerrar", date: "2026-06-01" });
  });
  it("adulto: só escotista ou dirigente conta", () => {
    const base = { associate: { branch: "adulto" as const, active: true }, periods: [], moves: [], movements: [], today };
    expect(lifeMismatch({ ...base, functions: [{ kind: "honorifico", started_on: "2020-01-01", ended_on: null }] })).toBeNull();
    expect(lifeMismatch({ ...base, functions: [{ kind: "escotista", started_on: "2021-02-01", ended_on: null }] }))
      .toMatchObject({ kind: "abrir", expected: "adulto", date: "2021-02-01" });
  });
});

describe("sugestão do cadastro", () => {
  const today = "2026-11-24";
  it("divide as entradas pelas passagens e corta o adulto nas funções que contam", () => {
    const suggested = suggestPeriods({
      branch: "adulto", today,
      movements: [movement("entrada", "2010-03-01"), movement("saida", "2012-02-01"), movement("entrada", "2014-03-01")],
      moves: [move("2011-03-01", "lobinho", "escoteiro"), move("2015-05-01", "escoteiro", "senior"), move("2018-01-01", "pioneiro", "adulto"), move("2016-01-01", "senior", "pioneiro")],
      functions: [{ kind: "colaborador", started_on: "2018-01-01", ended_on: null }, { kind: "escotista", started_on: "2019-04-01", ended_on: null }],
    });
    expect(suggested).toEqual([
      { branch: "lobinho", started_on: "2010-03-01", ended_on: "2011-03-01" },
      { branch: "escoteiro", started_on: "2011-03-01", ended_on: "2012-02-01" },
      { branch: "escoteiro", started_on: "2014-03-01", ended_on: "2015-05-01" },
      { branch: "senior", started_on: "2015-05-01", ended_on: "2016-01-01" },
      { branch: "pioneiro", started_on: "2016-01-01", ended_on: "2018-01-01" },
      { branch: "adulto", started_on: "2019-04-01", ended_on: null },
    ]);
  });
  it("só completa o que vem antes do primeiro período registrado", () => {
    const suggested = [{ branch: "lobinho" as const, started_on: "2010-03-01", ended_on: "2013-03-01" }, { branch: "escoteiro" as const, started_on: "2013-03-01", ended_on: null }];
    expect(missingSuggestions(suggested, [])).toEqual(suggested);
    expect(missingSuggestions(suggested, [period("escoteiro", "2012-01-01")])).toEqual([{ branch: "lobinho", started_on: "2010-03-01", ended_on: "2012-01-01" }]);
  });
});

describe("linha do tempo", () => {
  it("um bloco por ano, sem repetir início de período na passagem", () => {
    const periods = [period("lobinho", "2023-03-01", "2025-02-15"), period("escoteiro", "2025-02-15")];
    const summary = lifeSummary({ periods, promiseDate: "2023-05-01", today: "2026-11-24" });
    const years = timeline({
      periods, promiseDate: "2023-05-01", moves: [move("2025-02-15", "lobinho", "escoteiro")], movements: [movement("entrada", "2023-03-01")],
      stars: summary.stars, events: [{ id: "e1", event_date: "2024-10-16", title: "Cruzeiro do Sul", description: null }], today: "2026-11-24",
    });
    expect(years.map((y) => [y.year, y.branch])).toEqual([[2023, "lobinho"], [2024, "lobinho"], [2025, "escoteiro"], [2026, "escoteiro"]]);
    expect(years[0].items.map((i) => i.kind)).toEqual(["entrada", "promessa"]);
    expect(years[1].items.map((i) => i.title)).toEqual(["1ª estrela de atividade", "Cruzeiro do Sul"]);
    expect(years[2].items.map((i) => i.kind)).toEqual(["passagem", "estrela"]);
  });
});

describe("barra", () => {
  it("separa o trecho antes da promessa", () => {
    const segments = barSegments([period("lobinho", "2020-01-01", "2022-01-01")], "2021-01-01", "2020-01-01", "2024-01-01");
    expect(segments.map((s) => [s.beforePromise, Number(s.from.toFixed(2)), Number(s.to.toFixed(2))])).toEqual([[true, 0, 0.25], [false, 0.25, 0.5]]);
  });
  it("depois de hoje é projeção", () => {
    const segments = barSegments([period("adulto", "2020-01-01")], "2020-01-01", "2020-01-01", "2024-01-01", "2023-01-01");
    expect(segments.map((s) => [s.future, Number(s.from.toFixed(2)), Number(s.to.toFixed(2))])).toEqual([[false, 0, 0.75], [true, 0.75, 1]]);
  });
});
