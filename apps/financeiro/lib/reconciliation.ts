/** Regras puras da conciliação (extrato × lançamentos): sugestões, período, forma provável e fechamento. */

export type OpenLine = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  kind: string | null;
  counterparty: string | null;
  /** ID OFX (FITID). */
  externalId?: string | null;
  /** TRNTYPE do OFX (CREDIT, DEBIT, PAYMENT, XFER, FEE…). */
  trnType?: string | null;
};

export type OpenEntry = {
  id: string;
  date: string;
  totalCents: number;
  name: string;
  paymentMethodName?: string;
  /** Digitado sem conta ("A definir"): candidato em qualquer conta; ao vincular, vai para a conta do extrato. */
  unassigned?: boolean;
};

export type Rejection = { lineId: string; entryId: string };

export type ExactSuggestion = { lineId: string; entryId: string };

/** Vários candidatos com mesma data e valor: sem par automático; entradas ordenadas pela semelhança. */
export type AmbiguousGroup = {
  date: string;
  amountCents: number;
  lineIds: string[];
  entryIds: string[];
  /** Para cada linha, os lançamentos possíveis do mais ao menos parecido. */
  candidates: Record<string, string[]>;
};

/** Mesmo valor, data a até `NEAR_DAYS` dias (ex.: Pix de sexta compensado na segunda). Aceita-se um a um. */
export type NearSuggestion = { lineId: string; entryId: string; days: number };

export type Suggestions = { exact: ExactSuggestion[]; ambiguous: AmbiguousGroup[]; near: NearSuggestion[] };

export const NEAR_DAYS = 3;

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/** Minúsculas, sem acentos nem pontuação, palavras de 2+ letras. */
export function nameTokens(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((token) => token.length >= 2);
}

/**
 * Semelhança entre o texto do extrato e o nome do lançamento (0 a 1): fração das palavras
 * do lado menor encontradas no outro. Prefixos contam (o Itaú trunca: "MARC" ~ "Marcia").
 */
export function similarity(a: string, b: string) {
  const left = [...new Set(nameTokens(a))];
  const right = [...new Set(nameTokens(b))];
  if (!left.length || !right.length) return 0;
  const [small, large] = left.length <= right.length ? [left, right] : [right, left];
  const matches = small.filter((token) => large.some((other) => other === token
    || (token.length >= 3 && other.startsWith(token)) || (other.length >= 3 && token.startsWith(other)))).length;
  return matches / small.length;
}

export const lineText = (line: Pick<OpenLine, "counterparty" | "description">) =>
  [line.counterparty, line.description].filter(Boolean).join(" ");

const pairKey = (lineId: string, entryId: string) => `${lineId}:${entryId}`;

/**
 * Regra exata (fase 3): mesma data e mesmo valor com sinal. Um par só é sugerido quando a linha
 * tem um único candidato e esse lançamento também só tem essa linha como candidata; pares recusados
 * não contam. O resto dos candidatos com mesma data e valor forma um grupo ambíguo.
 */
