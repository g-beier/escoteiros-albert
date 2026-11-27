// Doc 10 – Lista simples de efetivo: o conteúdo do relatório a partir do cadastro (puro; o PDF fica em
// components/associates/reports/doc10-report.tsx). Só associados ativos e funções ativas na data.
//
// Parte 1, por seção (ordem dos ramos, depois nome): escotistas da seção × jovens com registro definitivo e
// provisório. Depois, totais de escotistas, diretoria (eleitos em negrito), totalização, outros (todo adulto que não é
// escotista nem dirigente; Comissão Fiscal em negrito), total com registro definitivo e no Paxtu.
// Parte 2, por seção: cada jovem com os seus responsáveis. O responsável aparece completo sob o jovem "casa" e, nos
// demais, com "Ver <jovem casa>" (célula mesclada quando todos os responsáveis do jovem apontam para a mesma casa).

import { isFunctionActive, type AssociateFunction } from "./controls";
import { branchLabels, SECTION_BRANCHES, type AssociateProfile, type ScoutBranch, type SectionItem } from "./model";
import { guardianOrder, relativeHomes, type RelativeLink } from "./relatives";

/** Linhas vazias para preencher à mão no impresso. */
export const BLANK_ROWS = 3;
export const MIN_DEFINITIVE_ROWS = 6;
export const MIN_PROVISIONAL_ROWS = 4;
export const BLANK_LIST_ROWS = 2;
export const BLANK_FAMILIES = 2;
export const BLANK_FAMILY_ROWS = 2;

/** Nome no relatório: `red` = pendência de cadastro (registro rápido para revisar); `bold` = eleito/comissão fiscal. */
export type Doc10Name = { id: string; name: string; red?: boolean; bold?: boolean };

export type Doc10Section = {
  key: string;
  title: string;
  branch: Exclude<ScoutBranch, "adulto">;
  adults: Doc10Name[];
  definitive: Doc10Name[];
  provisional: Doc10Name[];
  /** Linhas de cada lista, já com as vazias; as duas colunas ficam na mesma altura. */
  rows: { adults: number; definitive: number; provisional: number };
};

/** Responsável sob o jovem: `associate` = também é associado ativo (fundo azul); `notLegal` = não é responsável legal deste jovem (asterisco). */
export type Doc10Relative = { id: string; name: string; associate: boolean; notLegal: boolean; see: string | null };
export type Doc10Family = { youth: Doc10Name; relatives: Doc10Relative[]; seeMerged: string | null };
export type Doc10FamilySection = {
  key: string;
  title: string;
  branch: Exclude<ScoutBranch, "adulto">;
  families: Doc10Family[];
};

export type Doc10 = {
  sections: Doc10Section[];
  totalScouters: number;
  board: Doc10Name[];
  totalDirectors: number;
  totalAdults: number;
  youth: { definitive: number; provisional: number; total: number };
  basic: number;
  others: Doc10Name[];
  totalOthers: number;
  totalDefinitive: number;
  totalPaxtu: number;
  families: Doc10FamilySection[];
};

export type Doc10Input = {
  associates: AssociateProfile[];
  functions: AssociateFunction[];
  sections: SectionItem[];
  links: RelativeLink[];
  /** Associados com "Dados individuais no Paxtu" OK. */
  paxtu: ReadonlySet<string>;
  today: string;
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);
const isPending = (a: AssociateProfile) => a.review_status === "para_revisar";
const asName = (a: AssociateProfile, bold = false): Doc10Name => ({
  id: a.id,
  name: a.name,
  ...(isPending(a) ? { red: true } : {}),
  ...(bold ? { bold } : {}),
});

/** Nome curto para o "Ver": apelido ou primeiro nome. */
export const shortName = (a: Pick<AssociateProfile, "name" | "nickname">) =>
  a.nickname?.trim() || a.name.trim().split(/\s+/)[0];

