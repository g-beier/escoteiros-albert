import { redirect } from "next/navigation";

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
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  const { db, groupId } = member;
  const [rows, lots, paths, pendingCount, movements] = await Promise.all([
    materialsData.summary(db, groupId),
    materialsData.expiringLots(db, groupId, dayInSaoPaulo(EXPIRY_WARNING_DAYS)),
    locations.listPaths(db, groupId),
    member.inventory.canManage ? movementsData.pendingCount(db, groupId) : Promise.resolve(0),
    movementsData.list(db, groupId, {}, SHOWN),
  ]);
  const pathOf = new Map(paths.map((p) => [p.id, p.path]));
  const low = rows.filter((m) => m.below_minimum);
  const expired = lots.filter((lot) => daysUntil(lot.expires_on) < 0).length;
  const expiringSoon = lots.length - expired;
  const totalValue = rows.reduce((sum, m) => sum + Number(m.estimated_value_cents ?? 0), 0);

  return <div className="shell">
    <AppHeader current="/inventario" email={user.email} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody>
      <PageHeader title="Resumo do inventário" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Resumo" }]} actions={<>
        <Link href="/inventario/materiais" className={buttonVariants({ variant: "outline", size: "lg" })}>Ver materiais <IconArrowRight data-icon="inline-end" /></Link>
        {member.inventory.canEdit && <Link href="/inventario/materiais/novo" className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Novo material</Link>}
      </>} />

      <section aria-label="Totais" className={cn("grid gap-3 sm:grid-cols-2 md:grid-cols-3", member.inventory.canManage ? "xl:grid-cols-6" : "xl:grid-cols-5")}>
        <StatCard label="Materiais" value={rows.length} href="/inventario/materiais" />
        <StatCard label="Valor estimado" value={formatCents(totalValue)} />
        <StatCard label="Abaixo do mínimo" value={low.length} tone={low.length > 0 ? "warning" : "neutral"}
          icon={low.length > 0 && <IconAlertTriangle className="size-5" aria-hidden />} />
        <StatCard label="Lotes vencidos" value={expired} tone={expired > 0 ? "destructive" : "neutral"}
          icon={expired > 0 && <IconClockExclamation className="size-5" aria-hidden />} />
        <StatCard label={`Vencendo em ${EXPIRY_WARNING_DAYS} dias`} value={expiringSoon} tone={expiringSoon > 0 ? "warning" : "neutral"} />
        {member.inventory.canManage && <StatCard label="Pendentes de revisão" value={pendingCount} tone={pendingCount > 0 ? "warning" : "neutral"}
          href={pendingCount > 0 ? "/inventario/movimentacoes?revisao=pendente" : undefined} />}
      </section>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <ListCard title="Validade" titleId="expiry-title" empty={`Nenhum lote vencido ou vencendo nos próximos ${EXPIRY_WARNING_DAYS} dias.`}>
          {lots.length > 0 && <ul className="m-0 list-none p-0">{lots.slice(0, SHOWN).map((lot) => {
            const days = daysUntil(lot.expires_on);
            return <li key={lot.id} className="border-t first:border-t-0">
              <Link href={`/inventario/materiais/${lot.material_id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{lot.material_name}</span>
                  <span className="block truncate text-muted-foreground">{pathOf.get(lot.location_id)} · {lot.quantity} un.</span>
                </span>
                <span className={cn("num shrink-0 rounded-full px-2 py-0.5 font-semibold", days < 0 ? "bg-destructive/10 text-destructive" : "bg-[#f5eed1] text-[#725d0d]")}>{expiryLabel(lot.expires_on)}</span>
              </Link>
            </li>;
          })}
            {lots.length > SHOWN && <li className="border-t px-4 py-2 text-xs text-muted-foreground">e mais {lots.length - SHOWN} {lots.length - SHOWN === 1 ? "lote" : "lotes"}</li>}
          </ul>}
        </ListCard>

        <ListCard title="Abaixo do mínimo" titleId="low-title" href="/inventario/materiais" linkLabel="Ver materiais" empty="Nenhum material abaixo do estoque mínimo.">
          {low.length > 0 && <ul className="m-0 list-none p-0">{low.slice(0, SHOWN).map((m) => <li key={m.id} className="border-t first:border-t-0">
            <Link href={`/inventario/materiais/${m.id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="num shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">{m.quantity} de {m.minimum_quantity}</span>
            </Link>
          </li>)}
            {low.length > SHOWN && <li className="border-t px-4 py-2 text-xs text-muted-foreground">e mais {low.length - SHOWN} {low.length - SHOWN === 1 ? "material" : "materiais"}</li>}
          </ul>}
        </ListCard>

        <ListCard title="Movimentações recentes" titleId="movements-title" href="/inventario/movimentacoes" empty="Nenhuma movimentação registrada." className="lg:max-xl:col-span-2">
          {movements.length > 0 && <ul className="m-0 list-none p-0">{movements.map((movement) => {
            const where = pathOf.get(movement.to_location_id ?? movement.from_location_id ?? "");
            return <li key={movement.id} className="border-t first:border-t-0">
            <Link href={`/inventario/materiais/${movement.material_id}`} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{movement.material_name}</span>
                <span className="block truncate text-muted-foreground">
                  {[MOVEMENT_LABELS[movement.kind], movement.quantity != null ? `${movement.quantity} un.` : null, where].filter(Boolean).join(" · ")}
                </span>
              </span>
              {movement.review_status !== "revisado" && <span className="shrink-0 rounded-full bg-[#f5eed1] px-2 py-0.5 text-[11px] font-semibold text-[#725d0d]"
                title={REVIEW_LABELS[movement.review_status]}>{movement.review_status === "pendente" ? "Pendente" : "Para revisar"}</span>}
              <span className="num shrink-0 text-muted-foreground">{timestampBR(movement.created_at)}</span>
            </Link>
          </li>; })}</ul>}
        </ListCard>
      </div>
    </PageBody>
  </div>;
}
