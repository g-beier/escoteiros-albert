import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { EntryForm } from "@/components/entries/entry-form";
import { fetchEntry, listHref } from "@/lib/entries";
import { dateBR, money } from "@/lib/format";
import { loadEntryContext } from "../context";

export const metadata = { title: "Lançamento · GEAS Financeiro" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function EntryDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voltar?: string }> }) {
  const [{ id }, { voltar }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user, role, canEdit, catalogs } = await loadEntryContext();
  const entry = await fetchEntry(supabase, id);
  if (!entry) notFound();
  const backHref = listHref(voltar);
  const edited = entry.updatedAt.slice(0, 19) !== entry.createdAt.slice(0, 19);

  return <div className="shell">
    <AppHeader role={role} email={user.email ?? ""} current={`/lancamentos/${id}`} />
    <main className="main">
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><IconArrowLeft className="size-4" aria-hidden /> Voltar aos lançamentos</Link>
      <div className="page-head">
        <div>
          <span className="eyebrow">{dateBR(entry.date)} · {entry.splits.length} {entry.splits.length === 1 ? "rubrica" : "rubricas"}</span>
          <h1 className="break-words text-[clamp(28px,4vw,44px)]">{entry.name}</h1>
          <p className="lede">
            <span className={entry.totalCents < 0 ? "font-semibold text-destructive" : "font-semibold text-foreground"}>{money(entry.totalCents / 100)}</span>
            {" · "}Criado em {dateTime.format(new Date(entry.createdAt))}{edited && <> · alterado em {dateTime.format(new Date(entry.updatedAt))}</>}
          </p>
        </div>
      </div>
      {!canEdit && <p className="mb-3 text-xs text-muted-foreground">Seu acesso é somente de consulta.</p>}
      <section className="card p-5"><EntryForm entry={entry} catalogs={catalogs} canEdit={canEdit} backHref={backHref} /></section>
    </main>
  </div>;
}
