import { IconArrowsRightLeft, IconAward, IconBan, IconDoorEnter, IconDoorExit, IconFlag, IconPlayerPlay, IconPlayerStop, IconPointFilled } from "@tabler/icons-react";
import { cn } from "@geas/ui/lib/utils";
import { dateBR } from "@/lib/format";
import { lifeBranchColor, lifeBranchShort, type TimelineKind, type TimelineYear } from "@/lib/associates/scout-life";
import { EditEventButton, EditExclusionButton } from "./life-editors";

const ICONS: Record<TimelineKind, typeof IconFlag> = {
  promessa: IconFlag, entrada: IconDoorEnter, saida: IconDoorExit, passagem: IconArrowsRightLeft,
  inicio: IconPlayerPlay, fim: IconPlayerStop, estrela: IconAward, evento: IconPointFilled, excluido: IconBan,
};

/**
 * Linha do tempo vertical: uma linha contínua à esquerda e, para cada ano, um marcador na cor do ramo daquele ano
 * (o de mais dias), o ano em destaque e, abaixo, os acontecimentos em ordem de data. Eventos lançados à mão podem ser
 * corrigidos por quem edita.
 */
export function LifeTimeline({ years, associateId, canEdit, today }: { years: TimelineYear[]; associateId: string; canEdit: boolean; today: string }) {
  if (years.length === 0) return <p className="px-4 py-8 text-center text-xs text-muted-foreground">Nada na linha do tempo ainda: lance períodos ou eventos.</p>;
  return <ol className="relative m-0 list-none py-4 pr-4 pl-4 sm:pl-6">
    <span className="absolute top-6 bottom-6 left-[2.05rem] w-0.5 bg-border sm:left-[2.55rem]" aria-hidden />
    {years.map((year) => {
      const color = year.branch ? lifeBranchColor(year.branch) : "var(--muted)";
      return <li key={year.year} className="relative grid grid-cols-[2.25rem_1fr] gap-x-4 pb-6 last:pb-0">
        <span className="relative z-10 mt-1 size-9 rounded-full border-4 bg-card" style={{ borderColor: color }} aria-hidden>
          <span className="absolute inset-1.5 rounded-full" style={{ background: color }} />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 flex items-baseline gap-3">
            <span className="num text-2xl leading-tight font-bold">{year.year}</span>
            {year.branch && <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">{lifeBranchShort(year.branch)}</span>}
          </h3>
          <span className="mt-1 mb-2 block border-t-2 border-dashed border-border" aria-hidden />
          <ul className="m-0 grid list-none gap-2.5 p-0">{year.items.map((item) => {
            const Icon = ICONS[item.kind];
            return <li key={item.key} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-black/10"
                style={{ background: item.branch ? lifeBranchColor(item.branch) : undefined }}><Icon className="size-3.5 text-neutral-800" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className={cn("m-0 text-sm", item.kind === "estrela" || item.kind === "promessa" ? "font-bold" : "font-semibold")}>
                  {item.title} <span className="num ml-1 text-xs font-normal text-muted-foreground">{dateBR(item.date)}</span>
                </p>
                {item.detail && <p className="m-0 text-xs whitespace-pre-line text-muted-foreground">{item.detail}</p>}
              </div>
              {canEdit && item.event && <EditEventButton associateId={associateId} event={item.event} today={today} />}
              {canEdit && item.exclusion && <EditExclusionButton associateId={associateId} exclusion={item.exclusion} today={today} />}
            </li>;
          })}</ul>
        </div>
      </li>;
    })}
  </ol>;
}
