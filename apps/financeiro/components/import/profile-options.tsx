"use client";

import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeText, type KindPrefixSuggestion } from "@/lib/statement-import";

/** Prefixos de tipo marcados, mais as sugestões tiradas das descrições do arquivo. */
export function KindPrefixes({ selected, suggestions, onChange }: {
  selected: string[];
  suggestions: KindPrefixSuggestion[];
  onChange: (prefixes: string[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const counts = new Map(suggestions.map((s) => [normalizeText(s.prefix), s.count]));
  const isSelected = (prefix: string) => selected.some((item) => normalizeText(item) === normalizeText(prefix));
  const options = [...selected, ...suggestions.map((s) => s.prefix).filter((prefix) => !isSelected(prefix))];
  const toggle = (prefix: string, checked: boolean) =>
    onChange(checked ? [...selected, prefix] : selected.filter((item) => normalizeText(item) !== normalizeText(prefix)));
  const add = () => {
    const value = custom.trim();
    if (value && !isSelected(value)) onChange([...selected, value]);
    setCustom("");
  };
  return <fieldset className="grid gap-2">
    <legend className="mb-1 text-xs font-semibold">Separar tipo e contraparte</legend>
    <p className="m-0 text-xs text-muted-foreground">Marque os inícios de descrição que indicam o tipo do movimento. O prefixo vira o tipo e o restante, a contraparte.</p>
    {options.length === 0 && <p className="m-0 text-xs text-muted-foreground">Nenhum prefixo repetido encontrado nas descrições.</p>}
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {options.map((prefix) => <Label key={normalizeText(prefix)} className="font-normal">
        <Checkbox checked={isSelected(prefix)} onCheckedChange={(checked) => toggle(prefix, checked === true)} />
        <span>{prefix}{counts.has(normalizeText(prefix)) && <span className="text-muted-foreground num"> ({counts.get(normalizeText(prefix))})</span>}</span>
      </Label>)}
    </div>
    <Label htmlFor="kind-prefix-custom" className="mt-1">Outro prefixo</Label>
    <div className="flex max-w-sm items-center gap-2">
      <Input id="kind-prefix-custom" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Ex.: Pix recebido"
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <Button type="button" variant="outline" size="sm" onClick={add} disabled={!custom.trim()}><IconPlus /> Adicionar</Button>
    </div>
  </fieldset>;
}

/** Textos que, se aparecem na linha, a descartam (pseudo-linhas de saldo). Um por linha. */
export function IgnoreList({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return <div className="grid gap-1.5">
    <Label htmlFor={id}>Linhas a ignorar</Label>
    <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="max-w-md" placeholder={"SALDO ANTERIOR\nSALDO TOTAL DISPONÍVEL DIA"} />
    <p className="m-0 text-xs text-muted-foreground">Um texto por linha, sem diferenciar maiúsculas e acentos. Uma linha &quot;SALDO ANTERIOR&quot; ignorada vira o saldo inicial quando o arquivo não traz outro.</p>
  </div>;
}
