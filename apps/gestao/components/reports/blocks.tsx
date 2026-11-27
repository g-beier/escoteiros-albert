import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { BAND_GRAY, NO_COLOR } from "@/lib/associates/reports";
import { MM } from "./report-document";

// Blocos que se repetem nos relatórios (como nas planilhas do grupo): tabela de grade preta com células coloridas,
// faixa cinza de título, duas colunas lado a lado e legenda de cores. Bordas sem duplicar: a tabela desenha a de
// cima e a da esquerda; cada célula, a da direita e a de baixo.

/** Linha fina da grade e borda grossa (caixas de total, separação entre famílias). */
export const LINE = 0.8;
export const THICK = 1.6;
/** Altura da linha normal e da compacta (listas longas, como a de responsáveis). */
export const ROW_HEIGHT = 5 * MM;
export const COMPACT_ROW_HEIGHT = 4.4 * MM;
export const FONT = 9.5;
export const COMPACT_FONT = 8;
/** Texto em vermelho: pendência de cadastro. */
export const PENDING_RED = "#E00000";

const styles = StyleSheet.create({
  table: { borderTopWidth: LINE, borderLeftWidth: LINE, borderColor: "#000" },
  row: { flexDirection: "row", minHeight: ROW_HEIGHT },
  cell: {
    borderRightWidth: LINE,
    borderBottomWidth: LINE,
    borderColor: "#000",
    justifyContent: "center",
    paddingHorizontal: 1.5 * MM,
    paddingVertical: 0.25 * MM,
  },
  text: { fontSize: FONT, fontWeight: 500, textTransform: "uppercase", textAlign: "center" },
  band: {
    minHeight: ROW_HEIGHT,
    backgroundColor: BAND_GRAY,
    borderRightWidth: LINE,
    borderBottomWidth: LINE,
    borderColor: "#000",
    justifyContent: "center",
  },
  bandText: { fontSize: FONT + 0.5, fontWeight: 700, textTransform: "uppercase", textAlign: "center" },
  columns: { flexDirection: "row", gap: 4 * MM, alignItems: "flex-start" },
  column: { flex: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 3 * MM, marginBottom: 4 * MM },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 1.5 * MM },
  swatch: { width: 5 * MM, height: 3.2 * MM, borderWidth: LINE, borderColor: "#000" },
  legendText: { fontSize: 8.5 },
});

/**
 * Tabela: as linhas (`Row`, `Band`) dentro. `wrap={false}` em blocos que não podem quebrar de página.
 * `joined`: coluna da direita colada a outra tabela (`TwoColumns joined`): sem a borda esquerda, que a vizinha já
 * desenha, para a divisa não dobrar.
 */
export function Table({
  children,
  wrap = true,
  joined = false,
}: {
  children: ReactNode;
  wrap?: boolean;
  joined?: boolean;
}) {
  return (
    <View style={[styles.table, joined ? { borderLeftWidth: 0 } : {}]} wrap={wrap}>
      {children}
    </View>
  );
}

/** Linha da tabela; não se parte entre páginas. */
export function Row({ children }: { children: ReactNode }) {
  return (
    <View style={styles.row} wrap={false}>
      {children}
    </View>
  );
}

/** Tamanho da fonte para `text` caber em `fit` caracteres do tamanho `base` (nomes longos diminuem, não cortam). */
export const fitSize = (text: string | null, fit: number | undefined, base = FONT) =>
  fit && text && text.length > fit ? Math.max(5.5, (base * fit) / text.length) : base;

/**
 * Célula: texto em maiúsculas (`uppercase={false}` para rótulos como "JOVENS - Registro definitivo"), centralizado,
 * com fundo (`fill`) e cor do texto (`color`) opcionais. `width` em pontos ou `flex` (padrão 1). `fit`: quantos
 * caracteres cabem no tamanho normal. `size`: fonte base (ex.: `COMPACT_FONT`).
 */
export function Cell({
  children,
  fill = NO_COLOR,
  color,
  width,
  flex = 1,
  fit,
  align = "center",
  bold = false,
  uppercase = true,
  size = FONT,
}: {
  children?: ReactNode;
  fill?: string;
  color?: string;
  width?: number;
  flex?: number;
  fit?: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
  uppercase?: boolean;
  size?: number;
}) {
  const text = typeof children === "string" ? children : null;
  return (
    <View style={[styles.cell, { backgroundColor: fill }, width ? { width } : { flex }]}>
      <Text
        style={[
          styles.text,
          {
            fontSize: fitSize(text, fit && bold ? Math.floor(fit * 0.9) : fit, size),
            textAlign: align,
            textTransform: uppercase ? "uppercase" : "none",
          },
          bold ? { fontWeight: 700 } : {},
          color ? { color } : {},
        ]}
      >
        {children ?? " "}
      </Text>
    </View>
  );
}

/**
 * Faixa de título na largura da tabela ("JUNHO", "ALCATEIA"): cinza por padrão ou na cor do ramo/bloco (`fill`).
 * `weight`: 700 (padrão) ou 500, como os títulos de seção do Doc 10. `uppercase={false}`: o texto vai como veio
 * (ex.: "ALCATEIA (6,5 - 10 anos)"). Fica junto da linha seguinte.
 */
export function Band({
  children,
  fill = BAND_GRAY,
  weight = 700,
  uppercase = true,
}: {
  children: ReactNode;
  fill?: string;
  weight?: 500 | 700;
  uppercase?: boolean;
}) {
  return (
    <View style={[styles.band, { backgroundColor: fill }]} wrap={false} minPresenceAhead={ROW_HEIGHT}>
      <Text style={[styles.bandText, { fontWeight: weight, textTransform: uppercase ? "uppercase" : "none" }]}>
        {children}
      </Text>
    </View>
  );
}

/** Linha vazia de separação dentro da tabela (como nas planilhas, entre grupos). */
export function SpacerRow({ columns }: { columns: { width?: number; flex?: number }[] }) {
  return (
    <Row>
      {columns.map((column, index) => (
        <Cell key={index} {...column} />
      ))}
    </Row>
  );
}

/**
 * Duas colunas lado a lado (ex.: meses do Doc 14). O conteúdo de cada uma vem já dividido (`splitInTwo`,
 * lib/associates/reports.ts). `joined`: sem vão, numa grade só (a tabela da direita usa `Table joined`).
 */
export function TwoColumns({ left, right, joined = false }: { left: ReactNode; right: ReactNode; joined?: boolean }) {
  return (
    <View style={[styles.columns, joined ? { gap: 0 } : {}]}>
      <View style={styles.column}>{left}</View>
      <View style={styles.column}>{right}</View>
    </View>
  );
}

/** Legenda das cores (ramos e funções). */
export function ColorLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={styles.legend} wrap={false}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
