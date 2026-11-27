import { Link } from "@geas/ui/components/link";
import type { ReactNode } from "react";
import {
  IconArrowRight,
  IconAward,
  IconBolt,
  IconExternalLink,
  IconCake,
  IconCircleCheck,
  IconPlus,
  IconStar,
} from "@tabler/icons-react";
import { PageBody, PageHeader, SectionTabs } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { Badge } from "@geas/ui/components/badge";
import { ListCard, StatCard } from "@geas/ui/components/stat-card";
import { cn } from "@geas/ui/lib/utils";
import { NewEntryButton } from "@/components/finance/entries/entry-editor";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { ALL_DATES, currentYear } from "@/lib/finance/filters";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { dateBR, formatCents } from "@/lib/format";
import { EXPIRY_WARNING_DAYS } from "@/lib/inventory/vocabulary";
import { relativeDay, VALIDITY_WARNING_DAYS } from "@/lib/associates/alerts";
import { ageYearsMonthsLabel } from "@/lib/associates/model";
import { lifeBranchShort } from "@/lib/associates/scout-life";
import { overview as associatesOverview, sectionOverview } from "@/lib/server/associates/home";
import { REVIEW_HREF } from "@/lib/quick";
import { USEFUL_LINKS } from "@/lib/useful-links";
import { countToReview as associatesToReview } from "@/lib/server/associates/associates";
import { countToReview as entriesToReview } from "@/lib/server/finance/entries";
import * as financeHome from "@/lib/server/finance/home";
import { overview as inventoryOverview } from "@/lib/server/inventory/overview";
import { pageSession } from "@/lib/server/session";

type Module = "financeiro" | "inventario" | "associados";
type Alert = { module: Module; count: number; label: string; href: string };

