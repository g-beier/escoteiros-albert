import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// Medição de rolagem das telas de cliente (lancamentos.perf.ts, mensalidades.perf.ts): rola de cima a baixo em
// 120 passos com a CPU desacelerada, medindo quadros (rAF), tarefas longas e nós no DOM.
// Resultado em test-results/perf-<rótulo>-<caso>.json (PERF_LABEL).

const CPU_SLOWDOWN = Number(process.env.PERF_CPU ?? 4);
const LABEL = process.env.PERF_LABEL ?? "atual";

type Run = {
  totalMs: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  jankFrames: number;
  longTasks: number;
  longTaskMs: number;
};

/** Uma passada de rolagem; `selector` nulo rola a janela (cartões do celular). */
async function scrollOnce(page: Page, selector: string | null): Promise<Run> {
  return page.evaluate(async (selector) => {
    const el = selector ? document.querySelector<HTMLElement>(selector)! : (document.scrollingElement as HTMLElement);
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => longTasks.push(e.duration)));
    observer.observe({ type: "longtask", buffered: false });
    el.scrollTop = 0;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
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
      totalMs: Math.round(prev - start),
      avgFrameMs: +(frames.reduce((s, f) => s + f, 0) / frames.length).toFixed(1),
      p95FrameMs: +pct(0.95).toFixed(1),
      maxFrameMs: +sorted[sorted.length - 1].toFixed(1),
      jankFrames: frames.filter((f) => f > 50).length,
      longTasks: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((s, d) => s + d, 0)),
    };
  }, selector);
}

/**
 * Três passadas com a CPU desacelerada (mediana de cada número) e a contagem de nós no DOM;
 * `items` conta os itens montados (linhas ou cartões). Grava o JSON e devolve o resumo.
 */
export async function measureScrolling(
  page: Page,
  {
    name,
    selector,
    items,
    extra,
  }: { name: string; selector: string | null; items: string; extra?: Record<string, unknown> },
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const runs: Run[] = [];
  for (let i = 0; i < 3; i++) runs.push(await scrollOnce(page, selector));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const dom = await page.evaluate(
    (items) => ({
      nodes: document.getElementsByTagName("*").length,
      renderedRows: document.querySelectorAll(items).length,
    }),
    items,
  );
  const median = (key: keyof Run) => [...runs.map((r) => r[key])].sort((a, b) => a - b)[1];
  const result = {
    label: LABEL,
    view: name,
    cpuSlowdown: CPU_SLOWDOWN,
    ...extra,
    ...dom,
    avgFrameMs: median("avgFrameMs"),
    p95FrameMs: median("p95FrameMs"),
    maxFrameMs: median("maxFrameMs"),
    jankFrames: median("jankFrames"),
    longTasks: median("longTasks"),
    longTaskMs: median("longTaskMs"),
    totalMs: median("totalMs"),
  };
  console.log(JSON.stringify(result));
  mkdirSync("test-results", { recursive: true });
  writeFileSync(`test-results/perf-${LABEL}-${name}.json`, JSON.stringify({ ...result, runs }, null, 2));
  return result;
}
