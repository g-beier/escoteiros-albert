import { PageBody, PageHeader } from "@geas/ui";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { AppHeader } from "@/components/app-header";
import { LocationForm } from "@/components/location-form";
import { SetupNeeded } from "@/components/setup-needed";
import { pageSession } from "@/lib/session";

export default async function Locations() {
  const { supabase, user, membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const { data } = await supabase.from("inventory_locations").select("id,name,description,inventory_items(count)").eq("group_id", membership.groupId).eq("active", true).order("name");
  const rows = data ?? [];
  const itemCount = (value: unknown) => (Array.isArray(value) ? (value[0] as { count?: number } | undefined)?.count : undefined) ?? 0;

  return <div className="shell">
    <AppHeader current="/locais" email={user.email ?? ""} role={membership.role} />
    <PageBody width="narrow">
      <PageHeader title="Locais" crumbs={[{ label: "Locais" }]} description="Onde os materiais do grupo ficam guardados." />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <SectionCard>
          <SectionHeader title="Locais cadastrados"><SectionCount>{rows.length} {rows.length === 1 ? "local" : "locais"}</SectionCount></SectionHeader>
          {rows.length === 0
            ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">Cadastre o primeiro local de armazenamento.</p>
            : <ul className="m-0 list-none p-0">{rows.map((location) => {
              const count = itemCount(location.inventory_items);
              return <li key={location.id} className="flex items-center gap-3 border-t px-4 py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{location.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{location.description || "Sem descrição"}</div>
                </div>
                <span className="num shrink-0 text-xs text-muted-foreground">{count} {count === 1 ? "item" : "itens"}</span>
              </li>;
            })}</ul>}
        </SectionCard>
        {membership.canEdit && <SectionCard>
          <SectionHeader title="Novo local" />
          <div className="p-4"><LocationForm /></div>
        </SectionCard>}
      </div>
    </PageBody>
  </div>;
}
