import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/app-header";
import { SettingsTabs, settingsCrumbs } from "@/components/settings-tabs";
import { LocationsManager, type LocationItem } from "@/components/locations/locations-manager";
import { SetupNeeded } from "@/components/setup-needed";
import { fetchLocationPaths } from "@/lib/locations";
import { pageSession } from "@/lib/session";

export default async function LocationsPage() {
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const [rows, { data: details }, { data: lots }, { data: units }] = await Promise.all([
    fetchLocationPaths(supabase, member.groupId),
    supabase.from("inventory_locations").select("id, description").eq("group_id", member.groupId),
    supabase.from("inventory_lots").select("location_id").eq("group_id", member.groupId).gt("quantity", 0),
    supabase.from("inventory_units").select("location_id").eq("group_id", member.groupId).is("written_off_at", null),
  ]);
  // Primeira/última entre as irmãs: define quais setas de ordem aparecem.
  const siblings = new Map<string, string[]>();
  for (const row of rows) siblings.set(row.parent_id ?? "", [...(siblings.get(row.parent_id ?? "") ?? []), row.id]);
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
    first: siblings.get(row.parent_id ?? "")![0] === row.id, last: siblings.get(row.parent_id ?? "")!.at(-1) === row.id,
  }));

  return <div className="shell">
    <AppHeader current="/configuracoes/divisoes" email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="divisoes" isAdmin={member.isAdmin} />} crumbs={settingsCrumbs("divisoes")}
        description={member.canManage
          ? "Onde os materiais do grupo ficam guardados. Clique numa divisão para ver o que há nela."
          : "Onde os materiais do grupo ficam guardados. Só o gestor do inventário altera as divisões."} />
      <LocationsManager locations={locations} canManage={member.canManage} />
    </PageBody>
  </div>;
}
