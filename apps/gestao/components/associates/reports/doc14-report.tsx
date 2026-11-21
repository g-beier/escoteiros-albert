import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { Band, Cell, PENDING_RED, Row, SpacerRow, Table, TwoColumns } from "@/components/reports/blocks";
import { MM, ReportDocument } from "@/components/reports/report-document";
import { BLANK_WITHOUT_ROWS, type Doc14, type Doc14Month, type Doc14Person } from "@/lib/associates/doc14";
import { splitInTwo } from "@/lib/associates/reports";

// Doc 14 – Datas de promessa em PDF (conteúdo em lib/associates/doc14.ts): meses em duas colunas (janeiro a julho
// à esquerda, o resto à direita, equilibrado pelo número de linhas), nome na cor do ramo/função e a data curta. Um
// mês nunca se parte entre páginas; todo mês fecha com uma linha vazia e a coluna mais curta é completada com linhas
// vazias, para as duas terminarem juntas. Na página seguinte, "Sem promessa": ativos sem data registrada, para conferir.

const DATE = 17 * MM;
const NAME_FIT = 30;
const COLUMNS = [{ flex: 1 }, { width: DATE }];

const styles = StyleSheet.create({
  note: { fontSize: 9, marginBottom: 3 * MM, textAlign: "center" },
});

/** Linhas de um mês: faixa, pessoas e a linha vazia que sempre fecha o mês. */
const monthRows = (month: Doc14Month) => month.people.length + 2;

function MonthGroup({ month }: { month: Doc14Month }) {
  return <View wrap={false}>
    <Band>{month.label}</Band>
    {month.people.map((person) => <Row key={person.id}>
      <Cell fill={person.color} fit={NAME_FIT} color={person.red ? PENDING_RED : undefined}>{person.name}</Cell>
      <Cell width={DATE}>{person.date}</Cell>
    </Row>)}
    <SpacerRow columns={COLUMNS} />
  </View>;
}

/** Coluna de meses; `rows`: altura da coluna mais alta, completada com linhas vazias para as duas fecharem juntas. */
function MonthColumn({ months, rows, joined = false }: { months: Doc14Month[]; rows: number; joined?: boolean }) {
  const used = months.reduce((sum, month) => sum + monthRows(month), 0);
  return <Table joined={joined}>
    {months.map((month) => <MonthGroup key={month.month} month={month} />)}
    {Array.from({ length: rows - used }, (_, i) => <SpacerRow key={`v${i}`} columns={COLUMNS} />)}
  </Table>;
}

function WithoutColumn({ people, rows, joined = false }: { people: Doc14Person[]; rows: number; joined?: boolean }) {
  return <Table joined={joined}>
    {people.map((person) => <Row key={person.id}>
      <Cell fill={person.color} fit={NAME_FIT} color={person.red ? PENDING_RED : undefined}>{person.name}</Cell>
      <Cell width={DATE} />
    </Row>)}
    {Array.from({ length: rows - people.length }, (_, i) => <SpacerRow key={i} columns={COLUMNS} />)}
  </Table>;
}

export function Doc14Report({ doc, title, footerName, issuedOn }: { doc: Doc14; title: string; footerName: string; issuedOn: string }) {
  const [left, right] = splitInTwo(doc.months, monthRows);
  const columnRows = Math.max(...[left, right].map((column) => column.reduce((sum, month) => sum + monthRows(month), 0)));
  const half = Math.ceil(doc.without.length / 2);
  const rows = Math.max(half, 1) + BLANK_WITHOUT_ROWS;
  return <ReportDocument title={title} footerName={footerName} issuedOn={issuedOn}>
    {doc.months.length
      ? <TwoColumns joined left={<MonthColumn months={left} rows={columnRows} />} right={<MonthColumn months={right} rows={columnRows} joined />} />
      : <Text style={styles.note}>Nenhuma data de promessa registrada.</Text>}
    <View break>
      <Table><Band>Sem promessa</Band></Table>
      <Text style={[styles.note, { marginTop: 2 * MM }]}>Associados ativos sem data de promessa registrada: confira quem já fez a promessa e quem ainda não fez.</Text>
      <TwoColumns joined
        left={<WithoutColumn people={doc.without.slice(0, half)} rows={rows} />}
        right={<WithoutColumn people={doc.without.slice(half)} rows={rows} joined />} />
    </View>
  </ReportDocument>;
}
