import { describe, expect, it } from "vitest";
import type { ScoutBranch } from "./model";
import {
  addMonths,
  registrationExpiries,
  relativeDay,
  scouterSections,
  transitionOf,
  transitionRules,
  transitions,
  VALIDITY_WARNING_DAYS,
  transitionWindow,
  upcomingDates,
} from "./alerts";

const person = (
  over: Partial<{
    id: string;
    name: string;
    active: boolean;
    branch: ScoutBranch;
    birth_date: string | null;
    promise_date: string | null;
  }>,
) => ({
  id: "a",
  name: "Ana",
  active: true,
  branch: "lobinho" as const,
  birth_date: null,
  promise_date: null,
  ...over,
});

describe("upcomingDates", () => {
  it("pega aniversários de 5 dias atrás a 15 dias à frente, com os anos completados", () => {
    const list = upcomingDates(
      [
        person({ id: "1", name: "Ana", birth_date: "2015-11-24" }),
        person({ id: "2", name: "Bia", birth_date: "2014-11-14", promise_date: "2022-12-04" }),
        person({ id: "3", name: "Caio", birth_date: "2014-12-10" }),
        person({ id: "4", name: "Duda", birth_date: "2014-11-13" }),
      ],
      "2026-11-19",
    );
    expect(list.map((d) => [d.name, d.kind, d.days, d.years])).toEqual([
      ["Bia", "aniversario", -5, 12],
      ["Ana", "aniversario", 5, 11],
      ["Bia", "promessa", 15, 4],
    ]);
  });

  it("atravessa a virada do ano e ignora desligados e a própria data", () => {
    const list = upcomingDates(
      [
        person({ id: "1", birth_date: "2016-01-02" }),
        person({ id: "2", name: "Bia", birth_date: "2016-01-02", active: false }),
        person({ id: "3", name: "Caio", promise_date: "2026-12-30" }),
      ],
      "2026-12-28",
    );
    expect(list).toEqual([
      { associateId: "1", name: "Ana", kind: "aniversario", on: "2027-01-02", days: 5, years: 11 },
    ]);
  });

  it("29 de fevereiro vira 1º de março em ano não bissexto", () => {
    expect(upcomingDates([person({ birth_date: "2016-02-29" })], "2027-02-27")[0]).toMatchObject({
      on: "2027-03-01",
      days: 2,
      years: 11,
    });
  });
});

describe("transitions", () => {
  const at = (branch: ScoutBranch, birth: string, today: string, started: string | null = null) =>
    transitionOf({ ...person({ branch, birth_date: birth }), transition_started_on: started }, today);

  it("Lobinho: aviso a partir dos 10 anos, crítico a partir dos 11", () => {
    expect(at("lobinho", "2016-11-20", "2026-11-19")).toBeNull();
    expect(at("lobinho", "2016-11-19", "2026-11-19")).toMatchObject({
      level: "aviso",
      text: "Pensar na transição",
      age: { years: 10, months: 0 },
      criticalOn: "2027-11-19",
      dueOn: "2027-11-19",
    });
    expect(at("lobinho", "2015-11-19", "2026-11-19")).toMatchObject({
      level: "critico",
      text: "Já devia estar no Escoteiro",
    });
  });

  it("Escoteiro: aviso aos 14, crítico aos 15", () => {
    expect(at("escoteiro", "2012-11-20", "2026-11-19")).toBeNull();
    expect(at("escoteiro", "2012-11-19", "2026-11-19")?.level).toBe("aviso");
    expect(at("escoteiro", "2011-11-19", "2026-11-19")?.level).toBe("critico");
  });

  it("Sênior: aviso aos 17 anos e meio; crítico só depois do aniversário de 18", () => {
    expect(at("senior", "2009-05-20", "2026-11-19")).toBeNull();
    expect(at("senior", "2009-05-19", "2026-11-19")).toMatchObject({
      level: "aviso",
      warnOn: "2026-11-19",
      criticalOn: "2027-05-20",
    });
    expect(at("senior", "2008-11-19", "2026-11-19")?.level).toBe("aviso"); // o próprio aniversário é o dia da passagem
    expect(at("senior", "2008-11-18", "2026-11-19")).toMatchObject({
      level: "critico",
      text: "Passou do aniversário de 18 anos",
    });
  });

  it("Pioneiro: partida a programar aos 21 anos e meio, crítica aos 22", () => {
    expect(at("pioneiro", "2005-05-20", "2026-11-19")).toBeNull();
    expect(at("pioneiro", "2005-05-19", "2026-11-19")).toMatchObject({ level: "aviso", label: "Partida do Pioneiro" });
    expect(at("pioneiro", "2004-11-19", "2026-11-19")?.level).toBe("critico");
  });

  it("transição iniciada troca o aviso, mas não o crítico", () => {
    expect(at("lobinho", "2016-01-10", "2026-11-19", "2026-10-01")).toMatchObject({
      level: "iniciada",
      text: "Em transição",
      startedOn: "2026-10-01",
    });
    expect(at("pioneiro", "2005-01-10", "2026-11-19", "2026-10-01")).toMatchObject({
      level: "iniciada",
      text: "Partida programada",
    });
    expect(at("lobinho", "2015-01-10", "2026-11-19", "2026-10-01")).toMatchObject({
      level: "critico",
      startedOn: "2026-10-01",
    });
  });

  it("Filhote (só com o ramo ligado): aviso aos 6 anos e meio, crítico aos 7", () => {
    const filhote = (birth: string) =>
      transitionOf(person({ branch: "filhote", birth_date: birth }), "2026-11-19", transitionRules(true));
    expect(filhote("2020-05-20")).toBeNull();
    expect(filhote("2020-05-19")).toMatchObject({
      level: "aviso",
      label: "Filhote → Lobinho",
      criticalOn: "2027-05-19",
    });
    expect(filhote("2019-11-19")).toMatchObject({ level: "critico", text: "Já devia estar no Lobinho" });
    expect(
      transitionOf(person({ branch: "filhote", birth_date: "2019-11-19" }), "2026-11-19", transitionRules(false)),
    ).toBeNull();
  });

  it("adultos, desligados e sem nascimento não entram", () => {
    expect(at("adulto", "1990-01-01", "2026-11-19")).toBeNull();
    expect(
      transitionOf(person({ branch: "senior", birth_date: "2008-01-01", active: false }), "2026-11-19"),
    ).toBeNull();
    expect(transitionOf(person({ branch: "senior" }), "2026-11-19")).toBeNull();
  });

  it("lista críticos primeiro, depois avisos e em transição", () => {
    const list = transitions(
      [
        {
          ...person({ id: "1", name: "Ana", branch: "lobinho", birth_date: "2016-06-01" }),
          transition_started_on: "2026-11-01",
        },
        person({ id: "2", name: "Bia", branch: "lobinho", birth_date: "2016-03-01" }),
        person({ id: "3", name: "Caio", branch: "escoteiro", birth_date: "2011-01-01" }),
      ],
      "2026-11-19",
    );
    expect(list.map((t) => [t.name, t.level])).toEqual([
      ["Caio", "critico"],
      ["Bia", "aviso"],
      ["Ana", "iniciada"],
    ]);
  });

  it("período de transição do ramo, mesmo fora da janela", () => {
    expect(transitionWindow({ branch: "lobinho", birth_date: "2016-01-15" })).toMatchObject({
      warnOn: "2026-01-15",
      dueOn: "2027-01-15",
      criticalOn: "2027-01-15",
    });
    expect(transitionWindow({ branch: "senior", birth_date: "2008-11-19" })).toMatchObject({
      dueOn: "2026-11-19",
      criticalOn: "2026-11-20",
    });
    expect(transitionWindow({ branch: "adulto", birth_date: "1990-01-01" })).toBeNull();
    expect(transitionWindow({ branch: "lobinho", birth_date: null })).toBeNull();
    expect(at("lobinho", "2016-07-19", "2026-11-19")?.age).toEqual({ years: 10, months: 4 });
  });

  it("addMonths ajusta o fim do mês", () => {
    expect(addMonths("2008-08-31", 6)).toBe("2009-02-28");
    expect(addMonths("2009-05-19", 17 * 12 + 6)).toBe("2026-11-19");
  });
});

