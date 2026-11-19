"use client";

import { IconInfoCircle, IconMessageCircle } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@geas/ui/components/popover";
import { cn } from "@geas/ui/lib/utils";
import { CHANNEL_LABELS, REVIEW_LABELS, timestampBR, type MovementChannel, type ReviewStatus } from "@/lib/inventory/vocabulary";

/**
 * Detalhes da revisão de um movimento, num popover ao lado do selo (abre no toque e no clique): origem, quem
 * registrou, quem revisou e quando, e a nota da revisão. O ícone de balão indica que há nota.
 */
export function ReviewDetails({ status, channel, byYou, reviewedByYou, reviewedAt, notes }: {
  status: ReviewStatus; channel: MovementChannel; byYou: boolean; reviewedByYou: boolean; reviewedAt: string | null; notes: string | null;
}) {
  const Icon = notes ? IconMessageCircle : IconInfoCircle;
  return <Popover>
    <PopoverTrigger render={<button type="button" aria-label={notes ? "Ver a nota da revisão" : "Detalhes da revisão"}
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-muted", notes ? "text-primary" : "text-muted-foreground")} />}>
      <Icon className="size-4" aria-hidden />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72">
      <PopoverHeader><PopoverTitle>{REVIEW_LABELS[status]}</PopoverTitle></PopoverHeader>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Origem</dt><dd className="m-0">{CHANNEL_LABELS[channel]}</dd>
        {byYou && <><dt className="text-muted-foreground">Registrado</dt><dd className="m-0">por você</dd></>}
        {status === "revisado" && reviewedAt && <><dt className="text-muted-foreground">Revisado</dt>
          <dd className="m-0"><span className="num">{timestampBR(reviewedAt)}</span>{reviewedByYou && " por você"}</dd></>}
      </dl>
      {notes
        ? <div className="grid gap-1 border-t pt-2"><span className="text-xs text-muted-foreground">Nota da revisão</span><p className="m-0 text-sm whitespace-pre-wrap">{notes}</p></div>
        : status === "revisado" && <p className="m-0 border-t pt-2 text-xs text-muted-foreground">Revisado sem nota.</p>}
    </PopoverContent>
  </Popover>;
}
