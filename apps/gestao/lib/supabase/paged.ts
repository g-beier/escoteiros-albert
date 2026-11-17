/** Página máxima da API do Supabase (`max_rows` em supabase/config.toml). */
export const API_PAGE = 1000;

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * Lê até `max` linhas em páginas de API_PAGE: a API corta cada resposta em `max_rows`, então um
 * `.limit()` maior que isso devolveria só a primeira página, sem aviso. A consulta precisa de ordem total.
 */
export async function fetchPaged<T>(page: (from: number, to: number) => PageResult, max: number): Promise<{ data: T[]; error?: { message: string } }> {
  const data: T[] = [];
  for (let from = 0; from < max; from += API_PAGE) {
    const to = Math.min(from + API_PAGE, max) - 1;
    const { data: rows, error } = await page(from, to);
    if (error) return { data, error };
    data.push(...((rows ?? []) as T[]));
    if (!rows || rows.length < to - from + 1) break;
  }
  return { data };
}
