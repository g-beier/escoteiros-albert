import { describe, expect, it } from "vitest";
import { expiringSoon, relativeDay, transitions, upcomingDates } from "./alerts";

const person = (over: Partial<{ id: string; name: string; active: boolean; branch: "lobinho" | "escoteiro" | "senior" | "pioneiro" | "adulto"; birth_date: string | null; promise_date: string | null }>) =>
  ({ id: "a", name: "Ana", active: true, branch: "lobinho" as const, birth_date: null, promise_date: null, ...over });

describe("upcomingDates", () => {
  it("pega aniversários de 5 dias atrás a 15 dias à frente, com os anos completados", () => {
    const list = upcomingDates([
      person({ id: "1", name: "Ana", birth_date: "2015-11-24" }),
      person({ id: "2", name: "Bia", birth_date: "2014-11-14", promise_date: "2022-12-04" }),
      person({ id: "3", name: "Caio", birth_date: "2014-12-10" }),
      person({ id: "4", name: "Duda", birth_date: "2014-11-13" }),
    ], "2026-11-19");
    expect(list.map((d) => [d.name, d.kind, d.days, d.years])).toEqual([
      ["Bia", "aniversario", -5, 12], ["Ana", "aniversario", 5, 11], ["Bia", "promessa", 15, 4],
    ]);
  });

  it("atravessa a virada do ano e ignora desligados e a própria data", () => {
    const list = upcomingDates([
      person({ id: "1", birth_date: "2016-01-02" }),
      person({ id: "2", name: "Bia", birth_date: "2016-01-02", active: false }),
      person({ id: "3", name: "Caio", promise_date: "2026-12-30" }),
    ], "2026-12-28");
    expect(list).toEqual([{ associateId: "1", name: "Ana", kind: "aniversario", on: "2027-01-02", days: 5, years: 11 }]);
  });

  it("29 de fevereiro vira 1º de março em ano não bissexto", () => {
    expect(upcomingDates([person({ birth_date: "2016-02-29" })], "2027-02-27")[0]).toMatchObject({ on: "2027-03-01", days: 2, years: 11 });
  });
});

describe("transitions", () => {
  it("lista ativos a partir da idade de transição do ramo, mais velhos primeiro", () => {
    const list = transitions([
      person({ id: "1", name: "Ana", branch: "lobinho", birth_date: "2016-11-19" }),
      person({ id: "2", name: "Bia", branch: "lobinho", birth_date: "2016-11-20" }),
      person({ id: "3", name: "Caio", branch: "escoteiro", birth_date: "2011-01-01" }),
      person({ id: "4", name: "Duda", branch: "adulto", birth_date: "1990-01-01" }),
      person({ id: "5", name: "Edu", branch: "senior", birth_date: "2008-01-01", active: false }),
    ], "2026-11-19");
    expect(list.map((t) => [t.name, t.age, t.label])).toEqual([["Caio", 15, "Escoteiro → Sênior"], ["Ana", 10, "Lobinho → Escoteiro"]]);
  });
});

describe("expiringSoon e relativeDay", () => {
  it("validades de hoje até 30 dias", () => {
    const rows = [{ valid_until: "2026-11-18" }, { valid_until: "2026-11-19" }, { valid_until: "2026-12-19" }, { valid_until: "2026-12-20" }, { valid_until: null }];
    expect(expiringSoon(rows, "2026-11-19").map((r) => r.valid_until)).toEqual(["2026-11-19", "2026-12-19"]);
  });

  it("texto relativo", () => {
    expect([0, 1, -1, 3, -2].map(relativeDay)).toEqual(["hoje", "amanhã", "ontem", "em 3 dias", "há 2 dias"]);
  });
});
