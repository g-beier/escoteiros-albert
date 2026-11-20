import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { Band, Cell, COMPACT_FONT, COMPACT_ROW_HEIGHT, fitSize, LINE, PENDING_RED, Row, ROW_HEIGHT, Table, THICK } from "@/components/reports/blocks";
import { MM, PAGE_BODY_HEIGHT, ReportDocument } from "@/components/reports/report-document";
import {
  BLANK_FAMILIES, BLANK_FAMILY_ROWS, twoColumnRows,
  type Doc10, type Doc10Family, type Doc10FamilySection, type Doc10Name, type Doc10Section,
} from "@/lib/associates/doc10";
import { BAND_GRAY, BRANCH_COLORS, ROLE_COLORS } from "@/lib/associates/reports";

// Doc 10 – Lista simples de efetivo em PDF (conteúdo em lib/associates/doc10.ts). Parte 1: um bloco por seção,
// totais, diretoria, totalização e outros. Parte 2 (nova página): responsáveis por seção. Nenhum bloco se parte
// entre páginas; cada lista tem linhas vazias e uma coluna em branco para conferir à mão no impresso.

/** Coluna em branco de controle (e de contagem nos cabeçalhos). */
const CHECK = 18 * MM;
const NAME_FIT = 34;
const BOARD_PURPLE = "#B1A3CF";
const TOTALS_BLUE = "#BBDDFB";
const OTHERS_ORANGE = ROLE_COLORS.honorifico;
/** Responsável que também é associado (inclusive escotista). */
const ASSOCIATE_BLUE = TOTALS_BLUE;
const SEE = 18 * MM;
const YOUTH_SHARE = "42%";

const styles = StyleSheet.create({
  /** Vão entre blocos: pequeno, para os totais caberem junto das últimas seções em vez de ficarem sozinhos. */
  block: { marginBottom: 3.5 * MM },
  halves: { flexDirection: "row" },
  half: { flex: 1 },
  halfRight: { width: "50%", marginLeft: "50%" },
  thick: { borderWidth: THICK, borderColor: "#000" },
  totalRow: { flexDirection: "row", minHeight: ROW_HEIGHT },
  totalLabel: { flex: 1, justifyContent: "center", borderRightWidth: LINE, borderColor: "#000" },
  totalValue: { width: CHECK, justifyContent: "center" },
  totalText: { fontSize: 10.5, fontWeight: 500, textAlign: "center" },
  divider: { borderTopWidth: LINE, borderColor: "#000" },
  family: { flexDirection: "row", borderBottomWidth: THICK, borderColor: "#000" },
  youth: { width: YOUTH_SHARE, justifyContent: "center", borderRightWidth: LINE, borderColor: "#000", paddingHorizontal: 1.5 * MM },
  relatives: { flex: 1, flexDirection: "row" },
  names: { flex: 1 },
  relRow: { flexDirection: "row", minHeight: COMPACT_ROW_HEIGHT },
  relName: { flex: 1, justifyContent: "center", borderRightWidth: LINE, borderColor: "#000", paddingHorizontal: 1.5 * MM },
  see: { width: SEE, justifyContent: "center", borderRightWidth: LINE, borderColor: "#000" },
  text: { fontSize: COMPACT_FONT, fontWeight: 500, textAlign: "center", textTransform: "uppercase" },
  seeText: { fontSize: COMPACT_FONT, fontWeight: 500, textAlign: "center" },
  head: { flexDirection: "row", minHeight: COMPACT_ROW_HEIGHT, backgroundColor: BAND_GRAY, borderBottomWidth: LINE, borderColor: "#000" },
  note: { marginTop: 2 * MM, marginLeft: YOUTH_SHARE, fontSize: 8.5 },
});

const blank = (count: number) => Array.from({ length: Math.max(count, 0) }, (_, i) => i);

/** Nome numa lista: maiúsculas, vermelho se pendente, negrito se eleito/comissão fiscal. */
function NameRow({ person }: { person?: Doc10Name }) {
  return <Row>
    <Cell fit={NAME_FIT} bold={person?.bold} color={person?.red ? PENDING_RED : undefined}>{person?.name}</Cell>
    <Cell width={CHECK} />
  </Row>;
}

function HeadRow({ label, count }: { label: string; count: number }) {
  return <Row><Cell fill={BAND_GRAY} uppercase={false}>{label}</Cell><Cell fill={BAND_GRAY} width={CHECK}>{String(count)}</Cell></Row>;
}

/** Lista com `rows` linhas: os nomes e, depois, as vazias. */
function List({ people, rows }: { people: Doc10Name[]; rows: number }) {
  return <>{people.map((person) => <NameRow key={person.id} person={person} />)}{blank(rows - people.length).map((i) => <NameRow key={`v${i}`} />)}</>;
}

