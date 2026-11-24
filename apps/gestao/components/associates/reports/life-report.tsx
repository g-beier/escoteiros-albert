import { StyleSheet, Text } from "@react-pdf/renderer";
import { Cell, COMPACT_FONT, Row, Table } from "@/components/reports/blocks";
import { MM, ReportDocument } from "@/components/reports/report-document";
import { shortPromiseDate } from "@/lib/associates/doc14";
import type { LifeReport } from "@/lib/associates/life-report";
import { lifeBranchColor, lifeBranchShort } from "@/lib/associates/scout-life";

// Vida escoteira em PDF (conteúdo em lib/associates/life-report.ts): nome na cor do ramo atual (adulto escotista ou
// dirigente em azul), promessa, estrelas por ramo (coluna na cor do ramo), total e observação. Uma linha por pessoa:
// colunas de números estreitas e o nome com largura fixa, sempre numa linha (a fonte diminui nos nomes muito longos);
// a observação fica com o resto da largura e quebra linha se precisar.

const NAME = 70 * MM;
/** Caracteres que cabem no nome no tamanho `NAME_FONT`; acima disso a fonte diminui (`fitSize`). */
const NAME_FIT = 38;
// Larguras medidas na Outfit Bold 7 pt: "PROMESSA" 13,3 mm e "TOTAL" 7,9 mm. Com o recuo de 1,5 mm de cada lado da
// célula, o cabeçalho cabe inteiro e fica centralizado (antes transbordava para a direita).
/** Data curta como no Doc 14a ("17/1/26"), centralizada. */
const PROMISE = 17 * MM;
const STAR = 9 * MM;
const TOTAL = 12 * MM;
/** Nome um pouco menor que o padrão das tabelas (cabe mais sem reduzir). */
const NAME_FONT = 8.5;
const HEAD_FONT = 7;

const styles = StyleSheet.create({
  note: { fontSize: 8, marginBottom: 3 * MM, textAlign: "left" },
});

export function LifeReportDocument({ doc, title, footerName, issuedOn }: { doc: LifeReport; title: string; footerName: string; issuedOn: string }) {
  return <ReportDocument title={title} footerName={footerName} issuedOn={issuedOn}>
    <Text style={styles.note}>
      POR, Regra 173 – Estrelas de Atividade: uma estrela para cada ano de efetiva participação escoteira, contado desde a primeira
      Cerimônia de Promessa (ou Acolhida no Ramo Filhotes). Só se computa o ano com presença em mais de 70% das reuniões e
      atividades dos doze meses; não contam licenças superiores a 60 dias nem suspensões por medida disciplinar (lacunas:
      ver a linha do tempo no sistema). Cor da estrela: azul para escotista e dirigente; nos jovens, a do ramo, aqui o de
      mais atividade nos doze meses, sem janeiro e fevereiro (férias).
    </Text>
    <Table>
      <Row>
        <Cell bold width={NAME} align="left" size={HEAD_FONT}>Nome</Cell>
        <Cell bold width={PROMISE} size={HEAD_FONT}>Promessa</Cell>
        {doc.branches.map((b) => <Cell key={b} bold width={STAR} fill={lifeBranchColor(b)} size={HEAD_FONT}>{lifeBranchShort(b).slice(0, 3)}</Cell>)}
        <Cell bold width={TOTAL} size={HEAD_FONT}>Total</Cell>
        <Cell bold align="left" size={HEAD_FONT}>Observação</Cell>
      </Row>
      {doc.rows.map((row) => <Row key={row.id}>
        <Cell fill={row.color} width={NAME} fit={NAME_FIT} align="left" size={NAME_FONT}>{row.name}</Cell>
        <Cell width={PROMISE} size={COMPACT_FONT}>{row.promiseDate ? shortPromiseDate(row.promiseDate) : "—"}</Cell>
        {doc.branches.map((b) => <Cell key={b} width={STAR}>{row.stars[b] ? String(row.stars[b]) : ""}</Cell>)}
        <Cell width={TOTAL} bold>{String(row.total)}</Cell>
        <Cell size={6.5} uppercase={false} align="left">{[row.note, row.pending ? "Estrela a entregar" : ""].filter(Boolean).join(" · ")}</Cell>
      </Row>)}
    </Table>
  </ReportDocument>;
}
