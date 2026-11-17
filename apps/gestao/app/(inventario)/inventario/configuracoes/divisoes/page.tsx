import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/inventory/app-header";
import { SettingsTabs, settingsCrumbs } from "@/components/inventory/settings-tabs";
import { LocationsManager, type LocationItem } from "@/components/inventory/locations/locations-manager";
import { SetupNeeded } from "@/components/shell/setup-needed";
import { fetchLocationPaths } from "@/lib/inventory/locations";
import { pageSession } from "@/lib/server/session";

export default async function LocationsPage() {
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const [rows, { data: details }, { data: lots }, { data: units }] = await Promise.all([
    fetchLocationPaths(supabase, member.groupId),
    supabase.from("inventory_locations").select("id, description").eq("group_id", member.groupId),
    supabase.from("inventory_lots").select("location_id").eq("group_id", member.groupId).gt("quantity", 0),
    supabase.from("inventory_units").select("location_id").eq("group_id", member.groupId).is("written_off_at", null),
  ]);
  const descriptions = new Map((details ?? []).map((d) => [d.id as string, d.description as string | null]));

  // Lotes com saldo e peças ativas por divisão; "com subdivisões" soma em todos os ancestrais.
  const own = new Map<string, number>();
  for (const item of [...(lots ?? []), ...(units ?? [])]) own.set(item.location_id, (own.get(item.location_id) ?? 0) + 1);
  const total = new Map<string, number>();
  for (const row of rows) {
    const count = own.get(row.id) ?? 0;
    for (const ancestor of row.ancestors) total.set(ancestor, (total.get(ancestor) ?? 0) + count);
  }
  const locations: LocationItem[] = rows.map((row) => ({
    id: row.id, parentId: row.parent_id, name: row.name, description: descriptions.get(row.id) ?? null, path: row.path,
    depth: row.depth, ancestors: row.ancestors, active: row.active, own: own.get(row.id) ?? 0, total: total.get(row.id) ?? 0,
  }));

  return <div className="shell">
    <AppHeader current="/inventario/configuracoes/divisoes" email={user.email ?? ""} role={member.inventory.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="divisoes" />} crumbs={settingsCrumbs("divisoes")}
        description={member.inventory.canManage
          ? "Onde os materiais do grupo ficam guardados. Arraste pela alça para reordenar ou pôr dentro de outra; clique numa divisão para ver o que há nela."
          : "Onde os materiais do grupo ficam guardados. Só o gestor do inventário altera as divisões."} />
      <LocationsManager locations={locations} canManage={member.inventory.canManage} />
    </PageBody>
  </div>;
}