/** Linhas da seção: nomes + vazias, com mínimos; as duas colunas (adultos | jovens) com a mesma altura. */
export function sectionRows(adults: number, definitive: number, provisional: number) {
  const def = Math.max(definitive + BLANK_ROWS, MIN_DEFINITIVE_ROWS);
  let prov = Math.max(provisional + BLANK_ROWS, MIN_PROVISIONAL_ROWS);
  // coluna da direita: cabeçalho do definitivo + linhas + cabeçalho do provisório + linhas
  const right = def + prov + 1;
  const left = Math.max(adults + BLANK_ROWS, right);
  if (left > right) prov += left - right;
  return { adults: left, definitive: def, provisional: prov };
}

/** Seção de um relatório: uma seção cadastrada ou o grupo "<Ramo> (sem seção)" dos jovens sem seção. */
export type ReportSection = {
  key: string;
  title: string;
  branch: Exclude<ScoutBranch, "adulto">;
  sectionId: string | null;
};
type Bucket = ReportSection;

/**
 * Seções dos relatórios, na ordem dos ramos e depois por nome: as ativas e as inativas que ainda têm alguém (`used`);
 * jovens ativos sem seção formam "<Ramo> (sem seção)" no fim do ramo.
 */
export function reportSections(
  sections: SectionItem[],
  youth: Pick<AssociateProfile, "branch" | "section_id">[],
  used: ReadonlySet<string | null> = new Set(),
): ReportSection[] {
  const inUse = new Set([...used, ...youth.map((a) => a.section_id)]);
  return SECTION_BRANCHES.flatMap((branch) => {
    const own = sections
      .filter((s) => s.branch === branch && (s.active || inUse.has(s.id)))
      .sort(byName)
      .map((s): ReportSection => ({
        key: s.id,
        title: s.name,
        branch: branch as ReportSection["branch"],
        sectionId: s.id,
      }));
    const loose = youth.some((a) => a.branch === branch && !a.section_id)
      ? [
          {
            key: `sem-secao-${branch}`,
            title: `${branchLabels[branch]} (sem seção)`,
            branch: branch as ReportSection["branch"],
            sectionId: null,
          },
        ]
      : [];
    return [...own, ...loose];
  });
}

export function buildDoc10({ associates, functions, sections, links, paxtu, today }: Doc10Input): Doc10 {
  const active = associates.filter((a) => a.active);
  const byId = new Map(active.map((a) => [a.id, a]));
  const current = functions.filter((fn) => isFunctionActive(fn, today) && byId.has(fn.associate_id));
  const kindsOf = new Map<string, Set<string>>();
  for (const fn of current) kindsOf.set(fn.associate_id, (kindsOf.get(fn.associate_id) ?? new Set()).add(fn.kind));
  const youth = active.filter((a) => a.branch !== "adulto");

  // Seções: as ativas e as que têm alguém (jovem ou escotista); jovem sem seção vai para "<Ramo> (sem seção)".
  const buckets = reportSections(sections, youth, new Set(current.map((fn) => fn.section_id)));
  const youthIn = (bucket: Bucket) =>
    youth.filter((a) => a.branch === bucket.branch && a.section_id === bucket.sectionId).sort(byName);

  const sectionBlocks = buckets.map((bucket): Doc10Section => {
    const scouterIds = new Set(
      current
        .filter((fn) => fn.kind === "escotista" && bucket.sectionId && fn.section_id === bucket.sectionId)
        .map((fn) => fn.associate_id),
    );
    const adults = [...scouterIds]
      .map((id) => byId.get(id)!)
      .sort(byName)
      .map((a) => asName(a));
    const members = youthIn(bucket);
    const definitive = members.filter((a) => a.registration !== "provisorio").map((a) => asName(a));
    const provisional = members.filter((a) => a.registration === "provisorio").map((a) => asName(a));
    return {
      key: bucket.key,
      title: bucket.title,
      branch: bucket.branch,
      adults,
      definitive,
      provisional,
      rows: sectionRows(adults.length, definitive.length, provisional.length),
    };
  });

  const has = (id: string, kind: string) => kindsOf.get(id)?.has(kind) ?? false;
  const adultsActive = active.filter((a) => a.branch === "adulto");
  const scouters = adultsActive.filter((a) => has(a.id, "escotista"));
  const directors = adultsActive.filter((a) => has(a.id, "dirigente"));
  const elected = new Set(current.filter((fn) => fn.kind === "dirigente" && fn.elected).map((fn) => fn.associate_id));
  const others = adultsActive
    .filter((a) => !has(a.id, "escotista") && !has(a.id, "dirigente"))
    .sort(byName)
    .map((a) => asName(a, has(a.id, "comissao_fiscal")));
  const youthDefinitive = youth.filter((a) => a.registration !== "provisorio").length;
  const totalAdults = new Set([...scouters, ...directors].map((a) => a.id)).size;

  return {
    sections: sectionBlocks,
    totalScouters: scouters.length,
    board: [...directors].sort(byName).map((a) => asName(a, elected.has(a.id))),
    totalDirectors: directors.length,
    totalAdults,
    youth: { definitive: youthDefinitive, provisional: youth.length - youthDefinitive, total: youth.length },
    basic: totalAdults + youth.length,
    others,
    totalOthers: others.length,
    totalDefinitive: active.filter((a) => a.registration !== "provisorio").length,
    totalPaxtu: active.filter((a) => paxtu.has(a.id)).length,
    families: buildFamilies(
      buckets.map((bucket) => ({ bucket, members: youthIn(bucket) })),
      links,
      byId,
    ),
  };
}

