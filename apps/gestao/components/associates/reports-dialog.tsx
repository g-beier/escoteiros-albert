"use client";

import Link from "next/link";
import { IconAlertTriangle, IconDownload, IconFileTypePdf, IconReport } from "@tabler/icons-react";
import { Button, buttonVariants } from "@geas/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@geas/ui/components/dialog";
import { REPORTS, reportFooterName } from "@/lib/associates/reports";

/**
 * Relatórios em PDF do Associados (A4, layout comum), num diálogo da lista de associados: abrir no navegador ou
 * baixar. Os PDFs saem de /associados/relatorios/<slug>. `toReview`: cadastros para revisar, que saem em vermelho.
 */
export function ReportsDialog({ toReview }: { toReview: number }) {
  return <Dialog>
    <DialogTrigger render={<Button variant="outline" size="lg" />}>
      <IconReport data-icon="inline-start" /> Relatórios
    </DialogTrigger>
    <DialogContent className="w-[min(40rem,calc(100%-2rem))]">
      <DialogHeader>
        <DialogTitle>Relatórios</DialogTitle>
        <DialogDescription>Documentos do grupo em PDF (A4), gerados com os dados de hoje.</DialogDescription>
      </DialogHeader>
      {toReview > 0 && <p role="note" className="m-0 flex items-center gap-2 rounded-lg border border-caution/40 bg-caution-soft px-3 py-2 text-xs">
        <IconAlertTriangle className="size-4 shrink-0 text-caution" aria-hidden />
        <span><strong className="num">{toReview}</strong> {toReview === 1 ? "cadastro está" : "cadastros estão"} para revisar e {toReview === 1 ? "sai" : "saem"} em vermelho.{" "}
          <Link href="/associados?revisao=para_revisar" className="font-medium text-primary hover:underline">Revisar</Link></span>
      </p>}
      <ul className="surface m-0 list-none p-0">
        {REPORTS.map((report) => {
          const href = `/associados/relatorios/${report.slug}`;
          const name = reportFooterName(report);
          return <li key={report.slug} className="flex flex-wrap items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
            <IconFileTypePdf className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-medium">{name}</p>
              <p className="m-0 text-xs text-muted-foreground">{report.description}</p>
            </div>
            <div className="flex gap-1.5">
              <a href={href} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`Abrir ${name}`}>Abrir PDF</a>
              <a href={`${href}?baixar=1`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={`Baixar ${name}`}><IconDownload data-icon="inline-start" /> Baixar</a>
            </div>
          </li>;
        })}
      </ul>
    </DialogContent>
  </Dialog>;
}
