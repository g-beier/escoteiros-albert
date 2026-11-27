import {
  registrationExpiries,
  scouterSections,
  transitions,
  upcomingDates,
  type Expiry,
  type ScouterSection,
  type Transition,
  type UpcomingDate,
} from "@/lib/associates/alerts";
import {
  associateAudiences,
  matrixGroups,
  pendingCount,
  statusMap,
  type MatrixAudience,
  type MatrixPerson,
} from "@/lib/associates/controls";
import { activeRelativeIds, linksByAssociate, relativeRows } from "@/lib/associates/relatives";
import { lifeSummary, type Star } from "@/lib/associates/scout-life";
import type { Db } from "@/lib/server/db";
import { rpc } from "@/lib/server/pg/db";
import { list as listAssociates } from "./associates";
import { items as listItems, statuses as listStatuses } from "./controls";
import { listOf as functionsOf } from "./functions";
import { links as listLinks } from "./relatives";
import { ofGroup as lifeOfGroup, ofMySections as sectionLife, type StarLife } from "./scout-life";

/** Estrela de atividade a entregar (aviso 15 dias antes, até a entrega). */
export type StarDue = { associateId: string; name: string; star: Star };

export type AssociatesOverview = {
  dates: UpcomingDate[];
  transitions: Transition[];
  /** Pendências da matriz de controle (mesma conta da tela Controle), por aba. */
  pending: Record<MatrixAudience, number>;
  /** Registros de associados ativos vencidos ou com validade nos próximos dias. */
  expiries: Expiry[];
  /** Estrelas de atividade a entregar, das mais antigas para as mais novas. */
  stars: StarDue[];
  /** Seções em que quem está logado é escotista hoje (vazio: não é escotista ou não tem associado ligado). */
  sections: ScouterSection[];
  /** Datas, transições e estrelas só dos jovens dessas seções (`true`) ou do grupo todo. */
  sectionOnly: boolean;
};

/** Escotista com acesso ao Associados: avisos da própria seção (padrão) ou do grupo todo. */
export type OverviewScope = { associateId: string | null; wholeGroup: boolean };

/** O que o Associados mostra no Início geral. */
export async function overview(
  db: Db,
  groupId: string,
  today: string,
  scope: OverviewScope,
): Promise<AssociatesOverview> {
  const [associates, allItems, statuses, links, life, functions] = await Promise.all([
    listAssociates(db, groupId),
    listItems(db, groupId),
    listStatuses(db, groupId),
    listLinks(db, groupId),
    lifeOfGroup(db, groupId),
    scope.associateId ? functionsOf(db, scope.associateId) : Promise.resolve([]),
  ]);
  // Escotista: datas, transições e estrelas só dos jovens das suas seções, como o chefe sem acesso (sectionOverview),
  // a menos que peça o grupo todo. Pendências do controle e vencimentos de registro são trabalho do módulo: sempre do grupo.
  const sections = scouterSections(functions, today);
  const sectionOnly = sections.length > 0 && !scope.wholeGroup;
  const sectionIds = new Set(sections.map((section) => section.id));
  const people = sectionOnly
    ? associates.filter((a) => a.active && a.branch !== "adulto" && a.section_id && sectionIds.has(a.section_id))
    : associates;
  const map = statusMap(statuses);
  const activeAssociates = new Set(associates.filter((a) => a.active).map((a) => a.id));
  const activeRelatives = activeRelativeIds(links, activeAssociates);
  const linksOf = linksByAssociate(links);

  const pendingFor = (audience: MatrixAudience) => {
    const items = matrixGroups(allItems, audience).flatMap((group) => group.items);
    const people = associates
      .filter((a) => a.active)
      .map((a): MatrixPerson => ({
        id: a.id,
        name: a.name,
        active: true,
        audiences: associateAudiences(a.branch),
        detail: "",
      }))
      .filter((p) => p.audiences.includes(audience))
      .flatMap((p) => [
        p,
        ...(audience === "jovem" ? relativeRows(linksOf.get(p.id) ?? [], activeRelatives, activeAssociates) : []),
      ]);
    return pendingCount(people, items, map);
  };

  return {
    dates: upcomingDates(people, today),
    transitions: transitions(people, today),
    pending: { jovem: pendingFor("jovem"), adulto: pendingFor("adulto") },
    expiries: registrationExpiries(
      statuses,
      associates,
      allItems.filter((item) => item.active),
      today,
    ),
    stars: starsDue(people, life, today),
    sections,
    sectionOnly,
  };
}

/** Estrelas a entregar (aviso `STAR_NOTICE_DAYS` antes, até a entrega), das mais antigas para as mais novas. */
function starsDue(
  people: { id: string; name: string; promise_date: string | null }[],
  life: StarLife,
  today: string,
): StarDue[] {
  return people
    .flatMap((a) => {
      const pending = lifeSummary({
        periods: life.periods.get(a.id) ?? [],
        promiseDate: a.promise_date,
        records: life.stars.get(a.id) ?? [],
        exclusions: life.exclusions.get(a.id) ?? [],
        today,
      }).pending;
      return pending ? [{ associateId: a.id, name: a.name, star: pending }] : [];
    })
    .sort((x, y) => x.star.dueOn.localeCompare(y.star.dueOn) || x.name.localeCompare(y.name, "pt-BR"));
}

/**
 * Para quem não vê o Associados (chefes): só aniversários, promessas, transições e estrelas de atividade dos jovens das
 * seções em que a pessoa é escotista (associado ligado ao acesso em /usuarios). Sem controle nem vencimentos de registro.
 */
export async function sectionOverview(db: Db, groupId: string, today: string): Promise<AssociatesOverview> {
  const [people, life] = await Promise.all([
    rpc(db, "associates_section_alert_rows", { p_group_id: groupId }),
    sectionLife(db, groupId),
  ]);
  return {
    dates: upcomingDates(people, today),
    transitions: transitions(people, today),
    pending: { jovem: 0, adulto: 0 },
    expiries: [],
    stars: starsDue(people, life, today),
    sections: [],
    sectionOnly: true,
  };
}