/**
 * Parte 2. O jovem "casa" de cada responsável: o vínculo de responsável legal, depois o de mãe/pai (não "outro"),
 * depois o primeiro jovem na ordem do relatório. Asterisco = não é responsável legal deste jovem. Ordem sob o jovem:
 * `guardianOrder` (legais primeiro).
 */
function buildFamilies(
  groups: { bucket: Bucket; members: AssociateProfile[] }[],
  links: RelativeLink[],
  byId: Map<string, AssociateProfile>,
): Doc10FamilySection[] {
  const order = new Map<string, number>();
  for (const { members } of groups) for (const member of members) order.set(member.id, order.size);
  const listed = links.filter((link) => order.has(link.associate_id));
  const home = relativeHomes(listed, order);
  const linksOf = new Map<string, RelativeLink[]>();
  for (const link of listed) linksOf.set(link.associate_id, [...(linksOf.get(link.associate_id) ?? []), link]);

  return groups.map(({ bucket, members }) => ({
    key: bucket.key,
    title: bucket.title,
    branch: bucket.branch,
    families: members.map((member): Doc10Family => {
      // responsáveis legais primeiro (sem asterisco), depois mãe/pai, depois "outro parentesco"
      const relatives = guardianOrder(linksOf.get(member.id) ?? []).map((link): Doc10Relative => {
        const homeId = home.get(link.relative_id)!;
        return {
          id: link.relative_id,
          name: link.relative_name,
          associate: !!link.relative_associate_id && byId.has(link.relative_associate_id),
          notLegal: !link.legal,
          see: homeId === member.id ? null : shortName(byId.get(homeId)!),
        };
      });
      const targets = new Set(relatives.map((r) => r.see));
      const seeMerged = relatives.length > 1 && targets.size === 1 && relatives[0].see ? relatives[0].see : null;
      return { youth: asName(member), relatives, seeMerged };
    }),
  }));
}

/** Divide uma lista em duas colunas (esquerda com a sobra) e dá o número de linhas de cada uma, com as vazias. */
export function twoColumnRows<T>(items: T[], blanks = BLANK_LIST_ROWS): { left: T[]; right: T[]; rows: number } {
  const half = Math.ceil(items.length / 2);
  return { left: items.slice(0, half), right: items.slice(half), rows: Math.max(half, 1) + blanks };
}
