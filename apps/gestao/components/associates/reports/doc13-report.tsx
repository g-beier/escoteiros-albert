import { View } from "@react-pdf/renderer";
import { Band, Cell, LINE, PENDING_RED, Row } from "@/components/reports/blocks";
import { MM, ReportDocument } from "@/components/reports/report-document";
import { BLANK_AGE_ROWS, type Doc13, type Doc13Row, type Doc13Section } from "@/lib/associates/doc13";
import { BRANCH_COLORS } from "@/lib/associates/reports";

// Doc 13 – Controle de idade dos jovens em PDF (conteúdo em lib/associates/doc13.ts): uma tabela só, cabeçalho
// Nome | Nascimento | Idade | Período de transição e, por seção, a faixa na cor do ramo com a faixa de idade. Linha
// em negrito quando o período de transição já está vigente; linhas vazias no fim de cada seção (também nas vazias).
// Uma seção nunca se parte entre páginas: cada uma é um bloco com contorno próprio, encostado no anterior (a
// borda de cima sobrepõe a de baixo do vizinho, sem dobrar), para a tabela continuar fechada quando pula de página.

const BIRTH = 25 * MM;
const AGE = 30 * MM;
const PERIOD = 42 * MM;
const NAME_FIT = 38;
/** Contorno de cada bloco: esquerda e cima (as células fecham direita e baixo); sobe uma linha sobre o vizinho. */
const FRAME = { borderTopWidth: LINE, borderLeftWidth: LINE, borderColor: "#000", marginTop: -LINE };

function AgeRow({ row }: { row?: Doc13Row }) {
  const bold = row?.current ?? false;
  return <Row>
    <Cell fit={NAME_FIT} bold={bold} color={row?.red ? PENDING_RED : undefined}>{row?.name}</Cell>
    <Cell width={BIRTH} bold={bold}>{row ? row.birth ?? "—" : undefined}</Cell>
    <Cell width={AGE} bold={bold} uppercase={false}>{row?.age}</Cell>
    <Cell width={PERIOD} bold={bold} uppercase={false}>{row ? row.period ?? "—" : undefined}</Cell>
  </Row>;
}

function SectionGroup({ section }: { section: Doc13Section }) {
  return <View wrap={false} style={FRAME}>
    <Band fill={BRANCH_COLORS[section.branch]} weight={500} uppercase={false}>{section.label}</Band>
    {section.rows.map((row) => <AgeRow key={row.id} row={row} />)}
    {Array.from({ length: BLANK_AGE_ROWS }, (_, i) => <AgeRow key={`v${i}`} />)}
  </View>;
}

export function Doc13Report({ doc, title, footerName, issuedOn }: { doc: Doc13; title: string; footerName: string; issuedOn: string }) {
  return <ReportDocument title={title} footerName={footerName} issuedOn={issuedOn}>
    <View style={[FRAME, { marginTop: 0 }]}>
      <Row>
        <Cell bold>Nome</Cell>
        <Cell width={BIRTH} bold>Nascimento</Cell>
        <Cell width={AGE} bold>Idade</Cell>
        <Cell width={PERIOD} bold fit={19}>Período de transição</Cell>
      </Row>
    </View>
    {doc.sections.map((section) => <SectionGroup key={section.key} section={section} />)}
  </ReportDocument>;
}
