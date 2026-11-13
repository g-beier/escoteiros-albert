import Link from "next/link";
import { IconAlertTriangle, IconArrowRight, IconClockExclamation, IconPlus } from "@tabler/icons-react";
import { PageBody, PageHeader } from "@geas/ui";
import { buttonVariants } from "@geas/ui/components/button";
import { ListCard, StatCard } from "@geas/ui/components/stat-card";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/app-header";
import { SetupNeeded } from "@/components/setup-needed";
import { EXPIRY_WARNING_DAYS, MOVEMENT_LABELS, REVIEW_LABELS, dateBR, daysUntil, relatedName, timestampBR, type MovementKind, type ReviewStatus } from "@/lib/inventory";
import { money } from "@/lib/money";
import { pageSession } from "@/lib/session";

const SHOWN = 8;

/** Hoje + n dias (yyyy-mm-dd) no fuso de São Paulo. */
function dayInSaoPaulo(offset: number) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function expiryLabel(date: string) {
  const days = daysUntil(date);
  if (days < 0) return `vencido em ${dateBR(date)}`;
  if (days === 0) return "vence hoje";
  return `vence em ${dateBR(date)}`;
}

export default async function Dashboard() {
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const groupId = member.groupId;
  const [materials, expiring, paths, pending, recent] = await Promise.all([
    supabase.from("inventory_material_rows").select("id, name, quantity, minimum_quantity, estimated_value_cents, below_minimum").eq("group_id", groupId).eq("active", true).order("name"),
    supabase.from("inventory_lots").select("id, quantity, expires_on, location_id, material_id, inventory_materials(name)").eq("group_id", groupId)
      .gt("quantity", 0).not("expires_on", "is", null).lte("expires_on", dayInSaoPaulo(EXPIRY_WARNING_DAYS)).order("expires_on").limit(100),
    supabase.from("inventory_location_paths").select("id, path").eq("group_id", groupId),
    member.canManage
      ? supabase.from("inventory_movements").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("review_status", "pendente")
      : Promise.resolve({ count: 0 }),
    supabase.from("inventory_movements").select("id, kind, quantity, created_at, review_status, material_id, from_location_id, to_location_id, inventory_materials(name)").eq("group_id", groupId)
      .order("created_at", { ascending: false }).limit(SHOWN),
  ]);
  const rows = materials.data ?? [];
  const pathOf = new Map((paths.data ?? []).map((p) => [p.id as string, p.path as string]));
  const low = rows.filter((m) => m.below_minimum);
  const lots = expiring.data ?? [];
  const expired = lots.filter((lot) => daysUntil(lot.expires_on as string) < 0).length;
  const expiringSoon = lots.length - expired;
  const totalValue = rows.reduce((sum, m) => sum + Number(m.estimated_value_cents ?? 0), 0);
  const pendingCount = pending.count ?? 0;
  const movements = recent.data ?? [];

  return <div className="shell">
    <AppHeader current="/" email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody>
      <PageHeader title="Resumo do inventário" hideTitle actions={<>
        <Link href="/materiais" className={buttonVariants({ variant: "outline", size: "lg" })}>Ver materiais <IconArrowRight data-icon="inline-end" /></Link>
        {member.canEdit && <Link href="/materiais/novo" className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Novo material</Link>}
      </>} />

      <section aria-label="Totais" className={cn("grid gap-3 sm:grid-cols-2 md:grid-cols-3", member.canManage ? "xl:grid-cols-6" : "xl:grid-cols-5")}>
        <StatCard label="Materiais" value={rows.length} href="/materiais" />
        <StatCard label="Valor estimado" value={money(totalValue)} />
        <StatCard label="Abaixo do mínimo" value={low.length} tone={low.length > 0 ? "warning" : "neutral"}
          icon={low.length > 0 && <IconAlertTriangle className="size-5" aria-hidden />} />
        <StatCard label="Lotes vencidos" value={expired} tone={expired > 0 ? "destructive" : "neutral"}
          icon={expired > 0 && <IconClockExclamation className="size-5" aria-hidden />} />
        <StatCard label={`Vencendo em ${EXPIRY_WARNING_DAYS} dias`} value={expiringSoon} tone={expiringSoon > 0 ? "warning" : "neutral"} />
        {member.canManage && <StatCard label="Pendentes de revisão" value={pendingCount} tone={pendingCount > 0 ? "warning" : "neutral"}
          href={pendingCount > 0 ? "/movimentacoes?revisao=pendente" : undefined} />}
      </section>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <ListCard title="Validade" titleId="expiry-title" empty={`Nenhum lote vencido ou vencendo nos próximos ${EXPIRY_WARNING_DAYS} dias.`}>
          {lots.length > 0 && <ul className="m-0 list-none p-0">{lots.slice(0, SHOWN).map((lot) => {
            const days = daysUntil(lot.expires_on as string);
            return <li key={lot.id} className="border-t first:border-t-0">
              <Link href={`/materiais/${lot.material_id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{relatedName(lot.inventory_materials)}</span>
                  <span className="block truncate text-muted-foreground">{pathOf.get(lot.location_id as string)} · {lot.quantity} un.</span>
                </span>
                <span className={cn("num shrink-0 rounded-full px-2 py-0.5 font-semibold", days < 0 ? "bg-destructive/10 text-destructive" : "bg-[#f5eed1] text-[#725d0d]")}>{expiryLabel(lot.expires_on as string)}</span>
              </Link>
            </li>;
          })}
            {lots.length > SHOWN && <li className="border-t px-4 py-2 text-xs text-muted-foreground">e mais {lots.length - SHOWN} {lots.length - SHOWN === 1 ? "lote" : "lotes"}</li>}
          </ul>}
        </ListCard>

        <ListCard title="Abaixo do mínimo" titleId="low-title" href="/materiais" linkLabel="Ver materiais" empty="Nenhum material abaixo do estoque mínimo.">
          {low.length > 0 && <ul className="m-0 list-none p-0">{low.slice(0, SHOWN).map((m) => <li key={m.id} className="border-t first:border-t-0">
            <Link href={`/materiais/${m.id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="num shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">{m.quantity} de {m.minimum_quantity}</span>
            </Link>
          </li>)}
            {low.length > SHOWN && <li className="border-t px-4 py-2 text-xs text-muted-foreground">e mais {low.length - SHOWN} {low.length - SHOWN === 1 ? "material" : "materiais"}</li>}
          </ul>}
        </ListCard>

        <ListCard title="Movimentações recentes" titleId="movements-title" href="/movimentacoes" empty="Nenhuma movimentação registrada." className="lg:max-xl:col-span-2">
          {movements.length > 0 && <ul className="m-0 list-none p-0">{movements.map((movement) => {
            const where = pathOf.get((movement.to_location_id ?? movement.from_location_id) as string);
            return <li key={movement.id} className="border-t first:border-t-0">
            <Link href={`/materiais/${movement.material_id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{relatedName(movement.inventory_materials)}</span>
                <span className="block truncate text-muted-foreground">
                  {[MOVEMENT_LABELS[movement.kind as MovementKind], movement.quantity != null ? `${movement.quantity} un.` : null, where].filter(Boolean).join(" · ")}
                </span>
              </span>
              {movement.review_status !== "revisado" && <span className="shrink-0 rounded-full bg-[#f5eed1] px-2 py-0.5 text-[11px] font-semibold text-[#725d0d]"
                title={REVIEW_LABELS[movement.review_status as ReviewStatus]}>{movement.review_status === "pendente" ? "Pendente" : "Para revisar"}</span>}
              <span className="num shrink-0 text-muted-foreground">{timestampBR(movement.created_at as string)}</span>
            </Link>
          </li>; })}</ul>}
        </ListCard>
      </div>
    </PageBody>
  </div>;
}
