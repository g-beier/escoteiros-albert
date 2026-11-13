import { PageBody, PageHeader } from "@geas/ui";
import { AppHeader } from "@/components/app-header";
import { SettingsTabs, settingsCrumbs } from "@/components/settings-tabs";
import { FamiliesManager, type FamilyItem } from "@/components/families/families-manager";
import { SetupNeeded } from "@/components/setup-needed";
import { pageSession } from "@/lib/session";

export default async function FamiliesPage() {
  const { supabase, user, member } = await pageSession();
  if (!member) return <SetupNeeded email={user.email ?? ""} />;
  const [{ data: families }, { data: materials }, { data: units }] = await Promise.all([
    supabase.from("inventory_families").select("id, name, code, active").eq("group_id", member.groupId).order("name"),
    supabase.from("inventory_materials").select("id, family_id").eq("group_id", member.groupId).not("family_id", "is", null),
    supabase.from("inventory_units").select("material_id").eq("group_id", member.groupId).not("tag", "is", null).is("written_off_at", null),
  ]);
  const familyOf = new Map((materials ?? []).map((m) => [m.id as string, m.family_id as string]));
  const count = (pairs: (string | undefined)[]) => pairs.reduce((map, id) => (id ? map.set(id, (map.get(id) ?? 0) + 1) : map), new Map<string, number>());
  const materialCount = count((materials ?? []).map((m) => m.family_id as string));
  const taggedCount = count((units ?? []).map((u) => familyOf.get(u.material_id as string)));
  const items: FamilyItem[] = (families ?? []).map((f) => ({
    id: f.id, name: f.name, code: f.code, active: f.active, materials: materialCount.get(f.id) ?? 0, tagged: taggedCount.get(f.id) ?? 0,
  }));

  return <div className="shell">
    <AppHeader current="/configuracoes/familias" email={user.email ?? ""} role={member.role} isAdmin={member.isAdmin} />
    <PageBody width="narrow">
      <PageHeader title="Configurações" tabs={<SettingsTabs current="familias" isAdmin={member.isAdmin} />} crumbs={settingsCrumbs("familias")}
        description={member.canManage
          ? "Tipos de material. Clique numa família para ver os materiais dela."
          : "Tipos de material. Só o gestor do inventário altera as famílias."} />
      <FamiliesManager families={items} canManage={member.canManage} />
    </PageBody>
  </div>;
}
