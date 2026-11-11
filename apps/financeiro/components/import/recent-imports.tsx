import Link from "next/link";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateBR } from "@/lib/format";
import { reconciliationHref } from "@/lib/import-flow";
import type { RecentImport } from "@/lib/import-queries";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Últimas importações da conta escolhida. */
export function RecentImports({ accountId, accountName, rows, error }: { accountId: string; accountName: string; rows: RecentImport[]; error?: string }) {
  return <section className="card" aria-labelledby="recent-imports-title">
    <header className="card-head">
      <div><h2 className="card-title" id="recent-imports-title">Importações recentes</h2><p className="m-0 text-xs text-muted-foreground">{accountName}</p></div>
    </header>
    {error && <p className="m-0 px-5 py-3 text-xs text-destructive">Não foi possível carregar as importações: {error}</p>}
    {!error && rows.length === 0 && <p className="m-0 px-5 py-6 text-center text-xs text-muted-foreground">Nenhum extrato importado nesta conta.</p>}
    {rows.length > 0 && <Table>
      <TableCaption className="sr-only">Importações recentes de {accountName}</TableCaption>
      <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className="h-8 px-3">Importado em</TableHead>
        <TableHead className="h-8 px-3">Arquivo</TableHead>
        <TableHead className="h-8 px-3">Período</TableHead>
        <TableHead className="h-8 px-3 text-right">Linhas</TableHead>
        <TableHead className="h-8 px-3 text-right">Duplicadas</TableHead>
        <TableHead className="h-8 px-3"><span className="sr-only">Ações</span></TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map((row) => <TableRow key={row.id}>
        <TableCell className="px-3 py-1.5 num">{dateTime.format(new Date(row.imported_at))}</TableCell>
        <TableCell className="px-3 py-1.5">
          <div className="max-w-80 truncate font-medium" title={row.file_name}>{row.file_name}</div>
          {row.profile_name && <div className="text-xs text-muted-foreground">Perfil {row.profile_name}</div>}
        </TableCell>
        <TableCell className="px-3 py-1.5 num">{dateBR(row.period_from)} a {dateBR(row.period_to)}</TableCell>
        <TableCell className="px-3 py-1.5 text-right num">{row.line_count}</TableCell>
        <TableCell className="px-3 py-1.5 text-right num">{row.duplicate_count}</TableCell>
        <TableCell className="px-3 py-1.5 text-right"><Link className="text-primary underline-offset-4 hover:underline" href={reconciliationHref(accountId, row.period_from, row.period_to)}>Conciliar</Link></TableCell>
      </TableRow>)}</TableBody>
    </Table>}
  </section>;
}
