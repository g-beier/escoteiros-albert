import { AppHeader } from "@/components/app-header";
import { pageSession } from "@/lib/session";

export default async function Movements() {
  const { supabase, user, membership } = await pageSession(); if (!membership) return null;
  const { data } = await supabase.from("inventory_movements").select("id,movement_type,quantity,notes,occurred_at,inventory_items(name),from_location:inventory_locations!inventory_movements_from_location_id_fkey(name),to_location:inventory_locations!inventory_movements_to_location_id_fkey(name)").eq("group_id", membership.groupId).order("occurred_at", { ascending:false }).limit(100);
  const relatedName = (value: unknown) => Array.isArray(value) ? (value[0] as {name?:string}|undefined)?.name : (value as {name?:string}|null)?.name;
  return <div className="shell"><AppHeader current="/movimentacoes" email={user.email ?? ""}/><main className="page"><div className="page-heading"><div><span className="eyebrow">Rastreabilidade</span><h1>Movimentações</h1></div></div><section className="card table-wrap"><table><thead><tr><th>Data</th><th>Item</th><th>Tipo</th><th>Quantidade</th><th>Origem</th><th>Destino</th><th>Observação</th></tr></thead><tbody>{data?.map((m) => <tr key={m.id}><td>{new Date(m.occurred_at).toLocaleDateString("pt-BR")}</td><td><strong>{relatedName(m.inventory_items)}</strong></td><td><span className="badge">{m.movement_type}</span></td><td>{m.quantity}</td><td>{relatedName(m.from_location) || "—"}</td><td>{relatedName(m.to_location) || "—"}</td><td>{m.notes || "—"}</td></tr>)}</tbody></table>{!data?.length && <div className="empty">Nenhuma movimentação registrada ainda.</div>}</section></main></div>;
}