export function suggestMatches(lines: OpenLine[], entries: OpenEntry[], rejections: Rejection[] = []): Suggestions {
  const rejected = new Set(rejections.map((r) => pairKey(r.lineId, r.entryId)));
  const key = (date: string, cents: number) => `${date}|${cents}`;
  const entriesByKey = new Map<string, OpenEntry[]>();
  for (const entry of entries) {
    const k = key(entry.date, entry.totalCents);
    entriesByKey.set(k, [...(entriesByKey.get(k) ?? []), entry]);
  }
  const linesByKey = new Map<string, OpenLine[]>();
  for (const line of lines) {
    const k = key(line.date, line.amountCents);
    linesByKey.set(k, [...(linesByKey.get(k) ?? []), line]);
  }

  const exact: ExactSuggestion[] = [];
  const ambiguous: AmbiguousGroup[] = [];
  for (const [k, keyLines] of [...linesByKey].sort(([a], [b]) => a.localeCompare(b))) {
    const keyEntries = entriesByKey.get(k);
    if (!keyEntries) continue;
    const lineOptions = new Map(keyLines.map((line) => [line.id, keyEntries.filter((e) => !rejected.has(pairKey(line.id, e.id)))]));
    const entryOptions = new Map(keyEntries.map((entry) => [entry.id, keyLines.filter((l) => !rejected.has(pairKey(l.id, entry.id)))]));

    const paired = new Set<string>();
    for (const line of keyLines) {
      const options = lineOptions.get(line.id)!;
      if (options.length === 1 && entryOptions.get(options[0].id)!.length === 1) {
        exact.push({ lineId: line.id, entryId: options[0].id });
        paired.add(line.id).add(options[0].id);
      }
    }

    const restLines = keyLines.filter((l) => !paired.has(l.id) && lineOptions.get(l.id)!.length > 0);
    if (!restLines.length) continue;
    const candidates: Record<string, string[]> = {};
    for (const line of restLines) {
      const text = lineText(line);
      candidates[line.id] = lineOptions.get(line.id)!
        .map((entry, index) => ({ entry, index, score: similarity(text, entry.name) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ entry }) => entry.id);
    }
    const entryIds = keyEntries.filter((e) => !paired.has(e.id) && restLines.some((l) => candidates[l.id].includes(e.id)));
    ambiguous.push({
      date: keyLines[0].date, amountCents: keyLines[0].amountCents,
      lineIds: restLines.map((l) => l.id), entryIds: alignEntries(restLines.map((l) => l.id), entryIds.map((e) => e.id), candidates),
      candidates,
    });
  }
  return { exact, ambiguous, near: nearMatches(lines, entries, rejected, new Set([
    ...exact.flatMap((x) => [x.lineId, x.entryId]), ...ambiguous.flatMap((g) => [...g.lineIds, ...g.entryIds]),
  ])) };
}

/**
 * Regra ampliada: entre o que sobrou, mesmo valor e data a até NEAR_DAYS dias. Só sugere quando a linha
 * tem um único candidato e o lançamento só essa linha; nome parecido desempata quando há mais de um.
 */
function nearMatches(lines: OpenLine[], entries: OpenEntry[], rejected: Set<string>, taken: Set<string>): NearSuggestion[] {
  const freeLines = lines.filter((l) => !taken.has(l.id));
  const freeEntries = entries.filter((e) => !taken.has(e.id));
  const close = (line: OpenLine, entry: OpenEntry) => line.amountCents === entry.totalCents
    && Math.abs(dayNumber(line.date) - dayNumber(entry.date)) <= NEAR_DAYS && !rejected.has(pairKey(line.id, entry.id));
  const best = (line: OpenLine, options: OpenEntry[]) => {
    if (options.length <= 1) return options[0];
    const scored = options.map((entry) => ({ entry, score: similarity(lineText(line), entry.name) })).sort((a, b) => b.score - a.score);
    return scored[0].score > 0 && scored[0].score > scored[1].score ? scored[0].entry : undefined;
  };
  const result: NearSuggestion[] = [];
  const used = new Set<string>();
  for (const line of freeLines) {
    const entry = best(line, freeEntries.filter((e) => !used.has(e.id) && close(line, e)));
    if (!entry) continue;
    // outra linha disputa o mesmo lançamento com nome tão parecido quanto: deixa para a pessoa escolher
    const score = similarity(lineText(line), entry.name);
    if (freeLines.some((other) => other.id !== line.id && close(other, entry) && similarity(lineText(other), entry.name) >= score)) continue;
    used.add(entry.id);
    result.push({ lineId: line.id, entryId: entry.id, days: dayNumber(entry.date) - dayNumber(line.date) });
  }
  return result;
}

