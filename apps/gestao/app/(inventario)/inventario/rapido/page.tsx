import Link from "next/link";
import { redirect } from "next/navigation";
import { IconChevronRight, IconCircleCheck, IconPlus, IconSearch } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { SectionCard } from "@geas/ui/components/section-card";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/inventory/app-header";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { QUICK_DONE, isQuickKind } from "@/lib/inventory/quick";
import * as materials from "@/lib/server/inventory/materials";
import { pageSession } from "@/lib/server/session";

const SHOWN = 30;

/** Registro rápido (celular): busca o material e escolhe a ação. Tudo o que é registrado aqui fica para revisar. */
export default async function QuickHome({ searchParams }: { searchParams: Promise<{ q?: string; feito?: string; material?: string }> }) {
  const { q = "", feito, material } = await searchParams;
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canEdit) redirect("/inventario/materiais");
  const search = q.trim();
  const rows = search ? (await materials.list(member.db, member.groupId, { includeInactive: false, search }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : [];
  const done = isQuickKind(feito) ? QUICK_DONE[feito] : null;

  return <div className="shell">
    <AppHeader current="/inventario/rapido" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Registro rápido" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Registro rápido" }]}
        description="Para usar no celular, na hora: retirar, dar entrada, mudar condição, transferir, ajustar ou cadastrar. Tudo o que for registrado aqui fica para revisar pelo gestor." />
      {done && <p role="status" className="surface m-0 flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
        <IconCircleCheck className="size-5 shrink-0 text-success" aria-hidden />
        <span className="flex-1">{done}. Fica para revisar.</span>
        {material && /^[0-9a-f-]{36}$/i.test(material) && <Link href={`/inventario/rapido/${material}`} className="text-xs font-semibold text-primary hover:underline">Outra ação neste material</Link>}
      </p>}
      <form action="/inventario/rapido" className="flex gap-2" role="search">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" type="search" defaultValue={search} aria-label="Buscar material" placeholder="Nome, etiqueta, família…" autoFocus={!done}
            className="h-11 pl-9 text-sm" />
        </div>
        <button type="submit" className={cn(buttonVariants({ size: "lg" }), "h-11 text-sm")}>Buscar</button>
      </form>
      {search && <SectionCard>
        {rows.length === 0
          ? <p className="m-0 px-4 py-6 text-center text-xs text-muted-foreground">Nenhum material encontrado. Confira o nome ou cadastre um novo.</p>
          : <ul className="m-0 list-none p-0">{rows.slice(0, SHOWN).map((row) => <li key={row.id} className="border-t first:border-t-0">
            <Link href={`/inventario/rapido/${row.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{row.name}</span>
                <span className={cn("num block text-xs text-muted-foreground", row.below_minimum && "text-destructive")}>{row.quantity} em estoque{row.below_minimum && " · abaixo do mínimo"}</span>
              </span>
              <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>)}</ul>}
        {rows.length > SHOWN && <p className="m-0 border-t px-4 py-2 text-xs text-muted-foreground">Mostrando {SHOWN} de {rows.length}: refine a busca.</p>}
      </SectionCard>}
      <Link href="/inventario/rapido/novo" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 text-sm")}>
        <IconPlus data-icon="inline-start" /> Cadastrar material novo
      </Link>
    </PageBody>
  </div>;
}
