import { Link } from "@geas/ui/components/link";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { SectionCard } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/associates/app-header";
import { ControlFilters } from "@/components/associates/control-filters";
import { ControlLegend, ControlMatrix, type MatrixRow } from "@/components/associates/control-matrix";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { matchesQuery } from "@/lib/associates/list";
import {
  activeFunctionKinds,
  associateAudiences,
  audienceFromSlug,
  audienceLabels,
  audienceSlugs,
  filterBlocks,
  FUNCTION_KINDS,
  functionKindLabels,
  hiddenDirectorates,
  MATRIX_AUDIENCES,
  matrixGroups,
  pendingCount,
  relativesOnce,
  rowHasPending,
  scouterSections,
  statusMap,
  type MatrixBlock,
  type MatrixPerson,
} from "@/lib/associates/controls";
import { activeRelativeIds, linksByAssociate, relativeHomes, relativeRows } from "@/lib/associates/relatives";
import { branchLabels, todayISO } from "@/lib/associates/model";
import * as associatesData from "@/lib/server/associates/associates";
import * as controls from "@/lib/server/associates/controls";
import * as functionsData from "@/lib/server/associates/functions";
import * as relativesData from "@/lib/server/associates/relatives";
import { pageSession } from "@/lib/server/session";

type Search = { publico?: string; q?: string; pendencias?: string; desligados?: string; ocultar?: string };

/**
 * Controle de dados pessoais (Doc 22): uma só matriz pessoa × item, com as diretorias em sequência (Métodos
 * Educativos, Administrativa, Financeira, Comunicação), para um público (abas Jovens | Adultos). Linhas = associados
 * ativos do público (e, com "Incluir desligados", os desligados com registro, para ver o que falta remover); na aba
 * Jovens, cada jovem tem logo abaixo as linhas dos seus responsáveis (menos quem também é associado ativo: os itens
 * dele ficam na linha de adulto); o responsável compartilhado aparece uma vez só, sob o jovem de quem é responsável
 * legal (depois mãe/pai, depois o primeiro da lista). Colunas = itens ativos do público (Jovens:
 * também os de responsável), agrupados por diretoria; `?ocultar=` esconde diretorias.
 */