/** Ordena os lançamentos de um grupo ambíguo para que o mais parecido de cada linha fique na mesma altura. */
function alignEntries(lineIds: string[], entryIds: string[], candidates: Record<string, string[]>) {
  const used = new Set<string>();
  const aligned: string[] = [];
  for (const lineId of lineIds) {
    const best = candidates[lineId].find((id) => !used.has(id));
    if (best) { used.add(best); aligned.push(best); }
  }
  return [...aligned, ...entryIds.filter((id) => !used.has(id))];
}

/** Data e depois valor, para que pares prováveis fiquem na mesma altura nas duas colunas. */
export function byDateThenAmount<T>(date: (item: T) => string, amount: (item: T) => number) {
  return (a: T, b: T) => date(a).localeCompare(date(b)) || amount(a) - amount(b);
}

/** Somas da seleção manual: "Vincular" só quando batem (e a seleção não é N:M, ainda não aceita). */
export function selectionSummary(lineAmounts: number[], entryAmounts: number[]) {
  const lines = lineAmounts.reduce((sum, value) => sum + value, 0);
  const entries = entryAmounts.reduce((sum, value) => sum + value, 0);
  const manyToMany = lineAmounts.length > 1 && entryAmounts.length > 1;
  return {
    lines, entries, difference: lines - entries, manyToMany,
    canLink: lineAmounts.length > 0 && entryAmounts.length > 0 && lines === entries && !manyToMany,
  };
}

// Período ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string | undefined) => value && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : undefined;

