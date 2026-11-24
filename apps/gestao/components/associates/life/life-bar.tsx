import { cn } from "@geas/ui/lib/utils";
import { dateBR } from "@/lib/format";
import { barSegments, daysBetween, lifeBranchColor, lifeBranchLabel, type LifePeriod, type Star } from "@/lib/associates/scout-life";

/** Listras do trecho projetado (depois de hoje). */
const FUTURE_STRIPES = "repeating-linear-gradient(135deg, transparent 0 4px, rgb(255 255 255 / 0.7) 4px 8px)";

/**
 * Barra da vida escoteira entre `from` e `to`: um trecho por período, na cor do ramo (adulto em azul), mais claro antes
 * da promessa (não conta), e as estrelas como marcas numeradas. Lacunas ficam vazias. Com `today` dentro do intervalo,
 * o que vem depois é só projeção: listrado e claro, com a marca "hoje", e a estrela prevista apagada e pontilhada.
 * Sem tabela: posições em %.
 */
export function LifeBar({ periods, promiseDate, stars = [], from, to, today, size = "md", className, label }: {
  periods: LifePeriod[]; promiseDate: string | null; stars?: Star[]; from: string; to: string; today?: string;
  size?: "sm" | "md"; className?: string; label: string;
}) {
  const segments = barSegments(periods, promiseDate, from, to, today);
  const showToday = today !== undefined && today > from && today < to;
  const total = Math.max(1, daysBetween(from, to));
  const at = (day: string) => Math.min(100, Math.max(0, (daysBetween(from, day) / total) * 100));
  const visibleStars = stars.filter((s) => s.dueOn >= from && s.dueOn <= to);
  return <div role="img" aria-label={label} className={cn("relative w-full", size === "sm" ? "h-3" : "h-5", visibleStars.length > 0 && size === "md" && "mb-4", showToday && size === "md" && "mt-3", className)}>
    <div className="absolute inset-0 rounded-sm bg-muted/60" />
    {segments.map((s, i) => <div key={i}
      title={`${lifeBranchLabel(s.branch)}${s.place ? ` (${s.place})` : ""}${s.future ? " · projeção, se continuar em atividade" : s.beforePromise ? " · antes da promessa" : ""}`}
      className={cn("absolute inset-y-0 border-y border-black/10 first:rounded-l-sm", s.beforePromise && "opacity-40", s.future && "border-dashed opacity-45")}
      style={{ left: `${s.from * 100}%`, width: `${Math.max(0.3, (s.to - s.from) * 100)}%`, background: s.future ? `${FUTURE_STRIPES}, ${lifeBranchColor(s.branch)}` : lifeBranchColor(s.branch) }} />)}
    {showToday && <div className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground" style={{ left: `${at(today as string)}%` }} title={`Hoje, ${dateBR(today as string)}`}>
      {size === "md" && <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[10px] leading-none font-semibold text-foreground">hoje</span>}
    </div>}
    {visibleStars.map((s) => {
      const future = today !== undefined && s.dueOn > today;
      return <div key={s.n} className={cn("absolute inset-y-0 w-0", future ? "border-l border-dashed border-muted-foreground/70" : "border-l border-foreground/60")}
        style={{ left: `${at(s.dueOn)}%` }}
        title={`${s.n}ª estrela · ${dateBR(s.dueOn)}${future ? " · prevista" : s.status === "entregue" ? " · entregue" : s.status === "pendente" ? " · a entregar" : ""}`}>
        {size === "md" && <span className={cn("num absolute top-full left-1/2 mt-0.5 -translate-x-1/2 text-[10px] leading-none",
          future ? "font-normal text-muted-foreground/70" : s.status === "pendente" ? "font-bold text-caution" : "text-foreground")}>{future ? `(${s.n})` : s.n}</span>}
      </div>;
    })}
  </div>;
}

/** Legenda das cores (ramos que aparecem). */
export function LifeLegend({ branches }: { branches: LifePeriod["branch"][] }) {
  return <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11px] text-muted-foreground">
    {[...new Set(branches)].map((b) => <li key={b} className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm border border-black/10" style={{ background: lifeBranchColor(b) }} aria-hidden />{lifeBranchLabel(b)}
    </li>)}
    <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-black/10 bg-muted opacity-60" aria-hidden />Mais claro: antes da promessa</li>
    <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-black/30 opacity-60" style={{ background: FUTURE_STRIPES }} aria-hidden />Listrado: projeção depois de hoje</li>
  </ul>;
}