const MODULE_LABEL: Record<Module, string> = {
  financeiro: "Financeiro",
  inventario: "Inventário",
  associados: "Associados",
};
const TRANSITION_BADGE = { critico: "destructive", aviso: "caution", iniciada: "info" } as const;
const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Início geral: o que precisa de atenção nos módulos (só o que tem algo a fazer), os vencimentos de registro, as datas e
 * transições dos associados e um cartão por módulo com os números principais. Os detalhes ficam no Resumo de cada módulo (/financeiro, /inventario).
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ avisos?: string }> }) {
  const { avisos } = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const year = currentYear();
  const today = todayInSaoPaulo();

  // Sem acesso a um módulo: nada dele. Sem acesso ao Associados (chefes): só os avisos dos jovens da própria seção.
  const finance = member.finance.canRead;
  const associatesFull = member.associates.canRead;
  const [months, pendingDocs, accounts, overdue, openLines, inventory, associates, entriesReview, associatesReview] =
    await Promise.all([
      finance ? financeHome.yearMonths(db, groupId, year) : Promise.resolve([]),
      finance ? financeHome.pendingDocuments(db, groupId) : Promise.resolve(0),
      finance ? financeHome.accountBalances(db, groupId, today) : Promise.resolve([]),
      finance ? financeHome.overdueFees(db, groupId, year) : Promise.resolve([]),
      member.finance.canReview ? financeHome.openStatementLines(db, groupId) : Promise.resolve(0),
      inventoryOverview(db, groupId, today, member.inventory.canReview),
      associatesFull
        ? associatesOverview(db, groupId, today, { associateId: member.associateId, wholeGroup: avisos === "grupo" })
        : sectionOverview(db, groupId, today),
      member.finance.canReview ? entriesToReview(db, groupId) : Promise.resolve(0),
      member.associates.canReview ? associatesToReview(db, groupId) : Promise.resolve(0),
    ]);
  const income = months.reduce((sum, m) => sum + m.income, 0);
  const expense = months.reduce((sum, m) => sum + m.expense, 0);
  const inAccounts = accounts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);

  const plural = (count: number, one: string, many: string) => `${count === 1 ? one : many}`;
  const lateTransitions = associates.transitions.filter((t) => t.level === "critico").length;
  const expired = associates.expiries.filter((e) => e.days < 0).length;
  const expiring = associates.expiries.length - expired;
  const starsLate = associates.stars.filter((s) => s.star.dueOn <= today).length;
  // Escotista com acesso ao Associados: avisos da própria seção (padrão) ou do grupo todo.
  const sectionLabel = associates.sections.length === 1 ? associates.sections[0].name : "Minhas seções";
  const scopeTabs =
    associatesFull && associates.sections.length > 0 ? (
      <SectionTabs
        label="Avisos de associados"
        tabs={[
          { href: "/", label: sectionLabel, active: associates.sectionOnly },
          { href: "/?avisos=grupo", label: "Grupo todo", active: !associates.sectionOnly },
        ]}
      />
    ) : undefined;
  const scopeNote =
    associates.sectionOnly && associates.sections.length > 0
      ? ` (${associates.sections.map((s) => s.name).join(", ")})`
      : "";
  const canQuick = member.finance.canWrite || member.inventory.canWrite || member.associates.canWrite;
  const alerts: Alert[] = (
    [
      {
        module: "financeiro",
        count: entriesReview,
        label: plural(entriesReview, "lançamento para revisar", "lançamentos para revisar"),
        href: REVIEW_HREF.financeiro,
      },
      {
        module: "financeiro",
        count: pendingDocs,
        label: plural(pendingDocs, "lançamento sem documento na pasta", "lançamentos sem documento na pasta"),
        href: `/financeiro/lancamentos/movimentacoes?pasta=pendente&de=${ALL_DATES}`,
      },
      {
        module: "financeiro",
        count: overdue.length,
        label: plural(overdue.length, "associado com mensalidade atrasada", "associados com mensalidade atrasada"),
        href: "/financeiro/mensalidades/controle?atrasados=1",
      },
      {
        module: "financeiro",
        count: openLines,
        label: plural(openLines, "linha do extrato a conciliar", "linhas do extrato a conciliar"),
        href: "/financeiro/extrato/conciliar",
      },
      {
        module: "inventario",
        count: inventory.pendingReview ?? 0,
        label: plural(inventory.pendingReview ?? 0, "movimento para revisar", "movimentos para revisar"),
        href: "/inventario/movimentacoes?revisao=para_revisar",
      },
      {
        module: "inventario",
        count: inventory.belowMinimum,
        label: plural(inventory.belowMinimum, "material abaixo do mínimo", "materiais abaixo do mínimo"),
        href: "/inventario/materiais?alerta=1",
      },
      {
        module: "inventario",
        count: inventory.expired,
        label: plural(inventory.expired, "lote vencido", "lotes vencidos"),
        href: "/inventario/materiais?validade=vencido",
      },
      {
        module: "associados",
        count: associatesReview,
        label: plural(
          associatesReview,
          "cadastro do registro rápido para revisar",
          "cadastros do registro rápido para revisar",
        ),
        href: REVIEW_HREF.associados,
      },
      {
        module: "associados",
        count: lateTransitions,
        label: plural(
          lateTransitions,
          "jovem que já devia ter passado de ramo",
          "jovens que já deviam ter passado de ramo",
        ),
        href: "/#transitions-title",
      },
      {
        module: "associados",
        count: associates.pending.jovem,
        label: plural(
          associates.pending.jovem,
          "pendência no controle dos jovens",
          "pendências no controle dos jovens",
        ),
        href: "/associados/controle?pendencias=1",
      },
      {
        module: "associados",
        count: associates.pending.adulto,
        label: plural(
          associates.pending.adulto,
          "pendência no controle dos adultos",
          "pendências no controle dos adultos",
        ),
        href: "/associados/controle?publico=adultos&pendencias=1",
      },
      {
        module: "associados",
        count: starsLate,
        label: plural(starsLate, "estrela de atividade a entregar", "estrelas de atividade a entregar"),
        href: associatesFull ? "/associados/vida-escoteira?ver=entregar" : "/#stars-title",
      },
      {
        module: "associados",
        count: expired,
        label: plural(expired, "registro vencido", "registros vencidos"),
        href: "/#expiries-title",
      },
      {
        module: "associados",
        count: expiring,
        label: plural(
          expiring,
          `registro vencendo em ${VALIDITY_WARNING_DAYS} dias`,
          `registros vencendo em ${VALIDITY_WARNING_DAYS} dias`,
        ),
        href: "/#expiries-title",
      },
      {
        module: "inventario",
        count: inventory.expiringSoon,
        label: plural(
          inventory.expiringSoon,
          `lote vencendo em ${EXPIRY_WARNING_DAYS} dias`,
          `lotes vencendo em ${EXPIRY_WARNING_DAYS} dias`,
        ),
        href: "/inventario/materiais?validade=valido&ordem=validade",
      },
    ] satisfies Alert[]
  ).filter((alert) => alert.count > 0);

  // Listas vazias viram uma linha em "Sem novidades", em vez de uma caixa vazia cada.
  const quiet = [
    ...(associatesFull && associates.expiries.length === 0
      ? [{ title: "Vencimentos de registro", text: `nenhum vencimento de registro próximo` }]
      : []),
    ...(associates.stars.length === 0
      ? [
          {
            title: "Estrelas de atividade",
            text: `nenhuma estrela de atividade`,
          },
        ]
      : []),
    ...(associates.dates.length === 0
      ? [
          {
            title: "Aniversários e promessas",
            text: `nenhum aniversário ou aniversário de promessa`,
          },
        ]
      : []),
    ...(associates.transitions.length === 0
      ? [{ title: "Transição de ramo", text: `nenhum jovem em período de transição${scopeNote}` }]
      : []),
  ];

  return (
    <div className="shell">
      <GestaoHeader current="/" member={member} quick={canQuick} />
      <PageBody>
        {/* Registro rápido é a ação principal do Início (primário, à direita); as demais, conforme as permissões, são
          secundárias e ficam à esquerda dele. */}
        <PageHeader
          title="Início"
          hideTitle
          tabs={scopeTabs}
          actions={
            <>
              {member.finance.canWrite && <NewEntryButton returnHref="" variant="outline" />}
              {member.inventory.canWrite && (
                <Link href="/inventario/materiais/novo" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  <IconPlus data-icon="inline-start" /> Novo material
                </Link>
              )}
              {canQuick && (
                <Link href="/rapido" className={buttonVariants({ size: "lg" })}>
                  <IconBolt data-icon="inline-start" /> Registro rápido
                </Link>
              )}
            </>
          }
        />

        {/* Mosaico: cada cartão com a altura que precisa, encaixado na coluna (3 em tela larga, 2 no tablet, 1 no celular). */}
        <div className="columns-1 gap-5 md:columns-2 xl:columns-3 [&>*]:mb-5 [&>*]:break-inside-avoid">
          <ListCard
            title="Precisa de atenção"
            titleId="attention-title"
            empty={
              <span className="inline-flex items-center gap-1.5 text-success">
                <IconCircleCheck className="size-4" aria-hidden /> Nada pendente nos módulos.
              </span>
            }
          >
            {alerts.length > 0 && (
              <ul className="m-0 list-none p-0">
                {alerts.map((alert) => (
                  <li key={alert.label} className="border-t first:border-t-0">
                    <Link href={alert.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted">
                      <span className="min-w-8 rounded-full bg-caution-soft px-2 py-0.5 text-center num text-xs font-bold text-caution">
                        {alert.count}
                      </span>
                      <span className="min-w-0 flex-1">{alert.label}</span>
                      <span
                        className={cn(
                          "shrink-0 text-[11px] font-bold tracking-wider uppercase",
                          `geas-app--${alert.module}`,
                        )}
                      >
                        {MODULE_LABEL[alert.module]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ListCard>

          {associatesFull && associates.expiries.length > 0 && (
            <ListCard
              title="Vencimentos de registro"
              titleId="expiries-title"
              href="/associados/controle"
              linkLabel="Controle"
            >
              <ul className="m-0 list-none p-0">
                {associates.expiries.map((e) => (
                  <li key={`${e.associateId}-${e.item}-${e.validUntil}`} className="border-t first:border-t-0">
                    <Link
                      href={`/associados/${e.associateId}`}
                      className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{e.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {e.item} · <span className="num">{dateBR(e.validUntil)}</span>
                        </span>
                      </span>
                      <Badge variant={e.days < 0 ? "destructive" : "caution"} className="shrink-0">
                        {e.days < 0 ? `venceu ${relativeDay(e.days)}` : `vence ${relativeDay(e.days)}`}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </ListCard>
          )}

          {associates.stars.length > 0 && (
            <ListCard
              title="Estrelas de atividade a entregar"
              titleId="stars-title"
              href={associatesFull ? "/associados/vida-escoteira?ver=entregar" : undefined}
              linkLabel="Vida escoteira"
            >
              <ul className="m-0 list-none p-0">
                {associates.stars.map((s) => (
                  <li key={s.associateId} className="border-t first:border-t-0">
                    <PersonLink
                      href={associatesFull ? `/associados/${s.associateId}/vida-escoteira` : undefined}
                      className="flex items-center gap-3 px-4 py-2 text-sm"
                    >
                      <IconAward className="size-4 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.star.n}ª estrela{s.star.branch && ` · ${lifeBranchShort(s.star.branch)}`}
                        </span>
                      </span>
                      <Badge variant={s.star.dueOn <= today ? "caution" : "info"} className="shrink-0">
                        {s.star.dueOn <= today ? `desde ${dateBR(s.star.dueOn)}` : `em ${dateBR(s.star.dueOn)}`}
                      </Badge>
                    </PersonLink>
                  </li>
                ))}
              </ul>
            </ListCard>
          )}

          {associates.dates.length > 0 && (
            <ListCard
              title="Aniversários e promessas"
              titleId="dates-title"
              href={associatesFull ? "/associados" : undefined}
              linkLabel="Associados"
            >
              <ul className="m-0 list-none p-0">
                {associates.dates.map((date) => (
                  <li key={`${date.associateId}-${date.kind}`} className="border-t first:border-t-0">
                    <PersonLink
                      href={associatesFull ? `/associados/${date.associateId}` : undefined}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2 text-sm",
                        date.days < 0 && "text-muted-foreground",
                      )}
                    >
                      {date.kind === "aniversario" ? (
                        <IconCake className="size-4 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <IconStar className="size-4 shrink-0 text-primary" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{date.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {date.kind === "aniversario"
                            ? `${date.years} anos`
                            : `${date.years} ${date.years === 1 ? "ano" : "anos"} de promessa`}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-right num text-xs",
                          date.days === 0 && "font-semibold text-primary",
                        )}
                      >
                        <span className="block">{dayMonth(date.on)}</span>
                        <span className="block">{relativeDay(date.days)}</span>
                      </span>
                    </PersonLink>
                  </li>
                ))}
              </ul>
            </ListCard>
          )}

          {associates.transitions.length > 0 && (
            <ListCard
              title="Transição de ramo"
              titleId="transitions-title"
              href={associatesFull ? "/associados" : undefined}
              linkLabel="Associados"
            >
              <ul className="m-0 list-none p-0">
                {associates.transitions.map((t) => (
                  <li key={t.associateId} className="border-t first:border-t-0">
                    <PersonLink
                      href={associatesFull ? `/associados/${t.associateId}` : undefined}
                      className="block px-4 py-2 text-sm"
                    >
                      <span className="block truncate">{t.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {t.label} · <span className="num">{ageYearsMonthsLabel(t.age)}</span>
                      </span>
                      <Badge
                        variant={TRANSITION_BADGE[t.level]}
                        className="mt-1 h-auto max-w-full text-left whitespace-normal"
                        title={`Até ${dateBR(t.criticalOn)}`}
                      >
                        {t.text}
                      </Badge>
                    </PersonLink>
                  </li>
                ))}
              </ul>
            </ListCard>
          )}
          {quiet.length > 0 && (
            <section aria-labelledby="quiet-title" className="overflow-hidden surface">
              <h2 id="quiet-title" className="m-0 border-b px-4 py-2.5 text-sm font-semibold">
                Sem novidades
              </h2>
              <ul className="m-0 list-none p-0">
                {quiet.map((item) => (
                  <li
                    key={item.title}
                    className="flex items-center gap-2.5 border-t px-4 py-2 text-xs first:border-t-0"
                  >
                    <IconCircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                    <span className="min-w-0">
                      <strong className="font-semibold">{item.title}:</strong>{" "}
                      <span className="text-muted-foreground">{item.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {finance && (
            <ModuleCard module="financeiro" href="/financeiro" linkLabel="Resumo do financeiro">
              <StatCard
                label="Saldo nas contas hoje"
                value={formatCents(inAccounts)}
                tone={inAccounts < 0 ? "destructive" : "neutral"}
              />
              <StatCard
                label={`Saldo de ${year}`}
                value={formatCents(income - expense)}
                tone={income - expense < 0 ? "destructive" : "neutral"}
              />
              <StatCard label={`Receitas em ${year}`} value={formatCents(income)} tone="success" />
              <StatCard label={`Despesas em ${year}`} value={formatCents(expense)} tone="destructive" />
            </ModuleCard>
          )}
          {member.inventory.canRead && (
            <ModuleCard module="inventario" href="/inventario/materiais" linkLabel="Materiais do inventário">
              <StatCard label="Materiais" value={inventory.materials} href="/inventario/materiais" />
              <StatCard label="Valor estimado" value={formatCents(inventory.estimatedValueCents)} />
              <StatCard
                label="Abaixo do mínimo"
                value={inventory.belowMinimum}
                tone={inventory.belowMinimum > 0 ? "warning" : "neutral"}
              />
              <StatCard
                label="Lotes vencidos"
                value={inventory.expired}
                tone={inventory.expired > 0 ? "destructive" : "neutral"}
                href={inventory.expired > 0 ? "/inventario/materiais?validade=vencido" : undefined}
              />
            </ModuleCard>
          )}
          <section aria-labelledby="links-title" className="overflow-hidden surface">
            <h2 id="links-title" className="m-0 border-b px-4 py-2.5 text-sm font-semibold">
              Links úteis
            </h2>
            <ul className="m-0 list-none p-0">
              {USEFUL_LINKS.map((link) => (
                <li key={link.href} className="border-t first:border-t-0">
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{link.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{link.description}</span>
                    </span>
                    <IconExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="sr-only">(abre em outra aba)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </PageBody>
    </div>
  );
}

/** Linha de uma pessoa: link para o cadastro, ou só o texto para quem não vê o Associados. */
function PersonLink({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  return href ? (
    <Link href={href} className={cn(className, "hover:bg-muted")}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** Cartão de um módulo: nome na cor do módulo, quatro indicadores e o link para o Resumo dele. */
function ModuleCard({
  module,
  href,
  linkLabel,
  children,
}: {
  module: Module;
  href: string;
  linkLabel: string;
  children: ReactNode;
}) {
  const titleId = `${module}-card-title`;
  return (
    <section aria-labelledby={titleId} className="grid gap-3 surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className={cn("m-0 text-sm font-bold tracking-[.16em] uppercase", `geas-app--${module}`)}>
          {MODULE_LABEL[module]}
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          {linkLabel} <IconArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </section>
  );
}
