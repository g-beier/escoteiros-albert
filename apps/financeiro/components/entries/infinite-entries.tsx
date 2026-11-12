"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadEntryPage } from "@/app/actions";
import { SplitTable, LedgerTable } from "@/components/entry-tables";
import { Button } from "@/components/ui/button";
import { useEntryOverrides } from "@/components/entries/entry-editor";
import { PAGE_SIZE, type EntryPage, type SplitRow, type LedgerRow } from "@/lib/entry-queries";
import type { SortOrder } from "@/lib/filters";

type Status = "idle" | "loading" | "done" | "error";
const number = new Intl.NumberFormat("pt-BR");

/**
 * Lista com rolagem infinita: a primeira página vem do servidor; as seguintes são
 * pedidas quando o fim da lista aparece na tela. O componente é recriado (via `key`)
 * quando filtros, visão ou ordem mudam.
 */
export function InfiniteEntries({ initial, query, filtered, order, sortHref }: { initial: EntryPage; query: string; filtered: boolean; order: SortOrder; sortHref: string }) {
  const [pages, setPages] = useState<EntryPage[]>([initial]);
  const [status, setStatus] = useState<Status>(initial.error ? "error" : initial.rows.length < PAGE_SIZE ? "done" : "idle");
  const [error, setError] = useState(initial.error ?? "");
  const sentinel = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const loading = useRef(false);
  const overrides = useEntryOverrides();
  const view = initial.view;
  const total = initial.total;

  const offset = pages.reduce((sum, page) => sum + page.rows.length, 0);

  const loadMore = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setStatus("loading");
    const page = await loadEntryPage(query, offset).catch(() => ({ ...initial, rows: [], error: "Falha de conexão." }) as EntryPage);
    loading.current = false;
    if (page.error) { setError(page.error); setStatus("error"); return; }
    setPages((current) => [...current, page]);
    setStatus(page.rows.length < PAGE_SIZE ? "done" : "idle");
  }, [query, offset, initial]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || status !== "idle") return;
    // No desktop a tabela rola dentro do próprio contêiner; no celular, a página inteira rola.
    const scroller = scrollerRef.current;
    const root = scroller && scroller.scrollHeight > scroller.clientHeight ? scroller : null;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { root, rootMargin: "0px 0px 800px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [status, loadMore]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const all = pages.flatMap((page) => page.rows as (LedgerRow | SplitRow)[]);
    return all.filter((row) => {
      const id = "split_id" in row ? row.split_id : row.entry_id;
      if (seen.has(id) || overrides[row.entry_id]?.deleted) return false;
      seen.add(id);
      return true;
    }).map((row) => {
      const filed = overrides[row.entry_id]?.filed;
      return filed === undefined ? row : { ...row, document_filed: filed };
    });
  }, [pages, overrides]);

  const unit = view === "rubricas" ? ["rateio", "rateios"] : ["lançamento", "lançamentos"];
  const deleted = Object.values(overrides).filter((o) => o.deleted).length;
  const knownTotal = total === null ? null : Math.max(total - deleted, rows.length);

  return <>
    <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto overscroll-contain" data-slot="entries-scroller">
      {view === "rubricas"
        ? <SplitTable rows={rows as SplitRow[]} filtered={filtered} order={order} sortHref={sortHref} />
        : <LedgerTable rows={rows as LedgerRow[]} filtered={filtered} order={order} sortHref={sortHref} />}
      {rows.length > 0 && <div ref={sentinel} className="flex h-10 items-center justify-center text-xs text-muted-foreground" aria-live="polite">
        {status === "loading" && "Carregando mais…"}
        {status === "done" && "Fim da lista"}
        {status === "error" && <span className="flex items-center gap-2 text-destructive">{error || "Não foi possível carregar."} <Button variant="outline" size="sm" onClick={loadMore}>Tentar de novo</Button></span>}
      </div>}
    </div>
    <footer className="flex items-center justify-between border-t bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
      <span>
        {knownTotal !== null && rows.length < knownTotal
          ? `${number.format(rows.length)} de ${number.format(knownTotal)} ${unit[1]}`
          : `${number.format(rows.length)} ${rows.length === 1 ? unit[0] : unit[1]}`}
        {filtered ? " no filtro" : ""}
      </span>
      <span>{order === "desc" ? "Mais recentes primeiro" : "Mais antigos primeiro"}</span>
    </footer>
  </>;
}
