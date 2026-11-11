import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dateBR, money } from "@/lib/format";
import { logout } from "./actions";
import { NewEntry } from "@/components/new-entry";
import { Brand } from "@/components/brand";
import { canManageEntries } from "@/lib/auth";

type Entry = { id: string; entry_date: string; description: string; document: string | null; total_cents: number };
type Summary = { category_id: string; category_name: string; total_cents: number };

export default async function Home({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  const { visao = "extrato" } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("memberships").select("group_id, role, groups(name)").eq("user_id", user.id).single();
  if (!membership) return <SetupNeeded email={user.email ?? ""} />;
  const groupId = membership.group_id;
  const [{ data: categories }, { data: entries }, { data: summaries }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("group_id", groupId).eq("active", true).order("name"),
    supabase.from("ledger_entries").select("id, entry_date, description, document, total_cents").eq("group_id", groupId).order("entry_date", { ascending: false }).limit(100),
    supabase.from("category_summary").select("category_id, category_name, total_cents").eq("group_id", groupId).order("category_name"),
  ]);
  const typedEntries = (entries ?? []) as Entry[];
  const typedSummaries = (summaries ?? []) as Summary[];
  const grandTotal = typedEntries.reduce((sum, e) => sum + e.total_cents, 0);
  const groupName = Array.isArray(membership.groups) ? membership.groups[0]?.name : (membership.groups as { name?: string } | null)?.name;

  return <div className="shell">
    <header className="topbar"><Brand /><nav className="nav-actions" aria-label="Navegação principal">{membership.role === "admin" && <Link href="/usuarios">Usuários</Link>}<span className="nav-email">{user.email}</span><form action={logout}><button className="link-button">Sair</button></form></nav></header>
    <main className="main">
      <div className="page-head"><div><span className="eyebrow">{groupName ?? "Grupo escoteiro"}</span><h1>Lançamentos</h1><p className="lede">Acompanhe as movimentações do extrato e o rateio por rubricas.</p></div>{canManageEntries(membership.role) && <NewEntry categories={categories ?? []} />}</div>
      <section className="summary"><div className="summary-card"><div className="summary-label">Saldo dos lançamentos</div><div className="summary-value">{money(grandTotal / 100)}</div></div><div className="summary-card"><div className="summary-label">Lançamentos exibidos</div><div className="summary-value">{typedEntries.length}</div></div><div className="summary-card"><div className="summary-label">Rubricas ativas</div><div className="summary-value">{categories?.length ?? 0}</div></div></section>
      <nav className="tabs" aria-label="Visões"><Link aria-current={visao === "extrato" ? "page" : undefined} className={`tab ${visao === "extrato" ? "active" : ""}`} href="/?visao=extrato">Por extrato</Link><Link aria-current={visao === "rubricas" ? "page" : undefined} className={`tab ${visao === "rubricas" ? "active" : ""}`} href="/?visao=rubricas">Por rubrica</Link></nav>
      <section className="card">
        <header className="card-head"><h2 className="card-title">{visao === "rubricas" ? "Consolidado por rubrica" : "Movimentações do extrato"}</h2><span className="muted" style={{ fontSize: 12 }}>Valores em reais</span></header>
        {visao === "rubricas" ? <CategoryTable rows={typedSummaries} /> : <EntryTable rows={typedEntries} />}
      </section>
    </main>
  </div>;
}

function EntryTable({ rows }: { rows: Entry[] }) {
  if (!rows.length) return <div className="empty">Nenhum lançamento ainda. Comece pelo botão “Novo lançamento”.</div>;
  return <div className="table-wrap"><table><caption className="sr-only">Movimentações conforme aparecem no extrato bancário</caption><thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Documento</th><th scope="col" style={{ textAlign: "right" }}>Total</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{dateBR(row.entry_date)}</td><td><strong>{row.description}</strong></td><td className="muted">{row.document || "—"}</td><td className="amount">{money(row.total_cents / 100)}</td></tr>)}</tbody></table></div>;
}

function CategoryTable({ rows }: { rows: Summary[] }) {
  if (!rows.length) return <div className="empty">Os totais por rubrica aparecerão depois do primeiro lançamento.</div>;
  return <div className="table-wrap"><table><caption className="sr-only">Totais consolidados por rubrica</caption><thead><tr><th scope="col">Rubrica</th><th scope="col" style={{ textAlign: "right" }}>Total consolidado</th></tr></thead><tbody>{rows.map((row) => <tr key={row.category_id}><td><span className="badge">{row.category_name}</span></td><td className="amount">{money(row.total_cents / 100)}</td></tr>)}</tbody></table></div>;
}

function SetupNeeded({ email }: { email: string }) {
  return <main className="main"><span className="eyebrow">Configuração inicial</span><h1>Falta criar o grupo</h1><p className="lede">A conta {email} foi autenticada, mas ainda não pertence a um grupo. Execute a migração SQL e a função <code>bootstrap_group</code> descritas no README.</p></main>;
}