function SectionBlock({ section }: { section: Doc10Section }) {
  return <View style={styles.block} wrap={false}>
    <Table>
      <Band fill={BRANCH_COLORS[section.branch]} weight={500}>{section.title}</Band>
      <View style={styles.halves}>
        <View style={styles.half}>
          <HeadRow label="ADULTOS" count={section.adults.length} />
          <List people={section.adults} rows={section.rows.adults} />
        </View>
        <View style={styles.half}>
          <HeadRow label="JOVENS - Registro definitivo" count={section.definitive.length} />
          <List people={section.definitive} rows={section.rows.definitive} />
          <HeadRow label="JOVENS - Registro provisório" count={section.provisional.length} />
          <List people={section.provisional} rows={section.rows.provisional} />
        </View>
      </View>
    </Table>
    <View style={[styles.halfRight, { borderLeftWidth: LINE, borderColor: "#000" }]}>
      <HeadRow label="JOVENS - Total" count={section.definitive.length + section.provisional.length} />
    </View>
  </View>;
}

/** Caixa de total com borda grossa: uma linha por par rótulo × valor. `half`: metade da largura, à esquerda. */
function TotalBox({ rows, half = false }: { rows: [string, number][]; half?: boolean }) {
  return <View style={[styles.block, styles.thick, half ? { width: "50%" } : {}]} wrap={false}>
    {rows.map(([label, value], index) => <View key={label} style={[styles.totalRow, index > 0 ? styles.divider : {}]}>
      <View style={styles.totalLabel}><Text style={styles.totalText}>{label}</Text></View>
      <View style={styles.totalValue}><Text style={styles.totalText}>{value}</Text></View>
    </View>)}
  </View>;
}

/** Diretoria e Outros: faixa colorida e os nomes em duas colunas, com vazias. */
function TwoColumnList({ title, fill, people }: { title: string; fill: string; people: Doc10Name[] }) {
  const { left, right, rows } = twoColumnRows(people);
  return <View style={styles.block} wrap={false}>
    <Table>
      <Band fill={fill} weight={500}>{title}</Band>
      <View style={styles.halves}>
        <View style={styles.half}><List people={left} rows={rows} /></View>
        <View style={styles.half}><List people={right} rows={rows} /></View>
      </View>
    </Table>
  </View>;
}

/**
 * Totalização: faixa azul e, abaixo, a caixa dos adultos (uma linha) e a dos jovens (três), como na planilha. Cada
 * borda é desenhada uma vez só: a faixa leva a moldura grossa de cima e dos lados e a linha fina de baixo; a caixa
 * dos adultos, a grossa da esquerda e de baixo; a dos jovens, a grossa da esquerda (divisa com os adultos), da
 * direita e de baixo.
 */
function Totalization({ doc }: { doc: Doc10 }) {
  const row = (label: string, value: number, index: number) => <View key={label} style={[styles.totalRow, index > 0 ? styles.divider : {}]}>
    <View style={styles.totalLabel}><Text style={styles.totalText}>{label}</Text></View>
    <View style={styles.totalValue}><Text style={styles.totalText}>{value}</Text></View>
  </View>;
  return <View style={styles.block} wrap={false}>
    <View style={{ borderTopWidth: THICK, borderLeftWidth: THICK, borderRightWidth: THICK, borderColor: "#000" }}>
      <View style={{ minHeight: ROW_HEIGHT, backgroundColor: TOTALS_BLUE, borderBottomWidth: LINE, borderColor: "#000", justifyContent: "center" }}>
        <Text style={[styles.totalText, { textTransform: "uppercase" }]}>Totalização</Text>
      </View>
    </View>
    <View style={[styles.halves, { alignItems: "flex-start" }]}>
      <View style={[styles.half, { borderLeftWidth: THICK, borderBottomWidth: THICK, borderColor: "#000" }]}>
        {row("TOTAL ADULTOS", doc.totalAdults, 0)}
      </View>
      <View style={[styles.half, { borderLeftWidth: THICK, borderRightWidth: THICK, borderBottomWidth: THICK, borderColor: "#000" }]}>
        {[["TOTAL JOVENS - Registro definitivo", doc.youth.definitive], ["TOTAL JOVENS - Registro provisório", doc.youth.provisional],
          ["TOTAL JOVENS", doc.youth.total]].map(([label, value], index) => row(label as string, value as number, index))}
      </View>
    </View>
  </View>;
}

/** Responsável: fundo azul se é associado; asterisco se não é responsável legal deste jovem. */
function RelativeName({ name, associate, notLegal }: { name?: string; associate?: boolean; notLegal?: boolean }) {
  return <View style={[styles.relName, associate ? { backgroundColor: ASSOCIATE_BLUE } : {}]}>
    <Text style={[styles.text, { fontSize: fitSize(name ?? null, 40, COMPACT_FONT) }]}>{name ? `${name}${notLegal ? "*" : ""}` : " "}</Text>
  </View>;
}

