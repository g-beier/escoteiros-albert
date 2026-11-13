import { AppHeader } from "@/components/app-header";
import { createItem } from "@/app/actions";
import { pageSession } from "@/lib/session";

export default async function Items({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  const params = await searchParams; const { supabase, user, membership } = await pageSession();
  if (!membership) return null;
  const [{ data: items }, { data: locations }] = await Promise.all([
    supabase.from("inventory_items").select("id,name,category,quantity,minimum_quantity,condition,inventory_locations(name)").eq("group_id", membership.groupId).eq("active", true).order("name"),
    supabase.from("inventory_locations").select("id,name").eq("group_id", membership.groupId).eq("active", true).order("name"),
  ]);
  return <div className="shell"><AppHeader current="/itens" email={user.email ?? ""}/><main className="page"><div className="page-heading"><div><span className="eyebrow">Patrimônio e materiais</span><h1>Itens</h1></div><span className="muted">{items?.length ?? 0} cadastrados</span></div>
    {params.erro && <div className="notice error">{params.erro}</div>}{params.sucesso && <div className="notice">{params.sucesso}</div>}
    <section className="card table-wrap"><table><thead><tr><th>Item</th><th>Categoria</th><th>Local</th><th>Condição</th><th>Quantidade</th><th>Mínimo</th></tr></thead><tbody>{items?.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.category || "—"}</td><td>{Array.isArray(item.inventory_locations) ? item.inventory_locations[0]?.name : (item.inventory_locations as {name?:string}|null)?.name || "—"}</td><td><span className="badge">{item.condition}</span></td><td>{item.quantity}</td><td>{item.minimum_quantity}</td></tr>)}</tbody></table>{!items?.length && <div className="empty">O inventário ainda está vazio.</div>}</section>
    {membership.canEdit && <section id="novo" className="card form-card" style={{marginTop:20}}><div className="section-head" style={{padding:0,paddingBottom:16,marginBottom:16}}><h2>Cadastrar item</h2></div><form action={createItem} className="form-grid"><label className="field field-wide">Nome do item<input name="name" required maxLength={120}/></label><label className="field">Categoria<input name="category" placeholder="Ex.: Camping" maxLength={80}/></label><label className="field">Local<select name="locationId"><option value="">Sem local definido</option>{locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="field">Quantidade<input name="quantity" type="number" min="0" defaultValue="1" required/></label><label className="field">Estoque mínimo<input name="minimum" type="number" min="0" defaultValue="0" required/></label><label className="field">Condição<select name="condition" defaultValue="bom"><option value="novo">Novo</option><option value="bom">Bom</option><option value="regular">Regular</option><option value="manutencao">Em manutenção</option><option value="inservivel">Inservível</option></select></label><div className="field" style={{alignSelf:"end"}}><button className="button" type="submit">Cadastrar item</button></div></form></section>}
  </main></div>;
}
