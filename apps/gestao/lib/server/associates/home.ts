import { registrationExpiries, transitions, upcomingDates, type Expiry, type Transition, type UpcomingDate } from "@/lib/associates/alerts";
import { associateAudiences, matrixGroups, pendingCount, statusMap, type MatrixAudience, type MatrixPerson } from "@/lib/associates/controls";
import { activeRelativeIds, linksByAssociate, relativeRows } from "@/lib/associates/relatives";
import { lifeSummary, type Star } from "@/lib/associates/scout-life";
import type { Db } from "@/lib/server/db";
import { rpc } from "@/lib/server/pg/db";
import { list as listAssociates } from "./associates";
import { items as listItems, statuses as listStatuses } from "./controls";
import { links as listLinks } from "./relatives";
import { ofGroup as lifeOfGroup } from "./scout-life";

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
};

/** O que o Associados mostra no Início geral. */
export async function overview(db: Db, groupId: string, today: string): Promise<AssociatesOverview> {
  const [associates, allItems, statuses, links, life] = await Promise.all([
    listAssociates(db, groupId), listItems(db, groupId), listStatuses(db, groupId), listLinks(db, groupId), lifeOfGroup(db, groupId),
  ]);
  const map = statusMap(statuses);
  const activeAssociates = new Set(associates.filter((a) => a.active).map((a) => a.id));
  const activeRelatives = activeRelativeIds(links, activeAssociates);
  const linksOf = linksByAssociate(links);

  const pendingFor = (audience: MatrixAudience) => {
    const items = matrixGroups(allItems, audience).flatMap((group) => group.items);
    const people = associates
      .filter((a) => a.active)
      .map((a): MatrixPerson => ({ id: a.id, name: a.name, active: true, audiences: associateAudiences(a.branch), detail: "" }))
      .filter((p) => p.audiences.includes(audience))
      .flatMap((p) => [p, ...(audience === "jovem" ? relativeRows(linksOf.get(p.id) ?? [], activeRelatives, activeAssociates) : [])]);
    return pendingCount(people, items, map);
  };

  return {
    dates: upcomingDates(associates, today),
    transitions: transitions(associates, today),
    pending: { jovem: pendingFor("jovem"), adulto: pendingFor("adulto") },
    expiries: registrationExpiries(statuses, associates, allItems.filter((item) => item.active), today),
    stars: associates
      .flatMap((a) => {
        const pending = lifeSummary({ periods: life.periods.get(a.id) ?? [], promiseDate: a.promise_date, records: life.stars.get(a.id) ?? [], today }).pending;
        return pending ? [{ associateId: a.id, name: a.name, star: pending }] : [];
      })
      .sort((x, y) => x.star.dueOn.localeCompare(y.star.dueOn) || x.name.localeCompare(y.name, "pt-BR")),
  };
}

/**
 * Para quem não vê o Associados (chefes): só aniversários, promessas e transições dos jovens das seções em que a
 * pessoa é escotista (associado ligado ao acesso em /usuarios). Sem controle nem vencimentos de registro.
 */
export async function sectionOverview(db: Db, groupId: string, today: string): Promise<AssociatesOverview> {
  const people = await rpc(db, "associates_section_alert_rows", { p_group_id: groupId });
  return { dates: upcomingDates(people, today), transitions: transitions(people, today), pending: { jovem: 0, adulto: 0 }, expiries: [], stars: [] };
}