export default async function ControlPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const today = todayISO();
  const audience = audienceFromSlug(search.publico);
  const hidden = hiddenDirectorates(search.ocultar);

  const [allItems, associates, functions, statuses, links] = await Promise.all([
    controls.items(db, groupId),
    associatesData.list(db, groupId),
    functionsData.list(db, groupId),
    controls.statuses(db, groupId),
    audience === "jovem" ? relativesData.links(db, groupId) : Promise.resolve([]),
  ]);
  const groups = matrixGroups(allItems, audience, hidden);
  const items = groups.flatMap((group) => group.items);
  const kinds = activeFunctionKinds(functions, today);
  const scouterOf = scouterSections(functions, today);
  const map = statusMap(statuses);
  const itemIds = new Set(items.map((item) => item.id));
  const withRecord = new Set(
    statuses.flatMap((row) => (row.associate_id && itemIds.has(row.item_id) ? [row.associate_id] : [])),
  );
  const linksOf = linksByAssociate(links);
  const activeAssociates = new Set(associates.filter((a) => a.active).map((a) => a.id));
  const activeRelatives = activeRelativeIds(links, activeAssociates);

  const blocks: MatrixBlock[] = associates
    .map((a): MatrixPerson => {
      const own = kinds.get(a.id);
      const detail =
        a.branch === "adulto"
          ? own
            ? FUNCTION_KINDS.filter((k) => own.has(k))
                .map((k) =>
                  k === "escotista" && scouterOf.has(a.id)
                    ? `${functionKindLabels[k]} (${scouterOf.get(a.id)!.join(", ")})`
                    : functionKindLabels[k],
                )
                .join(" · ")
            : "Sem função"
          : (a.section ?? branchLabels[a.branch]);
      return { id: a.id, name: a.name, active: a.active, audiences: associateAudiences(a.branch), detail };
    })
    .filter((p) => p.audiences.includes(audience) && (p.active || (search.desligados === "1" && withRecord.has(p.id))))
    .map((person) => ({
      person,
      relatives: relativeRows(linksOf.get(person.id) ?? [], activeRelatives, activeAssociates),
    }));
  const pendingCells = pendingCount(
    blocks.flatMap((b) => [b.person, ...b.relatives]),
    items,
    map,
  );
  const pendingOnly = search.pendencias === "1";
  // filtra e só então tira o responsável repetido (fica sob o primeiro irmão mostrado); com "só pendências", sai o
  // irmão que só entrava pela pendência do responsável já mostrado acima
  // casa de cada responsável na ordem da lista inteira (antes dos filtros): legal, depois mãe/pai, depois o primeiro
  const homes = relativeHomes(links, new Map(blocks.map((block, index) => [block.person.id, index])));
  const shown = relativesOnce(
    filterBlocks(blocks, items, map, { matches: (name) => matchesQuery(name, search.q), pendingOnly }),
    homes,
  ).filter((b) => !pendingOnly || [b.person, ...b.relatives].some((p) => rowHasPending(p, items, map)));
  const people: MatrixRow[] = shown.flatMap(({ person, relatives }) => [
    { key: person.id, person },
    ...relatives.map((relative) => ({ key: `${person.id}:r:${relative.id}`, person: relative, parent: person.name })),
  ]);
  const shownIds = new Set(shown.map((b) => b.person.id));
  const shownRelatives = new Set(shown.flatMap((b) => b.relatives.map((r) => r.id)));
  const rows = statuses.filter(
    (row) =>
      itemIds.has(row.item_id) &&
      (row.associate_id
        ? shownIds.has(row.associate_id)
        : row.relative_id !== null && shownRelatives.has(row.relative_id)),
  );

  // Abas de público mantêm os outros filtros.
  const hrefFor = (slug: string) => {
    const next = new URLSearchParams(
      Object.entries(search).filter(([key, value]) => key !== "publico" && typeof value === "string" && value) as [
        string,
        string,
      ][],
    );
    next.set("publico", slug);
    return `/associados/controle?${next}`;
  };
  const tabs = MATRIX_AUDIENCES.map((a) => ({
    href: hrefFor(audienceSlugs[a]),
    label: audienceLabels[a],
    active: a === audience,
  }));
  const canEdit = member.associates.canWrite;
  const audienceText = audienceLabels[audience].toLowerCase();

  return (
    <div className="shell">
      <AppHeader current="/associados/controle" member={member} />
      <PageBody>
        <PageHeader
          title="Controle de dados"
          crumbs={[{ label: "Associados", href: "/associados" }, { label: "Controle de dados" }]}
          tabs={<SectionTabs label="Público" tabs={tabs} />}
          description={
            <>
              Acompanhamento dos registros individuais (Paxtu, fichas, canais):{" "}
              {canEdit ? "clique numa célula para registrar a situação." : "só a secretaria altera."}{" "}
              <strong className="num">{pendingCells}</strong> {pendingCells === 1 ? "pendência" : "pendências"} de{" "}
              {audienceText}
              {audience === "jovem" && " e responsáveis"} ativos{hidden.length ? " nas diretorias mostradas" : ""}.
            </>
          }
        >
          <ControlFilters hidden={hidden} />
        </PageHeader>
        <SectionCard className="min-w-0">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Nenhum item ativo para {audienceText}
              {hidden.length ? " nas diretorias mostradas" : ""}.{" "}
              <Link href="/associados/configuracoes/itens" className="font-medium text-primary hover:underline">
                Ver os itens de controle
              </Link>
            </p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              {search.pendencias === "1" ? "Nenhuma pendência." : "Nenhum associado neste público."}
            </p>
          ) : (
            <ControlMatrix
              groups={groups}
              people={people}
              rows={rows}
              canEdit={canEdit}
              today={today}
              caption={`Controle de dados: ${audienceLabels[audience]}`}
            />
          )}
          <ControlLegend />
        </SectionCard>
      </PageBody>
    </div>
  );
}
