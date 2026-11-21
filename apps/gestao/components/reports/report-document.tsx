import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { RULE_PURPLE, updatedLabel } from "@/lib/associates/reports";
import { REPORT_FONT, registerReportFonts } from "./fonts";

// Página comum de todos os relatórios: A4 retrato, mesmas margens, cabeçalho (logos, UEB/região, nome do grupo e o
// título entre duas linhas roxas) só no começo de cada parte (a primeira página, ou cada `parts`), e rodapé (nome
// do documento e data da emissão) em toda página.

/** 1 mm em pontos (unidade do PDF). */
export const MM = 72 / 25.4;
/** Margens da página: laterais e topo iguais; o rodapé fica dentro da margem de baixo. */
export const MARGIN = { x: 15 * MM, top: 12 * MM, bottom: 18 * MM };
/** Largura útil (A4 = 210 mm). */
export const CONTENT_WIDTH = 210 * MM - 2 * MARGIN.x;
/** Altura útil de uma página sem cabeçalho (A4 = 297 mm menos as margens), com folga para o rodapé. */
export const PAGE_BODY_HEIGHT = 262 * MM;
/** Altura do cabeçalho (logos, nome do grupo e título), só na primeira página de cada parte. */
export const HEADER_HEIGHT = 40 * MM;
/** Altura útil na página com cabeçalho. */
export const CONTENT_HEIGHT = PAGE_BODY_HEIGHT - HEADER_HEIGHT;

const image = (name: string) => ({ data: fs.readFileSync(path.join(process.cwd(), "public", "images", "report", name)), format: "png" as const });
let logos: { face: ReturnType<typeof image>; wosm: ReturnType<typeof image> } | null = null;
const loadLogos = () => (logos ??= { face: image("rosto.png"), wosm: image("wosm.png") });

const styles = StyleSheet.create({
  page: { fontFamily: REPORT_FONT, fontSize: 10, color: "#000", paddingTop: MARGIN.top, paddingBottom: MARGIN.bottom, paddingHorizontal: MARGIN.x },
  header: { marginBottom: 6 * MM },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 * MM },
  face: { width: 17 * MM, height: 23 * MM, objectFit: "contain" },
  wosm: { width: 21 * MM, height: 21 * MM, objectFit: "contain" },
  org: { flex: 1, alignItems: "center", paddingHorizontal: 4 * MM },
  region: { fontSize: 11, fontWeight: 400 },
  group: { fontSize: 15, fontWeight: 700, marginTop: 1 },
  title: { borderTopWidth: 2, borderBottomWidth: 2, borderColor: RULE_PURPLE, paddingVertical: 1.2 * MM, textAlign: "center", fontSize: 15, fontWeight: 700, textTransform: "uppercase" },
  footer: { position: "absolute", left: MARGIN.x, right: MARGIN.x, bottom: 8 * MM, flexDirection: "row", justifyContent: "space-between", fontSize: 8.5, color: "#5F6170" },
});

export function ReportDocument({ title, footerName, issuedOn, children, parts }: {
  /** Título no cabeçalho (fica em maiúsculas). */
  title: string;
  /** Nome no rodapé ("Documento 10 - Lista simples de efetivo"). */
  footerName: string;
  /** Data da emissão, `AAAA-MM-DD`. */
  issuedOn: string;
  /** Conteúdo de um relatório de uma parte só. */
  children?: ReactNode;
  /** Partes que começam em página nova, cada uma com o cabeçalho (ex.: Doc 10: contagem e responsáveis). */
  parts?: ReactNode[];
}) {
  registerReportFonts();
  const { face, wosm } = loadLogos();
  const sections = parts ?? [children];
  return <Document title={`${footerName} (${issuedOn})`} author="Grupo Escoteiro Albert Schweitzer - 38º/RS" language="pt-BR">
    {sections.map((content, index) => <Page key={index} size="A4" orientation="portrait" style={styles.page}>
      <View style={styles.header}>
        <View style={styles.brand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf, não <img> */}
          <Image src={face} style={styles.face} />
          <View style={styles.org}>
            <Text style={styles.region}>União dos Escoteiros do Brasil - Região do Rio Grande do Sul</Text>
            <Text style={styles.group}>Grupo Escoteiro Albert Schweitzer - 38º/RS</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf, não <img> */}
          <Image src={wosm} style={styles.wosm} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      {content}
      <View style={styles.footer} fixed>
        <Text>{footerName}</Text>
        <Text>Atualizado em: {updatedLabel(issuedOn)}</Text>
      </View>
    </Page>)}
  </Document>;
}
