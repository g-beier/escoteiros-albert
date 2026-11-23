import { Link } from "@geas/ui/components/link";
import { redirect } from "next/navigation";
import { IconChevronRight, IconCircleCheck, IconPlus, IconSearch } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { cn } from "@geas/ui/lib/utils";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { ATTACHMENTS_ENABLED } from "@/lib/features";
import { QUICK_DONE, isQuickDone, type QuickDone } from "@/lib/quick";
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
 * Registro rápido (celular), comum aos módulos: lançamento financeiro, associado novo e as ações do inventário (busca
 * o material e escolhe a ação, ou cadastra um novo). Cada um aparece para quem edita o módulo. Tudo o que for
 * registrado aqui fica para revisar na lista do módulo.
 */
export default async function QuickHome({ searchParams }: { searchParams: Promise<{ q?: string; feito?: string; id?: string }> }) {
  const { q = "", feito, id } = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const can = { financeiro: member.finance.canWrite, inventario: member.inventory.canWrite, associados: member.associates.canWrite };
  if (!can.financeiro && !can.inventario && !can.associados) redirect("/");
  const search = can.inventario ? q.trim() : "";
  const rows = search ? (await materials.list(member.db, member.groupId, { includeInactive: false, search }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : [];
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

      {(can.financeiro || can.associados) && <SectionCard>
        <SectionHeader title="Registrar" />
        <ul className="m-0 list-none p-0">
          {can.financeiro && <li className="border-t first:border-t-0"><Link href="/rapido/lancamento" className={BIG_LINK}>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Lançamento financeiro</span>
              <span className="block text-xs text-muted-foreground">Uma despesa ou receita{ATTACHMENTS_ENABLED && ", com foto do comprovante"}.</span></span>
            <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link></li>}
          {can.associados && <li className="border-t first:border-t-0"><Link href="/rapido/associado" className={BIG_LINK}>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Associado novo</span>
              <span className="block text-xs text-muted-foreground">Nome, ramo e datas; a Diretoria completa.</span></span>
            <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link></li>}
        </ul>
      </SectionCard>}

      {can.inventario && <section aria-labelledby="quick-inventory" className="grid gap-3">
        <h2 id="quick-inventory" className="m-0 text-sm font-semibold">Inventário</h2>
        <form action="/rapido" className="flex gap-2" role="search">
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" type="search" defaultValue={search} aria-label="Buscar material" placeholder="Nome, etiqueta, família…"
              className="h-11 pl-9 text-sm" />
          </div>
          <button type="submit" className={cn(buttonVariants({ size: "lg" }), "h-11 text-sm")}>Buscar</button>
        </form>
        {search && <SectionCard>
          {rows.length === 0
            ? <p className="m-0 px-4 py-6 text-center text-xs text-muted-foreground">Nenhum material encontrado. Confira o nome ou cadastre um novo.</p>
            : <ul className="m-0 list-none p-0">{rows.slice(0, SHOWN).map((row) => <li key={row.id} className="border-t first:border-t-0">
              <Link href={`/rapido/inventario/${row.id}`} className={BIG_LINK}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{row.name}</span>
                  <span className={cn("num block text-xs text-muted-foreground", row.below_minimum && "text-destructive")}>{row.quantity} em estoque{row.below_minimum && " · abaixo do mínimo"}</span>
                </span>
                <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>)}</ul>}
          {rows.length > SHOWN && <p className="m-0 border-t px-4 py-2 text-xs text-muted-foreground">Mostrando {SHOWN} de {rows.length}: refine a busca.</p>}
        </SectionCard>}
        <Link href="/rapido/inventario/novo" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 text-sm")}>
          <IconPlus data-icon="inline-start" /> Cadastrar material novo
        </Link>
      </section>}
    </PageBody>
  </div>;
}
