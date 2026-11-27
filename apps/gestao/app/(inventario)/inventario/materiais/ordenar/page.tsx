import { redirect } from "next/navigation";
import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/inventory/app-header";
import { MaterialOrder, type OrderItem } from "@/components/inventory/materials/material-order";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { compareLines, conditionBreakdown, materialsBackHref } from "@/lib/inventory/material-list";
import * as locations from "@/lib/server/inventory/locations";
import * as materialsData from "@/lib/server/inventory/materials";
import { pageSession } from "@/lib/server/session";

/**
 * Ordem dos materiais de uma divisão (só os que estão nela, não nas subdivisões), escolhida pelo Editor: vale na
 * lista de Materiais (ordem padrão) e no PDF de conferência.
 */
export default async function OrderMaterials({
  searchParams,
}: {
  searchParams: Promise<{ divisao?: string; voltar?: string }>;
}) {
  const params = await searchParams;
  const back = materialsBackHref(params.voltar);
  const { user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email} />;
  if (!member.inventory.canReview) redirect(back);
  const { db, groupId } = member;
  const [paths, stock, materialData, positions] = await Promise.all([
    locations.listPaths(db, groupId),
    materialsData.stockByLocation(db, groupId),
    materialsData.list(db, groupId, { includeInactive: true }),
    materialsData.positions(db, groupId),
  ]);
  const location = paths.find((row) => row.id === params.divisao);
  if (!location) redirect(back);

  const byId = new Map(materialData.map((material) => [material.id, material]));
  const lines = stock
    .filter((row) => row.location_id === location.id && byId.has(row.material_id))
    .map((row) => ({
      ...row,
      material: byId.get(row.material_id)!,
      previous: [null, null] as [null, null],
      position: positions.get(`${location.id}|${row.material_id}`) ?? null,
    }))
    .sort(compareLines("posicao", "asc"));
  const items: OrderItem[] = lines.map((line) => ({
    id: line.material_id,
    name: line.material.name,
    quantity: line.quantity,
    detail:
      [line.material.active ? null : "Inativo", conditionBreakdown(line.conditions) || null]
        .filter(Boolean)
        .join(" · ") || null,
  }));

  return (
    <div className="shell">
      <AppHeader current="/inventario/materiais" member={member} />
      <PageBody width="narrow">
        <PageHeader
          title={`Ordenar ${location.name}`}
          crumbs={[
            { label: "Inventário", href: "/inventario" },
            { label: "Materiais", href: back },
            { label: `Ordenar ${location.name}` },
          ]}
          description={`${location.path}: a ordem vale na lista de Materiais e no PDF de conferência. Subdivisões têm a sua própria ordem.`}
        />
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum material nesta divisão.</p>
        ) : (
          <MaterialOrder
            locationId={location.id}
            title={location.path}
            items={items}
            allPlaced={lines.every((line) => line.position !== null)}
            back={back}
          />
        )}
      </PageBody>
    </div>
  );
}