describe("registrationExpiries e relativeDay", () => {
  it("vencidos e vencendo na janela de aviso, de associados ativos com situação ok; vencidos primeiro", () => {
    const today = "2026-11-19";
    const plusDays = (days: number) =>
      new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    const lastDay = plusDays(VALIDITY_WARNING_DAYS);
    const people = [
      { id: "a", name: "Ana", active: true },
      { id: "b", name: "Bia", active: true },
      { id: "c", name: "Caio", active: false },
    ];
    const items = [{ id: "v", name: "Validade do registro" }];
    const row = (associate_id: string | null, valid_until: string | null, status = "ok") => ({
      associate_id,
      item_id: "v",
      status,
      valid_until,
    });
    const list = registrationExpiries(
      [
        row("a", lastDay),
        row("b", "2026-11-10"),
        row("a", plusDays(VALIDITY_WARNING_DAYS + 1)),
        row("b", null),
        row("c", "2026-11-01"),
        row("b", "2026-11-20", "pendente"),
        row(null, "2026-11-20"),
        row("a", "2026-11-19"),
      ],
      people,
      items,
      today,
    );
    expect(list.map((e) => `${e.name} ${e.validUntil} ${e.days}`)).toEqual([
      "Bia 2026-11-10 -9",
      "Ana 2026-11-19 0",
      `Ana ${lastDay} ${VALIDITY_WARNING_DAYS}`,
    ]);
    expect(list[0].item).toBe("Validade do registro");
  });

  it("texto relativo", () => {
    expect([0, 1, -1, 3, -2].map(relativeDay)).toEqual(["hoje", "amanhã", "ontem", "em 3 dias", "há 2 dias"]);
  });
});

describe("scouterSections", () => {
  const fn = (
    kind: string,
    section_id: string | null,
    started_on: string | null,
    ended_on: string | null,
    section = section_id && `S${section_id}`,
  ) => ({ kind, section_id, section, started_on, ended_on });
  it("só funções de escotista em curso e com seção, sem repetir, por nome", () => {
    const sections = scouterSections(
      [
        fn("escotista", "b", "2025-01-01", null),
        fn("escotista", "a", null, "2026-11-19"),
        fn("escotista", "c", "2026-11-20", null),
        fn("escotista", "d", "2020-01-01", "2026-11-18"),
        fn("dirigente", "e", null, null),
        fn("escotista", null, null, null),
        fn("escotista", "b", "2024-01-01", null),
      ],
      "2026-11-19",
    );
    expect(sections).toEqual([
      { id: "a", name: "Sa" },
      { id: "b", name: "Sb" },
    ]);
  });
});