/** Mês atual no fuso do grupo: primeiro e último dia. */
export function currentMonth(now = new Date()) {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [year, month] = today.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Período da URL (`de`, `ate`), ou o mês atual; datas invertidas são trocadas. */
export function parsePeriod(de: string | undefined, ate: string | undefined, now = new Date()) {
  const month = currentMonth(now);
  const from = validDate(de) ?? month.from;
  const to = validDate(ate) ?? (validDate(de) ? from : month.to);
  return from <= to ? { from, to } : { from: to, to: from };
}

export function reconciliationHref(params: { conta?: string; de?: string; ate?: string }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `/extrato/conciliar?${text}` : "/extrato/conciliar";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Volta para a conciliação aceitando só conta (UUID) e datas válidas, sem redirecionar para fora. */
export function safeReconciliationHref(raw: string | undefined) {
  const params = new URLSearchParams((raw ?? "").replace(/^\?/, ""));
  const conta = params.get("conta") ?? undefined;
  return reconciliationHref({
    conta: conta && UUID.test(conta) ? conta : undefined,
    de: validDate(params.get("de") ?? undefined),
    ate: validDate(params.get("ate") ?? undefined),
  });
}

// Criar lançamento a partir da linha ------------------------------------------------

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** TRNTYPE do OFX → forma de pagamento, quando o histórico não diz nada mais específico. */
const TRN_TYPE_METHODS: Record<string, string> = {
  FEE: "tarifa bancaria", SRVCHG: "tarifa bancaria",
  XFER: "transferencia",
  PAYMENT: "boleto", DIRECTDEBIT: "boleto",
  CASH: "dinheiro", ATM: "dinheiro",
  CHECK: "cheque",
};

/**
 * Forma de pagamento provável pelo tipo/histórico da linha: Pix → PIX; pagamento de conta/boleto → Boleto;
 * tarifa → Tarifa bancária; TED/DOC/transferência → Transferência; depois, pelo TRNTYPE do OFX.
 * Só devolve formas ativas existentes.
 */
export function guessPaymentMethod(line: Pick<OpenLine, "kind" | "description" | "trnType">, methods: { id: string; name: string; active: boolean }[]) {
  const text = normalize(`${line.kind ?? ""} ${line.description}`);
  const find = (name: string) => methods.find((m) => m.active && normalize(m.name) === name)?.id;
  if (/\bpix\b/.test(text)) return find("pix");
  if (/boleto|pagamento de conta|pagto conta|pag conta/.test(text)) return find("boleto");
  if (/tarifa|taxa|cesta/.test(text)) return find("tarifa bancaria");
  if (/\bted\b|\bdoc\b|transf/.test(text)) return find("transferencia");
  const byType = line.trnType ? TRN_TYPE_METHODS[line.trnType.toUpperCase()] : undefined;
  return byType ? find(byType) : undefined;
}

/** Nome do lançamento sugerido: a contraparte, senão o histórico do banco. */
export function suggestedEntryName(line: Pick<OpenLine, "counterparty" | "description">) {
  return (line.counterparty?.trim() || line.description.trim()).slice(0, 200);
}

// Ignorar ---------------------------------------------------------------------------

export const IGNORE_REASONS = [
  "Transferência entre contas próprias",
  "Estorno que se anula",
  "Linha duplicada",
] as const;
export const OTHER_REASON = "Outro";
export const DUPLICATE_REASON = "Linha duplicada";

/** Motivo gravado: um dos fixos, ou "Outro: texto". */
export function ignoreReasonText(choice: string, detail: string) {
  const text = detail.trim();
  if ((IGNORE_REASONS as readonly string[]).includes(choice)) return text ? `${choice}: ${text}` : choice;
  return text ? `${OTHER_REASON}: ${text}` : "";
}

// Fechamento ------------------------------------------------------------------------

export type StatementImportBalance = { periodFrom: string; periodTo: string; openingCents: number | null; closingCents: number | null };
export type ResolvedLine = { date: string; amountCents: number; status: "aberta" | "conciliada" | "ignorada"; ignoredReason: string | null };
export type AccountOpening = { openingBalanceCents: number; openingDate: string | null };

export type Closing =
  | { ok: false; reason: string }
  | { ok: true; openingDate: string; openingCents: number; closingDate: string; closingCents: number; movementsCents: number; pendingCents: number; differenceCents: number };

/**
 * Saldo inicial + movimentos resolvidos (conciliados ou ignorados, exceto duplicadas) = saldo final do extrato?
 * O saldo inicial vem da primeira importação do período que o informe (ou da conta, se ela começa no período);
 * o final, da última importação do período que o informe. `pendingCents` soma as linhas ainda abertas.
 */
export function closingCheck(period: { from: string; to: string }, imports: StatementImportBalance[], account: AccountOpening, lines: ResolvedLine[]): Closing {
  const inPeriod = (date: string) => date >= period.from && date <= period.to;
  const opening = imports.filter((i) => i.openingCents !== null && inPeriod(i.periodFrom))
    .sort((a, b) => a.periodFrom.localeCompare(b.periodFrom))[0];
  const start = opening
    ? { date: opening.periodFrom, cents: opening.openingCents! }
    : account.openingDate && inPeriod(account.openingDate) ? { date: account.openingDate, cents: account.openingBalanceCents } : null;
  if (!start) return { ok: false, reason: "Sem saldo inicial: importe um extrato que informe o saldo anterior do período, ou cadastre a data e o saldo inicial da conta." };
  const closing = imports.filter((i) => i.closingCents !== null && inPeriod(i.periodTo) && i.periodTo >= start.date)
    .sort((a, b) => b.periodTo.localeCompare(a.periodTo))[0];
  if (!closing) return { ok: false, reason: "Sem saldo final: nenhuma importação do período informa o saldo final do extrato." };
  const window = lines.filter((l) => l.date >= start.date && l.date <= closing.periodTo);
  const movementsCents = window.filter((l) => l.status === "conciliada" || (l.status === "ignorada" && !l.ignoredReason?.startsWith(DUPLICATE_REASON)))
    .reduce((sum, l) => sum + l.amountCents, 0);
  const pendingCents = window.filter((l) => l.status === "aberta").reduce((sum, l) => sum + l.amountCents, 0);
  return {
    ok: true, openingDate: start.date, openingCents: start.cents, closingDate: closing.periodTo, closingCents: closing.closingCents!,
    movementsCents, pendingCents, differenceCents: closing.closingCents! - (start.cents + movementsCents),
  };
}
