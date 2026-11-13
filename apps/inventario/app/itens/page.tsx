import { PageBody, PageHeader } from "@geas/ui";
import { Badge } from "@geas/ui/components/badge";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { AppHeader } from "@/components/app-header";
import { ItemForm } from "@/components/item-form";
import { SetupNeeded } from "@/components/setup-needed";
import { CELL_CLASS, HEAD_CLASS } from "@/components/table-head";
import { CONDITION_LABELS, relatedName, type ItemCondition } from "@/lib/inventory";
import { pageSession } from "@/lib/session";

export default async function Items() {
  const { supabase, user, membership } = await pageSession();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const [{ data: items }, { data: locations }] = await Promise.all([
    supabase.from("inventory_items").select("id,name,category,quantity,minimum_quantity,condition,inventory_locations(name)").eq("group_id", membership.groupId).eq("active", true).order("name"),
    supabase.from("inventory_locations").select("id,name").eq("group_id", membership.groupId).eq("active", true).order("name"),
  ]);
  const rows = items ?? [];

  return <div className="shell">
    <AppHeader current="/itens" email={user.email ?? ""} role={membership.role} />
    <PageBody>
      <PageHeader title="Itens" crumbs={[{ label: "Itens" }]} description="Patrimônio e materiais do grupo, com local, condição e estoque mínimo." />
      {membership.canEdit && <SectionCard id="novo" className="scroll-mt-20">
        <SectionHeader title="Cadastrar item" />
        <div className="p-4"><ItemForm locations={(locations ?? []).map((location) => ({ value: location.id, label: location.name }))} /></div>
      </SectionCard>}
      <SectionCard>
        <SectionHeader title="Itens cadastrados"><SectionCount>{rows.length} {rows.length === 1 ? "item" : "itens"}</SectionCount></SectionHeader>
        {rows.length === 0
          ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">O inventário ainda está vazio.</p>
          : <div className="overflow-x-auto"><Table className="min-w-[720px]">
            <TableCaption className="sr-only">Itens do inventário</TableCaption>
            <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
              <TableHead className={HEAD_CLASS}>Item</TableHead>
              <TableHead className={HEAD_CLASS}>Categoria</TableHead>
              <TableHead className={HEAD_CLASS}>Local</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-36")}>Condição</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-28 text-right")}>Quantidade</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-24 text-right")}>Mínimo</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((item) => {
              const low = item.quantity <= item.minimum_quantity;
              return <TableRow key={item.id}>
                <TableCell className={cn(CELL_CLASS, "font-semibold")}>{item.name}</TableCell>
                <TableCell className={CELL_CLASS}>{item.category || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className={CELL_CLASS}>{relatedName(item.inventory_locations) || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className={CELL_CLASS}><Badge variant="outline">{CONDITION_LABELS[item.condition as ItemCondition]}</Badge></TableCell>
                <TableCell className={cn(CELL_CLASS, "num text-right font-semibold", low && "text-destructive")}>{item.quantity}</TableCell>
                <TableCell className={cn(CELL_CLASS, "num text-right text-muted-foreground")}>{item.minimum_quantity}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>}
      </SectionCard>
    </PageBody>
  </div>;
}
