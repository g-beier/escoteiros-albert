import { buildDoc10, type Doc10 } from "@/lib/associates/doc10";
import { buildDoc13, type Doc13 } from "@/lib/associates/doc13";
import { buildDoc14, type Doc14 } from "@/lib/associates/doc14";
import { buildLifeReport, type LifeReport } from "@/lib/associates/life-report";
import type { Db } from "@/lib/server/db";
import * as associates from "./associates";
import * as controls from "./controls";
import * as functions from "./functions";
import * as relatives from "./relatives";
import * as life from "./scout-life";
import * as sections from "./sections";

// Dados dos relatórios em PDF do Associados (/associados/relatorios). O conteúdo é montado pelas funções puras de
// lib/associates (ex.: doc10.ts); aqui só as leituras, sob RLS.

/** Item de controle que diz quem está no Paxtu (carga inicial do Doc 22). */
export const PAXTU_ITEM = "Dados individuais no Paxtu";
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Doc 10 – Lista simples de efetivo. */
export async function doc10(db: Db, groupId: string, today: string): Promise<Doc10> {
  const [people, fns, catalog, links, items, statuses] = await Promise.all([
    associates.list(db, groupId), functions.list(db, groupId), sections.catalog(db, groupId), relatives.links(db, groupId),
    controls.items(db, groupId), controls.statuses(db, groupId),
  ]);
  const paxtuItem = items.find((item) => fold(item.name) === fold(PAXTU_ITEM));
  const paxtu = new Set(statuses.flatMap((row) => (paxtuItem && row.item_id === paxtuItem.id && row.associate_id && row.effective_status === "ok" ? [row.associate_id] : [])));
  return buildDoc10({ associates: people, functions: fns, sections: catalog.sections, links, paxtu, today });
}

/** Doc 14 – Datas de promessa. */
export async function doc14(db: Db, groupId: string, today: string): Promise<Doc14> {
  const [people, fns, catalog] = await Promise.all([associates.list(db, groupId), functions.list(db, groupId), sections.catalog(db, groupId)]);
  return buildDoc14({ associates: people, functions: fns, sections: catalog.sections, today });
}

/** Doc 13 – Controle de idade dos jovens. */
export async function doc13(db: Db, groupId: string, today: string): Promise<Doc13> {
  const [people, catalog] = await Promise.all([associates.list(db, groupId), sections.catalog(db, groupId)]);
  return buildDoc13({ associates: people, sections: catalog.sections, today });
}

/** Vida escoteira: promessa, estrelas por ramo e lacunas. */
export async function lifeReport(db: Db, groupId: string, today: string): Promise<LifeReport> {
  const [people, fns, data] = await Promise.all([associates.list(db, groupId), functions.list(db, groupId), life.ofGroup(db, groupId)]);
  return buildLifeReport({ associates: people, functions: fns, periods: data.periods, stars: data.stars, today });
}
