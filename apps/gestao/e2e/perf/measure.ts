import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../support/env";

// Medição das telas renderizadas no servidor (e2e/perf/*.perf.ts): carga inicial e rolagem da janela com a CPU
// desacelerada. Mesmo método de lancamentos.perf.ts (quadros rAF, tarefas longas, nós no DOM).

export const CPU_SLOWDOWN = Number(process.env.PERF_CPU ?? 4);
export const LABEL = process.env.PERF_LABEL ?? "atual";
export const lit = (value: string) => `'${value.replaceAll("'", "''")}'`;
/** Grupo do administrador E2E (o único dele): os dados de medição ficam só aí. */
export const E2E_GROUP = `(select m.group_id from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${lit(E2E_ADMIN_EMAIL)})`;
/** Abre uma transação como o administrador E2E (RLS e funções auditadas valem como para ele). */
export const AS_ADMIN = `
  select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true)
    from auth.users u where u.email = ${lit(E2E_ADMIN_EMAIL)};
  set local role authenticated;`;

/**
 * PERF_UNDO_CV=1 desfaz a janela por CSS (`cv-table`/`cv-rows` voltam a ser tabela comum) para comparar com a
 * mesma marcação, sem trocar de código.
 */
const UNDO_CV = process.env.PERF_UNDO_CV === "1";
const UNDO_CV_CSS = `.cv-table{display:table!important}.cv-table>:is(thead,tbody,tfoot){display:table-row-group!important;content-visibility:visible!important}
.cv-table>thead{display:table-header-group!important}.cv-table>*>tr{display:table-row!important}.cv-table>*>tr>:is(td,th){display:table-cell!important}
.cv-table>colgroup{display:table-column-group!important}.cv-rows{content-visibility:visible!important}`;

/** Aplica PERF_UNDO_CV em toda página carregada daqui em diante. */
export async function prepare(page: Page) {
  if (!UNDO_CV) return;
  await page.addInitScript((css) => {
    const add = () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add);
  }, UNDO_CV_CSS);
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Carga inicial com a CPU desacelerada: tempos da navegação, LCP e tarefas longas até a página assentar
 * (hidratação incluída). Uma visita de aquecimento antes (o dev server compila na primeira).
 */
export async function measureLoad(page: Page, url: string, ready: string) {
  await prepare(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __perf: { lcp: number; longTasks: number[] } };
    w.__perf = { lcp: 0, longTasks: [] };
    new PerformanceObserver((list) =>
      list.getEntries().forEach((e) => {
        w.__perf.lcp = e.startTime;
      }),
    ).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__perf.longTasks.push(e.duration))).observe({
      type: "longtask",
      buffered: true,
    });
  });
  await page.goto(url);
  await page.locator(ready).first().waitFor();
  const cdp = await page.context().newCDPSession(page);
  const runs: Awaited<ReturnType<typeof loadSample>>[] = [];
  for (let i = 0; i < 3; i++) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
    await page.goto(url, { waitUntil: "load" });
    await page.locator(ready).first().waitFor();
    await page.waitForTimeout(1500);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    runs.push(await loadSample(page));
  }
  const keys = Object.keys(runs[0]) as (keyof (typeof runs)[number])[];
  return Object.fromEntries(keys.map((key) => [key, median(runs.map((r) => r[key]))])) as (typeof runs)[number];
}

/** Tempos da navegação, LCP e tarefas longas da página carregada. */
function loadSample(page: Page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const w = window as unknown as { __perf: { lcp: number; longTasks: number[] } };
    return {
      ttfbMs: Math.round(nav.responseStart),
      responseEndMs: Math.round(nav.responseEnd),
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadMs: Math.round(nav.loadEventEnd),
      lcpMs: Math.round(w.__perf.lcp),
      loadLongTasks: w.__perf.longTasks.length,
      loadLongTaskMs: Math.round(w.__perf.longTasks.reduce((s, d) => s + d, 0)),
      htmlKB: Math.round(nav.decodedBodySize / 1024),
    };
  });
}

/** Rola a janela de cima a baixo em 120 passos e mede quadros e tarefas longas. */
async function scrollOnce(page: Page) {
  return page.evaluate(async () => {
    const el = document.scrollingElement as HTMLElement;
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => longTasks.push(e.duration)));
    observer.observe({ type: "longtask", buffered: false });
    el.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    const frames: number[] = [];
    const max = el.scrollHeight - el.clientHeight;
    const steps = 120;
    let prev = performance.now();
    const start = prev;
    for (let i = 1; i <= steps; i++) {
      el.scrollTop = (max * i) / steps;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const now = performance.now();
      frames.push(now - prev);
      prev = now;
    }
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      scrollHeight: el.scrollHeight,
      totalMs: Math.round(prev - start),
      avgFrameMs: +(frames.reduce((s, f) => s + f, 0) / frames.length).toFixed(1),
      p95FrameMs: +pct(0.95).toFixed(1),
      maxFrameMs: +sorted[sorted.length - 1].toFixed(1),
      jankFrames: frames.filter((f) => f > 50).length,
      longTasks: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((s, d) => s + d, 0)),
    };
  });
}

export async function measureScroll(page: Page, rowSelector: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const runs: Awaited<ReturnType<typeof scrollOnce>>[] = [];
  for (let i = 0; i < 3; i++) runs.push(await scrollOnce(page));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // Estilo + layout da página inteira (troca o tamanho da fonte da raiz): custo de qualquer mudança que mexe em tudo.
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const relayout = await page.evaluate(async () => {
    const times: number[] = [];
    for (let i = 0; i < 6; i++) {
      const start = performance.now();
      document.documentElement.style.fontSize = i % 2 ? "" : "15.9px";
      void document.body.offsetHeight;
      times.push(performance.now() - start);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    }
    return times.sort((a, b) => a - b)[3];
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const dom = await page.evaluate(
    (selector) => ({
      nodes: document.getElementsByTagName("*").length,
      rows: document.querySelectorAll(selector).length,
    }),
    rowSelector,
  );
  const keys = Object.keys(runs[0]) as (keyof (typeof runs)[number])[];
  return {
    ...dom,
    relayoutMs: Math.round(relayout),
    ...(Object.fromEntries(keys.map((key) => [key, median(runs.map((r) => r[key]))])) as (typeof runs)[number]),
    runs,
  };
}

/** Grava test-results/perf-<rótulo>-<tela>.json e mostra o resumo no console. */
export function report(view: string, data: Record<string, unknown>) {
  const { runs, ...summary } = data as { runs?: unknown };
  const result = { label: LABEL, view, undoCv: UNDO_CV || undefined, cpuSlowdown: CPU_SLOWDOWN, ...summary };
  console.log(JSON.stringify(result));
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/perf-${LABEL}-${view}.json`, JSON.stringify({ ...result, runs }, null, 2));
}
