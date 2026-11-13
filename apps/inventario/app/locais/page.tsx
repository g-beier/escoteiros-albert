import { AppHeader } from "@/components/app-header";
import { createLocation } from "@/app/actions";
import { pageSession } from "@/lib/session";

export default async function Locations({ searchParams }: { searchParams: Promise<{ erro?: string; sucesso?: string }> }) {
  const params = await searchParams; const { supabase, user, membership } = await pageSession(); if (!membership) return null;
  const { data } = await supabase.from("inventory_locations").select("id,name,description,inventory_items(count)").eq("group_id", membership.groupId).eq("active", true).order("name");
  return <div className="shell"><AppHeader current="/locais" email={user.email ?? ""}/><main className="page"><div className="page-heading"><div><span className="eyebrow">Organização física</span><h1>Locais</h1></div></div>{params.erro && <div className="notice error">{params.erro}</div>}{params.sucesso && <div className="notice">{params.sucesso}</div>}
    <div className="two-col"><section className="card"><ul className="list">{data?.map((location) => <li key={location.id}><div className="grow"><strong>{location.name}</strong><div className="muted">{location.description || "Sem descrição"}</div></div><span className="badge">{Array.isArray(location.inventory_items) ? location.inventory_items[0]?.count ?? 0 : 0} itens</span></li>)}</ul>{!data?.length && <div className="empty">Cadastre o primeiro local de armazenamento.</div>}</section>
    {membership.canEdit && <section className="card form-card"><h2>Novo local</h2><form action={createLocation} style={{display:"grid",gap:14,marginTop:18}}><label className="field">Nome<input name="name" placeholder="Ex.: Almoxarifado" required/></label><button className="button" type="submit">Cadastrar local</button></form></section>}</div></main></div>;
}
