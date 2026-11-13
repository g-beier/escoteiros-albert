"use client";

import { useRouter } from "next/navigation";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { Label } from "@geas/ui/components/label";

/** Seletor de ano compacto do cabeçalho: cada ano leva ao seu link (o servidor monta os links, com os demais filtros). */
export function YearSelect({ year, links }: { year: number; links: { year: number; href: string }[] }) {
  const router = useRouter();
  return <div className="flex items-center gap-1.5">
    <Label htmlFor="year-select" className="text-xs text-muted-foreground">Ano</Label>
    <OptionSelect id="year-select" value={String(year)} className="w-auto" placeholder="Ano"
      options={links.map((link) => ({ value: String(link.year), label: String(link.year) }))}
      onValueChange={(value) => { const link = links.find((l) => String(l.year) === value); if (link) router.push(link.href); }} />
  </div>;
}
