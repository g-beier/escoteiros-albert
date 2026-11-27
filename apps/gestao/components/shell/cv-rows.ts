import type { CSSProperties } from "react";

/**
 * Blocos de uma tabela longa renderizada no servidor (utilitários `cv-table`/`cv-rows` do tema): cada `<tbody>` com
 * até `size` linhas, que o navegador pula fora da tela. Ver o comentário de `cv-table` em packages/ui/src/theme.css.
 */
export const CV_BLOCK = 25;

export function chunk<T>(items: T[], size = CV_BLOCK): T[][] {
  const blocks: T[][] = [];
  for (let i = 0; i < items.length; i += size) blocks.push(items.slice(i, i + size));
  return blocks;
}

/** Colunas da grade (`--cv-cols`) e altura estimada de um bloco (`--cv-rows` linhas, `--cv-row-h` cada). */
export const cvCols = (columns: string[]) => ({ "--cv-cols": columns.join(" ") }) as CSSProperties;
export const cvRows = (rows: number, rowHeight?: string) =>
  ({ "--cv-rows": rows, ...(rowHeight && { "--cv-row-h": rowHeight }) }) as CSSProperties;