const seeLabel = (see: string | null) => (see ? `Ver ${see}` : " ");

function FamilyBlock({ family, rows }: { family?: Doc10Family; rows?: number }) {
  const relatives = family?.relatives ?? [];
  const count = Math.max(relatives.length, rows ?? 1);
  const youth = family?.youth;
  return <View style={styles.family} wrap={false}>
    <View style={styles.youth}>
      <Text style={[styles.text, youth?.red ? { color: PENDING_RED } : {}, { fontSize: fitSize(youth?.name ?? null, 34, COMPACT_FONT) }]}>{youth?.name ?? " "}</Text>
    </View>
    {family?.seeMerged
      ? <View style={styles.relatives}>
        <View style={styles.names}>{relatives.map((r, i) => <View key={r.id} style={[styles.relRow, i > 0 ? styles.divider : {}]}><RelativeName {...r} /></View>)}</View>
        <View style={styles.see}><Text style={styles.seeText}>{seeLabel(family.seeMerged)}</Text></View>
      </View>
      : <View style={styles.names}>
        {blank(count).map((i) => {
          const r = relatives[i];
          return <View key={r?.id ?? `v${i}`} style={[styles.relRow, i > 0 ? styles.divider : {}]}>
            <RelativeName name={r?.name} associate={r?.associate} notLegal={r?.notLegal} />
            <View style={styles.see}><Text style={styles.seeText}>{seeLabel(r?.see ?? null)}</Text></View>
          </View>;
        })}
      </View>}
  </View>;
}

/** Linhas da seção de responsáveis: faixa, cabeçalho, uma por responsável (mín. 1 por jovem), vazias e a nota. */
const familyRows = (section: Doc10FamilySection) =>
  3 + section.families.reduce((sum, f) => sum + Math.max(f.relatives.length, 1), 0) + BLANK_FAMILIES * BLANK_FAMILY_ROWS;

/**
 * Seção de responsáveis: inteira numa página. Se não couber nem numa página inteira sem cabeçalho (seção muito
 * grande), quebra entre jovens (nunca dentro de uma família).
 */
function FamilySection({ section }: { section: Doc10FamilySection }) {
  const fits = familyRows(section) * COMPACT_ROW_HEIGHT <= PAGE_BODY_HEIGHT;
  return <View style={styles.block} wrap={!fits}>
    <View style={{ borderTopWidth: LINE, borderLeftWidth: LINE, borderColor: "#000" }}>
      <Band fill={BRANCH_COLORS[section.branch]} weight={500}>{section.title}</Band>
      <View style={styles.head}>
        <View style={styles.youth}><Text style={styles.seeText}>JOVENS</Text></View>
        <View style={[styles.relName, { flex: 1 }]}><Text style={styles.seeText}>PAIS, RESPONSÁVEIS E FAMILIARES</Text></View>
      </View>
      {section.families.map((family) => <FamilyBlock key={family.youth.id} family={family} />)}
      {blank(BLANK_FAMILIES).map((i) => <FamilyBlock key={`v${i}`} rows={BLANK_FAMILY_ROWS} />)}
    </View>
    <Text style={styles.note}>* Não é responsável legal [tio(a), avô(ó), padrasto, madrasta, etc.].</Text>
  </View>;
}

export function Doc10Report({ doc, title, footerName, issuedOn }: { doc: Doc10; title: string; footerName: string; issuedOn: string }) {
  return <ReportDocument title={title} footerName={footerName} issuedOn={issuedOn} parts={[
    <View key="efetivo">
      {doc.sections.map((section) => <SectionBlock key={section.key} section={section} />)}
      {/* totais, diretoria e outros: um bloco só, depois da última seção ou inteiro na página seguinte (sem caixa solta) */}
      <View wrap={false}>
        <TotalBox half rows={[["TOTAL ESCOTISTAS", doc.totalScouters]]} />
        <TwoColumnList title="Diretoria" fill={BOARD_PURPLE} people={doc.board} />
        <TotalBox half rows={[["TOTAL DIRETORES", doc.totalDirectors]]} />
        <Totalization doc={doc} />
        <TotalBox rows={[["TOTAL BÁSICO", doc.basic]]} />
        <TwoColumnList title="Outros" fill={OTHERS_ORANGE} people={doc.others} />
        <TotalBox half rows={[["TOTAL OUTROS", doc.totalOthers]]} />
        <TotalBox rows={[["TOTAL - Registro definitivo", doc.totalDefinitive], ["TOTAL NO PAXTU", doc.totalPaxtu]]} />
      </View>
    </View>,
    // responsáveis: parte nova, com o cabeçalho de novo
    <View key="responsaveis">{doc.families.map((section) => <FamilySection key={section.key} section={section} />)}</View>,
  ]} />;
}
