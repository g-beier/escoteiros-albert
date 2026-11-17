/** Cabeçalho das tabelas, igual ao do Financeiro (Usuários, cadastros). */
export const HEAD_CLASS = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
export const CELL_CLASS = "px-3 py-1.5";

/** Tabelas no estilo da Home: sem grade, zebra, cantos arredondados. */
export const SOFT_TABLE = "min-w-[52rem] border-separate border-spacing-y-1 [&_td]:!border-0 [&_th]:!border-0";
export const SOFT_HEAD = "h-9 px-3 py-0 text-xs font-semibold tracking-wide whitespace-nowrap text-foreground bg-muted";
export const SOFT_CELL = "px-3 py-1.5 whitespace-nowrap";
export const SOFT_ROW_LIGHT = "bg-card";
export const SOFT_ROW_DARK = "bg-muted";
export const softRowRound = (dark: boolean) => (dark ? "first:rounded-l-2xl last:rounded-r-2xl" : "");
