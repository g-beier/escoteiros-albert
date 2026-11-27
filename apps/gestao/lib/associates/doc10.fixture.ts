import type { AssociateFunction, FunctionKind } from "./controls";
import type { Doc10Input } from "./doc10";
import type { AssociateProfile, ScoutBranch, SectionItem } from "./model";
import type { Kinship, RelativeLink } from "./relatives";

// Nomes fictícios. Cenário: Alcateia (lobinho) e Tropa (escoteiro); irmãos Bia (lobinho) e Davi (escoteiro) com os
// mesmos pais; Isa e Sol (escoteiros) com uma família recomposta (Luana: mãe da Sol, "outro" da Isa; Roberto: pai da
// Isa, "outro" da Sol).

const today = "2026-11-20";
const sections: SectionItem[] = [
  { id: "tropa", branch: "escoteiro", name: "Tropa", active: true },
  { id: "alcateia", branch: "lobinho", name: "Alcateia", active: true },
  { id: "velha", branch: "senior", name: "Tropa Sênior antiga", active: false },
];
const person = (
  id: string,
  name: string,
  branch: ScoutBranch,
  section_id: string | null,
  extra: Partial<AssociateProfile> = {},
): AssociateProfile => ({
  id,
  name,
  branch,
  active: true,
  section_id,
  section: null,
  patrol_id: null,
  patrol: null,
  birth_date: null,
  promise_date: null,
  joined_on: null,
  notes: null,
  left_on: null,
  registration: "definitivo",
  review_status: "revisado",
  ...extra,
});
const fn = (associate_id: string, kind: FunctionKind, extra: Partial<AssociateFunction> = {}): AssociateFunction => ({
  id: `${associate_id}-${kind}`,
  associate_id,
  kind,
  title: null,
  started_on: "2024-01-01",
  ended_on: null,
  section_id: null,
  section: null,
  ...extra,
});
let n = 0;
const link = (
  associate_id: string,
  relative_id: string,
  kinship: Kinship,
  legal: boolean,
  extra: Partial<RelativeLink> = {},
): RelativeLink => ({
  id: `l${(n += 1)}`,
  associate_id,
  relative_id,
  relative_name: relative_id.toUpperCase(),
  relative_associate_id: null,
  kinship,
  kinship_note: null,
  legal,
  financial: false,
  position: n,
  sibling_count: 0,
  ...extra,
});

export const doc10Input: Doc10Input = {
  today,
  sections,
  associates: [
    person("bia", "Bia Lobinha", "lobinho", "alcateia"),
    person("caio", "Caio Lobinho", "lobinho", "alcateia", {
      registration: "provisorio",
      review_status: "para_revisar",
    }),
    person("davi", "Davi Escoteiro", "escoteiro", "tropa"),
    person("isa", "Isa Escoteira", "escoteiro", "tropa"),
    person("sol", "Sol Escoteira", "escoteiro", "tropa", { nickname: "Solzinha" }),
    person("leo", "Leo Solto", "escoteiro", null),
    person("ex", "Ex Desligado", "escoteiro", "tropa", { active: false }),
    person("ana", "Ana Chefe", "adulto", null),
    person("rui", "Rui Diretor", "adulto", null),
    person("eva", "Eva Diretora", "adulto", null, { registration: "provisorio" }),
    person("fis", "Fausto Fiscal", "adulto", null),
    person("hon", "Hugo Honorário", "adulto", null),
    person("sem", "Sara Sem Função", "adulto", null),
    person("mae", "Mãe Associada", "adulto", null),
  ],
  functions: [
    fn("ana", "escotista", { section_id: "alcateia" }),
    fn("ana", "dirigente", { elected: true }),
    fn("rui", "escotista", { section_id: "tropa" }),
    fn("rui", "escotista", { section_id: "tropa", title: "Assistente" }),
    fn("eva", "dirigente"),
    fn("fis", "comissao_fiscal"),
    fn("hon", "honorifico"),
    fn("mae", "colaborador"),
    fn("sem", "dirigente", { ended_on: "2025-01-01" }),
  ],
  links: [
    link("bia", "pai", "pai", true),
    link("bia", "mae", "mae", true, { relative_associate_id: "mae" }),
    link("davi", "pai", "pai", true),
    link("davi", "mae", "mae", true, { relative_associate_id: "mae" }),
    link("isa", "roberto", "pai", true),
    link("isa", "luana", "outro", false),
    link("isa", "ines", "mae", true),
    link("sol", "luana", "mae", true),
    link("sol", "roberto", "outro", false),
  ],
  paxtu: new Set(["bia", "davi", "ana", "ex"]),
};

/** Grupo grande e fictício (seções cheias), para conferir que cada bloco cabe numa página. */
export function largeDoc10Input(): Doc10Input {
  const branches: [string, ScoutBranch][] = [
    ["alcateia", "lobinho"],
    ["tropa", "escoteiro"],
    ["senior", "senior"],
    ["cla", "pioneiro"],
  ];
  const people: AssociateProfile[] = [];
  const links: RelativeLink[] = [];
  const functions: AssociateFunction[] = [];
  branches.forEach(([section, branch], b) => {
    for (let i = 1; i <= 16; i += 1) {
      const id = `${section}-${i}`;
      people.push(
        person(
          id,
          `Jovem exemplo ${section} número ${String(i).padStart(2, "0")} da silva`,
          branch,
          section,
          i > 13 ? { registration: "provisorio" } : {},
        ),
      );
      links.push(link(id, `${id}-mae`, "mae", true), link(id, `${id}-pai`, "pai", true));
      if (i % 4 === 0) links.push(link(id, `${id}-avo`, "outro", false));
    }
    for (let i = 1; i <= 5; i += 1) {
      const id = `chefe-${section}-${i}`;
      people.push(person(id, `Escotista exemplo ${b}${i}`, "adulto", null));
      functions.push(fn(id, "escotista", { section_id: section }));
    }
  });
  for (let i = 1; i <= 9; i += 1) {
    people.push(person(`dir-${i}`, `Dirigente exemplo ${i}`, "adulto", null));
    functions.push(fn(`dir-${i}`, "dirigente", { elected: i <= 3 }));
  }
  return {
    today,
    links,
    functions,
    associates: people,
    paxtu: new Set(people.map((p) => p.id)),
    sections: branches.map(([id, branch]) => ({ id, branch, name: `Seção ${id}`, active: true })),
  };
}
