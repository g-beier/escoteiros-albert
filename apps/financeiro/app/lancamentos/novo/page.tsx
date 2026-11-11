import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { EntryForm } from "@/components/entries/entry-form";
import { listHref } from "@/lib/entries";
import { loadEntryContext } from "../context";

export const metadata = { title: "Novo lançamento · GEAS Financeiro" };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  const { user, role, canEdit, catalogs } = await loadEntryContext();
  if (!canEdit) notFound();
  const backHref = listHref(voltar);
  return <div className="shell">
    <AppHeader role={role} email={user.email ?? ""} current="/lancamentos/novo" />
    <main className="main">
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><IconArrowLeft className="size-4" aria-hidden /> Voltar aos lançamentos</Link>
      <div className="page-head"><div><span className="eyebrow">Linha do extrato</span><h1>Novo lançamento</h1><p className="lede">Informe os dados do extrato e distribua o valor total entre as rubricas, cada uma com sua descrição.</p></div></div>
      <section className="card p-5"><EntryForm entry={null} catalogs={catalogs} canEdit backHref={backHref} /></section>
    </main>
  </div>;
}
