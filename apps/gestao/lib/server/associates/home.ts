import { registrationExpiries, transitions, upcomingDates, type Expiry, type Transition, type UpcomingDate } from "@/lib/associates/alerts";
import { associateAudiences, matrixGroups, pendingCount, statusMap, type MatrixAudience, type MatrixPerson } from "@/lib/associates/controls";
import { activeRelativeIds, linksByAssociate, relativeRows } from "@/lib/associates/relatives";
import type { Db } from "@/lib/server/db";
import { list as listAssociates } from "./associates";
import { items as listItems, statuses as listStatuses } from "./controls";
import { links as listLinks } from "./relatives";

export type AssociatesOverview = {
  dates: UpcomingDate[];
  transitions: Transition[];
  /** Pendências da matriz de controle (mesma conta da tela Controle), por aba. */
  pending: Record<MatrixAudience, number>;
  /** Registros de associados ativos vencidos ou com validade nos próximos dias. */
  expiries: Expiry[];
};

/** O que o Associados mostra no Início geral. */
export async function overview(db: Db, groupId: string, today: string): Promise<AssociatesOverview> {
  const [associates, allItems, statuses, links] = await Promise.all([
    listAssociates(db, groupId), listItems(db, groupId), listStatuses(db, groupId), listLinks(db, groupId),
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
  };
}
