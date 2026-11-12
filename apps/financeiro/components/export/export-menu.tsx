"use client";

import { useState } from "react";
import { IconChevronDown, IconDownload } from "@tabler/icons-react";
import { toast } from "sonner";
import { OptionSelect } from "@/components/option-controls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describePeriod, MONTHS, periodBounds, type PeriodPreset } from "@/lib/export/period";
import { cn } from "@/lib/utils";

type View = "lancamentos" | "rubricas";
type PresetKind = PeriodPreset["kind"];
type Mode = "fluxo" | "realizado" | null;

const monthOptions = MONTHS.map((label, i) => ({ value: String(i + 1), label }));
const viewOptions = [{ value: "lancamentos", label: "Por lançamento" }, { value: "rubricas", label: "Por rubrica" }];

/** Baixa a planilha da rota; em caso de erro, mostra a mensagem da rota em um toast. */
async function download(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? "Não foi possível gerar a planilha.");
  }
  // sem sessão, o proxy redireciona para /login e a resposta vira HTML
  if (response.redirected || !response.headers.get("Content-Type")?.includes("spreadsheetml")) {
    throw new Error("Sessão expirada. Entre novamente para exportar.");
  }
  const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "exportacao.xlsx";
  const href = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement("a"), { href, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return filename;
}

export function ExportMenu({ view, from, to, years }: { view: View; from?: string; to?: string; years: number[] }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearOptions = years.map((y) => ({ value: String(y), label: String(y) }));
  const [mode, setMode] = useState<Mode>(null);
  const [flowView, setFlowView] = useState<View>(view);
  const [preset, setPreset] = useState<PresetKind>(from || to ? "personalizado" : "mes");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(currentYear));
  const [customFrom, setCustomFrom] = useState(from ?? `${currentYear}-01-01`);
  const [customTo, setCustomTo] = useState(to ?? now.toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);

  const period = periodBounds(preset === "mes" ? { kind: "mes", year: Number(year), month: Number(month) }
    : preset === "ano" ? { kind: "ano", year: Number(year) }
    : { kind: "personalizado", from: customFrom, to: customTo });

  function open(next: Mode) {
    setFlowView(view);
    setMode(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const url = mode === "realizado"
      ? `/exportar/realizado?ano=${year}`
      : period && `/exportar/fluxo?${new URLSearchParams({ visao: flowView, de: period.from, ate: period.to })}`;
    if (!url) return;
    setPending(true);
    try {
      const filename = await download(url);
      toast.success(`${filename} baixado.`);
      setMode(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a planilha.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="lg"><IconDownload /> Exportar <IconChevronDown data-icon="inline-end" /></Button>} />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => open("fluxo")}>Fluxo de caixa…</DropdownMenuItem>
        <DropdownMenuItem onClick={() => open("realizado")}>Realizado anual…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <Dialog open={mode !== null} onOpenChange={(isOpen) => { if (!isOpen) setMode(null); }}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{mode === "realizado" ? "Exportar Realizado anual" : "Exportar fluxo de caixa"}</DialogTitle>
            <DialogDescription>
              {mode === "realizado"
                ? "Planilha com receitas e despesas por rubrica, mês a mês, com totais por grupo."
                : "Todos os lançamentos do período, sem os demais filtros da lista. As datas-limite estão incluídas."}
            </DialogDescription>
          </DialogHeader>

          {mode === "fluxo" && <>
            <div className="grid gap-1.5"><Label htmlFor="export-view">Visão</Label><OptionSelect id="export-view" value={flowView} onValueChange={(v) => setFlowView(v as View)} options={viewOptions} /></div>
            <div role="radiogroup" aria-label="Período" className="inline-flex w-fit rounded-full bg-secondary p-0.5">
              {([["mes", "Mês"], ["ano", "Ano"], ["personalizado", "Personalizado"]] as const).map(([value, label]) =>
                <button key={value} type="button" role="radio" aria-checked={preset === value} onClick={() => setPreset(value)}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors", preset === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
            </div>
            {preset === "mes" && <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="export-month">Mês</Label><OptionSelect id="export-month" value={month} onValueChange={setMonth} options={monthOptions} /></div>
              <div className="grid gap-1.5"><Label htmlFor="export-year">Ano</Label><OptionSelect id="export-year" value={year} onValueChange={setYear} options={yearOptions} /></div>
            </div>}
            {preset === "ano" && <div className="grid gap-1.5"><Label htmlFor="export-year">Ano</Label><OptionSelect id="export-year" value={year} onValueChange={setYear} options={yearOptions} /></div>}
            {preset === "personalizado" && <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label htmlFor="export-from">De</Label><Input id="export-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} required /></div>
              <div className="grid gap-1.5"><Label htmlFor="export-to">Até (inclusive)</Label><Input id="export-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} required /></div>
            </div>}
            <p className={cn("text-xs", period ? "text-muted-foreground" : "text-destructive")}>
              {period ? `Período: ${describePeriod(period)}` : "Informe um período válido: a data inicial não pode ser depois da final."}
            </p>
          </>}

          {mode === "realizado" && <div className="grid gap-1.5"><Label htmlFor="export-realized-year">Ano</Label><OptionSelect id="export-realized-year" value={year} onValueChange={setYear} options={yearOptions} /></div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMode(null)}>Cancelar</Button>
            <Button type="submit" disabled={pending || (mode === "fluxo" && !period)}><IconDownload /> {pending ? "Gerando…" : "Baixar planilha"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
