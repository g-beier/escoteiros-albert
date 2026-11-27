import { Link } from "@geas/ui/components/link";
import { redirect } from "next/navigation";
import { IconChevronRight, IconCircleCheck, IconSearch } from "@tabler/icons-react";
import { SaleMark } from "@/components/inventory/sale-mark";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { cn } from "@geas/ui/lib/utils";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { ATTACHMENTS_ENABLED } from "@/lib/features";
import { QUICK_DONE, isQuickDone, type QuickDone } from "@/lib/quick";
import { placementLabel } from "@/lib/associates/model";
import { searchTerms } from "@/lib/inventory/search";
import * as associatesData from "@/lib/server/associates/associates";
import * as materials from "@/lib/server/inventory/materials";
import { pageSession } from "@/lib/server/session";

const SHOWN = 30;
const UUID = /^[0-9a-f-]{36}$/i;

/** Link do aviso de confirmação: abrir o que acabou de ser registrado. */
function doneLink(kind: QuickDone, id: string | undefined) {
  if (!id || !UUID.test(id)) return null;
  if (kind === "lancamento") return { href: `/financeiro/lancamentos/${id}`, label: "Abrir o lançamento" };
  if (kind === "associado") return { href: `/associados/${id}`, label: "Abrir o cadastro" };
  return { href: `/rapido/inventario/${id}`, label: "Outra ação neste material" };
}

const BIG_LINK = "flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted";

/**
 * Registro rápido (celular), comum aos módulos. No topo, uma busca só: materiais (para quem registra no Inventário:
 * abre as ações do material) e associados (para quem vê o Associados: abre o cadastro). Embaixo, "Registrar":
 * lançamento financeiro, associado novo e material novo, cada um para quem registra no módulo. Tudo o que for
 * registrado aqui fica para revisar na lista do módulo.
 */
export default async function QuickHome({ searchParams }: { searchParams: Promise<{ q?: string; feito?: string; id?: string }> }) {
  const { q = "", feito, id } = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const can = { financeiro: member.finance.canWrite, inventario: member.inventory.canWrite, associados: member.associates.canWrite };
  if (!can.financeiro && !can.inventario && !can.associados) redirect("/");
  const find = { materiais: can.inventario, associados: member.associates.canRead };
  const search = find.materiais || find.associados ? q.trim() : "";
  const [rows, people] = await Promise.all([
    search && find.materiais ? materials.list(member.db, member.groupId, { includeInactive: false, search })
      .then((list) => list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) : Promise.resolve([]),
    search && find.associados ? associatesData.search(member.db, member.groupId, searchTerms(search), SHOWN) : Promise.resolve([]),
  ]);
  // o rótulo (aria-label) diz o que se busca; o exemplo é curto para caber no celular
  const placeholder = find.materiais ? "Nome, etiqueta, família…" : "Nome ou apelido";
  const done = isQuickDone(feito) ? feito : null;
  const link = done && doneLink(done, id);

  return <div className="shell">
    <GestaoHeader current="/rapido" member={member} quick />
    <PageBody width="narrow">
      <PageHeader title="Registro rápido" crumbs={[{ label: "Registro rápido" }]}
        description="Para usar no celular, na hora. Tudo o que for registrado aqui entra já e fica para revisar na lista do módulo." />
      {done && <p role="status" className="surface m-0 flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <IconCircleCheck className="size-5 shrink-0 text-success" aria-hidden />
        <span className="flex-1">{QUICK_DONE[done]}. Fica para revisar.</span>
        {link && <Link href={link.href} className="text-xs font-semibold text-primary hover:underline">{link.label}</Link>}
      </p>}

      {(find.materiais || find.associados) && <section aria-labelledby="quick-search" className="grid gap-3">
        <h2 id="quick-search" className="m-0 text-sm font-semibold">Buscar</h2>
        <form action="/rapido" className="flex gap-2" role="search">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" type="search" defaultValue={search} aria-label={find.materiais && find.associados ? "Buscar material ou associado" : find.materiais ? "Buscar material" : "Buscar associado"}
              placeholder={placeholder} className="h-11 pl-9 text-sm" />
          </div>
          <button type="submit" className={cn(buttonVariants({ size: "lg" }), "h-11 text-sm")}>Buscar</button>
        </form>
        {search && <SectionCard>
          {rows.length === 0 && people.length === 0
            ? <p className="m-0 px-4 py-6 text-center text-xs text-muted-foreground">Nada encontrado. Confira o nome{find.materiais ? " ou cadastre um material novo" : ""}.</p>
            : <>
              {find.materiais && rows.length > 0 && <ResultGroup title="Materiais" more={rows.length > SHOWN ? `Mostrando ${SHOWN} de ${rows.length}: refine a busca.` : undefined}>
                {rows.slice(0, SHOWN).map((row) => <li key={row.id} className="border-t first:border-t-0">
                  <Link href={`/rapido/inventario/${row.id}`} className={BIG_LINK}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm"><span className="truncate">{row.name}</span>{row.for_sale && <SaleMark priceCents={row.sale_price_cents} />}</span>
                      <span className={cn("num block text-xs text-muted-foreground", row.below_minimum && "text-destructive")}>{row.quantity} em estoque{row.below_minimum && " · abaixo do mínimo"}</span>
                    </span>
                    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>)}
              </ResultGroup>}
              {find.associados && people.length > 0 && <ResultGroup title="Associados" more={people.length > SHOWN ? `Mais de ${SHOWN}: refine a busca.` : undefined}>
                {people.slice(0, SHOWN).map((person) => <li key={person.id} className="border-t first:border-t-0">
                  <Link href={`/associados/${person.id}`} className={BIG_LINK}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{person.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{placementLabel(person)}</span>
                    </span>
                    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>)}
              </ResultGroup>}
            </>}
        </SectionCard>}
      </section>}

      <SectionCard>
        <SectionHeader title="Registrar" />
        <ul className="m-0 list-none p-0">
          {can.financeiro && <RegisterLink href="/rapido/lancamento" title="Lançamento financeiro" text={`Uma despesa ou receita${ATTACHMENTS_ENABLED ? ", com foto do comprovante" : ""}.`} />}
          {can.associados && <RegisterLink href="/rapido/associado" title="Associado novo" text="Nome, ramo e datas; a Diretoria completa." />}
          {can.inventario && <RegisterLink href="/rapido/inventario/novo" title="Material novo" text="Cadastro com a primeira entrada; para um material que já existe, busque acima." />}
        </ul>
      </SectionCard>
    </PageBody>
  </div>;
}

/** Grupo de resultados da busca (Materiais, Associados), com subtítulo. */
function ResultGroup({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  return <div className="border-t first:border-t-0">
    <h3 className="m-0 bg-muted/60 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{title}</h3>
    <ul className="m-0 list-none p-0">{children}</ul>
    {more && <p className="m-0 border-t px-4 py-2 text-xs text-muted-foreground">{more}</p>}
  </div>;
}

function RegisterLink({ href, title, text }: { href: string; title: string; text: string }) {
  return <li className="border-t first:border-t-0"><Link href={href} className={BIG_LINK}>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs text-muted-foreground">{text}</span></span>
    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  </Link></li>;
}
