import Link from "next/link";
import { IconAlertTriangle, IconArrowRight, IconPlus } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { ListCard, StatCard } from "@geas/ui/components/stat-card";
import { AppHeader } from "@/components/app-header";
import { SetupNeeded } from "@/components/setup-needed";
import { MOVEMENT_LABELS, dateTimeBR, relatedName, type MovementType } from "@/lib/inventory";
import { pageSession } from "@/lib/session";

const LOW_SHOWN = 8;

export default async function Dashboard() {
  const { supabase, user, membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const [items, locations, movements] = await Promise.all([
    supabase.from("inventory_items").select("id,name,category,quantity,minimum_quantity").eq("group_id", membership.groupId).eq("active", true).order("name"),
    supabase.from("inventory_locations").select("id", { count: "exact", head: true }).eq("group_id", membership.groupId).eq("active", true),
    supabase.from("inventory_movements").select("id,movement_type,quantity,occurred_at,inventory_items(name)").eq("group_id", membership.groupId).order("occurred_at", { ascending: false }).limit(8),
  ]);
  const rows = items.data ?? [];
  const low = rows.filter((item) => item.quantity <= item.minimum_quantity);
  const totalUnits = rows.reduce((sum, item) => sum + item.quantity, 0);
  const recent = movements.data ?? [];

  return <div className="shell">
    <AppHeader current="/" email={user.email ?? ""} role={membership.role} />
    <PageBody>
      <PageHeader title="Resumo do inventário" hideTitle actions={<>
        <Link href="/itens" className={buttonVariants({ variant: "outline", size: "lg" })}>Ver itens <IconArrowRight data-icon="inline-end" /></Link>
        {membership.canEdit && <Link href="/itens#novo" className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Cadastrar item</Link>}
      </>} />

      <section aria-label="Totais" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Itens cadastrados" value={rows.length} href="/itens" />
        <StatCard label="Unidades em estoque" value={totalUnits} />
        <StatCard label="Locais" value={locations.count ?? 0} href="/locais" />
        <StatCard label="Abaixo do mínimo" value={low.length} tone={low.length > 0 ? "warning" : "neutral"}
          icon={low.length > 0 && <IconAlertTriangle className="size-5" aria-hidden />} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListCard title="Abaixo do mínimo" titleId="low-title" href="/itens" linkLabel="Ver itens" empty="Nenhum item abaixo do estoque mínimo.">
          {low.length > 0 && <ul className="m-0 list-none p-0">{low.slice(0, LOW_SHOWN).map((item) => <li key={item.id} className="flex items-center gap-3 border-t px-4 py-2 text-xs first:border-t-0">
            <span className="min-w-0 flex-1 truncate">{item.name}{item.category && <span className="text-muted-foreground"> · {item.category}</span>}</span>
            <span className="num shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">{item.quantity} de {item.minimum_quantity}</span>
          </li>)}
            {low.length > LOW_SHOWN && <li className="border-t px-4 py-2 text-xs text-muted-foreground">e mais {low.length - LOW_SHOWN} {low.length - LOW_SHOWN === 1 ? "item" : "itens"}</li>}
          </ul>}
        </ListCard>

        <ListCard title="Movimentações recentes" titleId="movements-title" href="/movimentacoes" empty="Nenhuma movimentação registrada.">
          {recent.length > 0 && <ul className="m-0 list-none p-0">{recent.map((movement) => <li key={movement.id} className="flex items-center gap-3 border-t px-4 py-2 text-xs first:border-t-0">
            <span className="num w-20 shrink-0 text-muted-foreground">{dateTimeBR(movement.occurred_at)}</span>
            <span className="min-w-0 flex-1 truncate">{relatedName(movement.inventory_items)}</span>
            <span className="shrink-0 text-muted-foreground">{MOVEMENT_LABELS[movement.movement_type as MovementType]}</span>
            <span className="num w-10 shrink-0 text-right font-semibold">{movement.quantity}</span>
          </li>)}</ul>}
        </ListCard>
      </div>
    </PageBody>
  </div>;
}
