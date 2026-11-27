import { Link } from "@geas/ui/components/link";
import { notFound, redirect } from "next/navigation";
import { IconChevronRight } from "@tabler/icons-react";
import { SaleMark } from "@/components/inventory/sale-mark";
import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { cn } from "@geas/ui/lib/utils";
import { GestaoHeader } from "@/components/shell/gestao-header";
import { QuickForm, type QuickItem } from "@/components/inventory/quick/quick-form";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { locationOptions } from "@/lib/inventory/locations";
import { QUICK_ACTIONS, isQuickKind } from "@/lib/inventory/quick";
import * as locationsData from "@/lib/server/inventory/locations";
import * as materials from "@/lib/server/inventory/materials";
import { pageSession } from "@/lib/server/session";

/** Material no registro rápido: sem `acao`, os botões das ações; com `acao`, o formulário dela. */
export default async function QuickMaterial({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ acao?: string }>;
}) {
  const [{ id }, { acao }] = await Promise.all([params, searchParams]);
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canWrite) redirect(`/inventario/materiais/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db, groupId } = member;
  const material = await materials.get(db, groupId, id);
  if (!material || !material.active) notFound();
  const isLot = material.tracking === "lot";
  const [paths, lots, units] = await Promise.all([
    locationsData.listPaths(db, groupId),
    isLot ? materials.lots(db, id) : Promise.resolve([]),
    isLot ? Promise.resolve([]) : materials.units(db, id),
  ]);
  const pathOf = new Map(paths.map((row) => [row.id, row.path]));
  const items: QuickItem[] = [
    ...lots.map((lot) => ({
      value: `lot:${lot.id}`,
      kind: "lot" as const,
      title: `${lot.quantity} un.`,
      path: pathOf.get(lot.location_id) ?? "—",
      quantity: lot.quantity,
      condition: lot.condition,
    })),
    ...units
      .filter((unit) => !unit.written_off_at)
      .map((unit) => ({
        value: `unit:${unit.id}`,
        kind: "unit" as const,
        title: unit.tag ?? unit.legacy_code ?? unit.description ?? "Peça sem etiqueta",
        path: pathOf.get(unit.location_id) ?? "—",
        quantity: 1,
        condition: unit.condition,
      })),
  ].sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  const actions = QUICK_ACTIONS.filter((row) => isLot || !row.lotOnly);
  const chosen = isQuickKind(acao) && acao !== "novo" ? actions.find((row) => row.kind === acao) : undefined;
  const crumbs = [{ label: "Registro rápido", href: "/rapido" }];

  return (
    <div className="shell">
      <GestaoHeader current={`/rapido/inventario/${id}`} member={member} quick />
      <PageBody width="narrow">
        <PageHeader
          title={
            chosen ? (
              chosen.label
            ) : (
              <>
                {material.name}
                {material.for_sale && <SaleMark priceCents={material.sale_price_cents} className="ml-2" />}
              </>
            )
          }
          crumbs={
            chosen
              ? [...crumbs, { label: material.name, href: `/rapido/inventario/${id}` }, { label: chosen.label }]
              : [...crumbs, { label: material.name }]
          }
          description={
            chosen ? (
              material.name
            ) : (
              <span className={cn("num", material.below_minimum && "text-destructive")}>
                {material.quantity} em estoque
                {material.minimum_quantity != null && ` (mínimo ${material.minimum_quantity})`}
              </span>
            )
          }
        />
        {chosen ? (
          <SectionCard>
            <div className="p-4">
              <QuickForm
                kind={chosen.kind}
                material={{ id, name: material.name, tracking: material.tracking, consumable: material.consumable }}
                items={chosen.kind === "entrada" ? [] : items}
                locations={locationOptions(paths)}
              />
            </div>
          </SectionCard>
        ) : (
          <SectionCard>
            <SectionHeader title="O que aconteceu?" />
            <ul className="m-0 list-none p-0">
              {actions.map((row) => (
                <li key={row.kind} className="border-t first:border-t-0">
                  <Link
                    href={`/rapido/inventario/${id}?acao=${row.kind}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{row.label}</span>
                      <span className="block text-xs text-muted-foreground">{row.description}</span>
                    </span>
                    <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </PageBody>
    </div>
  );
}
