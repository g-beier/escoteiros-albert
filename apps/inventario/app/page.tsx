import Link from "next/link";
import { IconArrowRight, IconPackage, IconMapPin, IconAlertTriangle, IconArrowsExchange } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { pageSession } from "@/lib/session";

export default async function Dashboard() {
  const { supabase, user, membership } = await pageSession();
  if (!membership) return <main className="page"><h1>Acesso ainda não vinculado</h1><p>Peça a um administrador para vincular sua conta ao grupo.</p></main>;
  const [items, locations, movements] = await Promise.all([
    supabase.from("inventory_items").select("id,name,category,quantity,minimum_quantity,condition,inventory_locations(name)").eq("group_id", membership.groupId).eq("active", true).order("updated_at", { ascending: false }),
    supabase.from("inventory_locations").select("id", { count: "exact", head: true }).eq("group_id", membership.groupId).eq("active", true),
    supabase.from("inventory_movements").select("id,movement_type,quantity,occurred_at,inventory_items(name)").eq("group_id", membership.groupId).order("occurred_at", { ascending: false }).limit(6),
  ]);
  const rows = items.data ?? []; const low = rows.filter((i) => i.quantity <= i.minimum_quantity); const totalUnits = rows.reduce((sum, i) => sum + i.quantity, 0);
  return <div className="shell"><AppHeader current="/" email={user.email ?? ""}/><main className="page"><div className="page-heading"><div><span className="eyebrow">Inventário do grupo</span><h1>Visão geral</h1></div>{membership.canEdit && <Link className="button" href="/itens#novo">Cadastrar item <IconArrowRight size={16}/></Link>}</div>
    <section className="grid-stats"><Stat icon={<IconPackage/>} label="Itens cadastrados" value={rows.length}/><Stat icon={<IconPackage/>} label="Unidades em estoque" value={totalUnits}/><Stat icon={<IconMapPin/>} label="Locais" value={locations.count ?? 0}/><Stat icon={<IconAlertTriangle/>} label="Pedem atenção" value={low.length} alert={low.length > 0}/></section>
    <div className="two-col"><section className="card"><div className="section-head"><h2>Itens que pedem atenção</h2><Link href="/itens">Ver todos</Link></div>{low.length ? <ul className="list">{low.slice(0,8).map((item) => <li key={item.id}><div className="grow"><strong>{item.name}</strong><div className="muted">{item.category || "Sem categoria"}</div></div><span className="badge">{item.quantity} em estoque</span></li>)}</ul> : <div className="empty">Tudo certo por aqui. Nenhum item abaixo do mínimo.</div>}</section>
      <section className="card"><div className="section-head"><h2>Movimentações recentes</h2><Link href="/movimentacoes">Histórico</Link></div>{movements.data?.length ? <ul className="list">{movements.data.map((m) => <li key={m.id}><IconArrowsExchange size={18}/><div className="grow"><strong>{Array.isArray(m.inventory_items) ? m.inventory_items[0]?.name : (m.inventory_items as {name?:string}|null)?.name}</strong><div className="muted">{m.movement_type}</div></div><b>{m.quantity}</b></li>)}</ul> : <div className="empty">Nenhuma movimentação registrada.</div>}</section></div>
  </main></div>;
}
function Stat({ icon, label, value, alert=false }: { icon: React.ReactNode; label: string; value: number; alert?: boolean }) { return <div className={`card stat ${alert ? "alert" : ""}`}><span className="muted">{icon} {label}</span><strong>{value}</strong></div>; }
