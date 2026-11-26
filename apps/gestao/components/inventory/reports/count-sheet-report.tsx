import { Text, View } from "@react-pdf/renderer";
import { Band, Cell, COMPACT_FONT, LINE, Row, ROW_HEIGHT } from "@/components/reports/blocks";
import { CONTENT_HEIGHT, MM, ReportDocument } from "@/components/reports/report-document";
import { BLANK_COUNT_ROWS, type CountSheet, type CountSheetBlock, type CountSheetLine } from "@/lib/inventory/report";

// PDF de conferência do inventário (conteúdo em lib/inventory/report.ts): cada divisão raiz em página nova; por
// divisão, a faixa com o caminho, o cabeçalho e os materiais na ordem escolhida, com as colunas Contado e Observação
// em branco para preencher à mão, e linhas vazias no fim (material achado que não está na lista). Uma divisão só se
// parte entre páginas quando não cabe numa página; no fim de cada parte, quem conferiu e quando.

const QTY = 14 * MM;
const CONDITION = 30 * MM;
const EXPIRY = 20 * MM;
const COUNTED = 18 * MM;
const NOTES = 32 * MM;
const NAME_FIT = 34;
/** Contorno de cada bloco: esquerda e cima (as células fecham direita e baixo); sobe uma linha sobre o vizinho. */
const FRAME = { borderTopWidth: LINE, borderLeftWidth: LINE, borderColor: "#000", marginTop: 3 * MM };

function Header() {
  return <Row>
    <Cell bold>Material</Cell>
    <Cell width={QTY} bold uppercase={false}>Qtd.</Cell>
    <Cell width={CONDITION} bold>Estado</Cell>
    <Cell width={EXPIRY} bold fit={8}>Validade</Cell>
    <Cell width={COUNTED} bold fit={7}>Contado</Cell>
    <Cell width={NOTES} bold>Observação</Cell>
  </Row>;
}

function Line({ line }: { line?: CountSheetLine }) {
  return <Row>
    <Cell align="left" uppercase={false} fit={line?.tags ? undefined : NAME_FIT}>
      {line ? <>{line.name}{line.tags ? <Text style={{ fontSize: 6.5, color: "#444" }}>{`\n${line.tags}`}</Text> : null}</> : undefined}
    </Cell>
    <Cell width={QTY}>{line ? String(line.quantity) : undefined}</Cell>
    <Cell width={CONDITION} uppercase={false} size={COMPACT_FONT}>{line?.condition ?? undefined}</Cell>
    <Cell width={EXPIRY} size={COMPACT_FONT}>{line?.expiry ?? undefined}</Cell>
    <Cell width={COUNTED} />
    <Cell width={NOTES} />
  </Row>;
}

function Block({ block }: { block: CountSheetBlock }) {
  // Cabe numa página? Então não se parte (faixa + cabeçalho + linhas + vazias).
  const fits = (block.lines.length + BLANK_COUNT_ROWS + 2) * ROW_HEIGHT * 1.15 < CONTENT_HEIGHT;
  return <View wrap={!fits} style={FRAME}>
    <Band uppercase={false}>{block.title}</Band>
    <Header />
    {block.lines.map((line) => <Line key={line.materialId} line={line} />)}
    {Array.from({ length: BLANK_COUNT_ROWS }, (_, i) => <Line key={`v${i}`} />)}
  </View>;
}

function Signature() {
  return <View wrap={false} style={{ flexDirection: "row", gap: 8 * MM, marginTop: 8 * MM, fontSize: 9.5 }}>
    <Text style={{ flex: 1 }}>Conferido por: ______________________________________</Text>
    <Text>Data: ____/____/________</Text>
  </View>;
}

export function CountSheetReport({ sheet, title, footerName, issuedOn }: { sheet: CountSheet; title: string; footerName: string; issuedOn: string }) {
  if (sheet.parts.length === 0) {
    return <ReportDocument title={title} footerName={footerName} issuedOn={issuedOn}>
      <Text style={{ fontSize: 10 }}>Nenhum material nas divisões escolhidas.</Text>
    </ReportDocument>;
  }
  return <ReportDocument title={title} footerName={footerName} issuedOn={issuedOn}
    parts={sheet.parts.map((part) => <View key={part.locationId}>
      {part.blocks.map((block) => <Block key={block.locationId} block={block} />)}
      <Signature />
    </View>)} />;
}
