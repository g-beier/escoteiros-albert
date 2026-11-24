import { StyleSheet, Text } from "@react-pdf/renderer";
import { Cell, COMPACT_FONT, Row, Table } from "@/components/reports/blocks";
import { MM, ReportDocument } from "@/components/reports/report-document";
import { dateBR } from "@/lib/format";
import type { LifeReport } from "@/lib/associates/life-report";
import { lifeBranchColor, lifeBranchShort } from "@/lib/associates/scout-life";

// Vida escoteira em PDF (conteúdo em lib/associates/life-report.ts): nome na cor do ramo atual (adulto escotista ou
// dirigente em azul), promessa, estrelas por ramo (coluna na cor do ramo), total e observação. Uma linha por pessoa.

const NAME_FIT = 30;
const PROMISE = 20 * MM;
const STAR = 11 * MM;
const TOTAL = 12 * MM;
const NOTE = 42 * MM;
/** Nome um pouco menor que o padrão das tabelas (cabe mais sem reduzir). */
const NAME_FONT = 8.5;

const styles = StyleSheet.create({
  note: { fontSize: 8, marginBottom: 3 * MM, textAlign: "center" },
});

export function LifeReportDocument({ doc, title, footerName, issuedOn }: { doc: LifeReport; title: string; footerName: string; issuedOn: string }) {
  return <ReportDocument title={title} footerName={footerName} issuedOn={issuedOn}>
    <Text style={styles.note}>Anos de atividade contados desde a promessa; uma estrela a cada 12 meses, no ramo de mais atividade no período. Lacunas: ver a linha do tempo no sistema.</Text>
    <Table>
      <Row>
        <Cell bold fit={NAME_FIT}>Nome</Cell>
        <Cell bold width={PROMISE} size={COMPACT_FONT}>Promessa</Cell>
        {doc.branches.map((b) => <Cell key={b} bold width={STAR} fill={lifeBranchColor(b)} size={COMPACT_FONT}>{lifeBranchShort(b).slice(0, 3)}</Cell>)}
        <Cell bold width={TOTAL} size={COMPACT_FONT}>Total</Cell>
        <Cell bold width={NOTE} size={COMPACT_FONT}>Observação</Cell>
      </Row>
      {doc.rows.map((row) => <Row key={row.id}>
        <Cell fill={row.color} fit={NAME_FIT} align="left" size={NAME_FONT}>{row.name}</Cell>
        <Cell width={PROMISE} size={COMPACT_FONT}>{row.promiseDate ? dateBR(row.promiseDate) : "—"}</Cell>
        {doc.branches.map((b) => <Cell key={b} width={STAR}>{row.stars[b] ? String(row.stars[b]) : ""}</Cell>)}
        <Cell width={TOTAL} bold>{String(row.total)}</Cell>
        <Cell width={NOTE} size={6.5} uppercase={false} align="left">{[row.note, row.pending ? "Estrela a entregar" : ""].filter(Boolean).join(" · ")}</Cell>
      </Row>)}
    </Table>
  </ReportDocument>;
}
