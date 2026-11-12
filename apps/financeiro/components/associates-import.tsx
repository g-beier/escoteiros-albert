"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconDownload, IconFileUpload, IconUpload } from "@tabler/icons-react";
import { importAssociates } from "@/app/associados/actions";
import { SectionCard, SectionHeader } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { branchLabels, type PatrolItem, type SectionItem } from "@/lib/associates";
import { ASSOCIATE_CSV_TEMPLATE, parseAssociatesCsv, planAssociatesImport, type ExistingAssociate, type PlannedAssociate } from "@/lib/associates-import";
import { decodeBytes } from "@/lib/statement-import";
import { cn } from "@/lib/utils";

const MAX_BYTES = 2 * 1024 * 1024;
const VISIBLE = 300;
const ACTION_LABEL: Record<PlannedAssociate["action"], string> = { nova: "Novo", atualiza: "Atualiza", igual: "Sem mudança", erro: "Erro" };
const ORDER: Record<PlannedAssociate["action"], number> = { erro: 0, atualiza: 1, nova: 2, igual: 3 };
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${ASSOCIATE_CSV_TEMPLATE}`)}`;

/** Importação de associados por CSV (nome, ramo, seção, patrulha, status), com conferência antes de gravar. */
export function AssociatesImport({ existing, sections, patrols }: { existing: ExistingAssociate[]; sections: SectionItem[]; patrols: PatrolItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);

  const parsed = useMemo(() => (file ? parseAssociatesCsv(file.text) : null), [file]);
  const plan = useMemo(() => (parsed ? planAssociatesImport(parsed.rows, existing, { sections, patrols }) : []), [parsed, existing, sections, patrols]);
  const count = (action: PlannedAssociate["action"]) => plan.filter((row) => row.action === action).length;
  const toSend = plan.filter((row) => row.action === "nova" || (updateExisting && row.action === "atualiza"));
  const errors = count("erro");
  const shown = [...plan].filter((row) => row.action !== "igual").sort((a, b) => ORDER[a.action] - ORDER[b.action] || a.line - b.line);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > MAX_BYTES) { toast.error("Arquivo grande demais (máximo 2 MB)."); return; }
    setFile({ name: chosen.name, text: decodeBytes(new Uint8Array(await chosen.arrayBuffer())).text });
  }

  function runImport() {
    startTransition(async () => {
      const result = await importAssociates(toSend.map((row) => ({
        ...(row.existingId ? { id: row.existingId } : {}), name: row.name, branch: row.branch, section: row.section, patrol: row.patrol, active: row.active,
      })));
      if (result.error) { toast.error(result.error); return; }
      toast.success(result.success);
      setFile(null);
      router.refresh();
    });
  }

  return <SectionCard aria-labelledby="associates-import-title">
    <SectionHeader title="Importar associados (CSV)" titleId="associates-import-title"
      description="Colunas: nome, ramo, seção, patrulha, status. Ramo: Lobinho, Escoteiro, Sênior, Pioneiro ou Adulto. Seção e patrulha (opcionais) precisam estar cadastradas acima. Status: ativo ou inativo (vazio = ativo). Quem já está cadastrado com o mesmo nome é atualizado.">
      <a href={TEMPLATE_HREF} download="modelo-associados.csv" className="inline-flex items-center gap-1 text-xs font-semibold text-primary no-underline hover:underline"><IconDownload className="size-4" aria-hidden /> Baixar modelo</a>
    </SectionHeader>
    <div className="grid gap-4 p-4">
      <div className="grid max-w-md gap-1.5">
        <Label htmlFor="associates-file">Arquivo CSV</Label>
        <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-card px-2 text-xs hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring/30">
          <IconFileUpload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{file ? file.name : "Escolher arquivo…"}</span>
          <input id="associates-file" type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={onFile} />
        </label>
      </div>

      {parsed?.error && <p role="alert" className="m-0 text-xs text-destructive">{parsed.error}</p>}

      {plan.length > 0 && <>
        <p className="m-0 text-xs">
          <strong className="num">{count("nova")}</strong> {count("nova") === 1 ? "novo" : "novos"}
          {" · "}<strong className="num">{count("atualiza")}</strong> com mudança
          {" · "}<strong className="num">{count("igual")}</strong> sem mudança
          {errors > 0 && <>{" · "}<strong className="num text-destructive">{errors}</strong> com erro (não {errors === 1 ? "entra" : "entram"})</>}
        </p>
        {count("atualiza") > 0 && <Label className="font-normal">
          <Checkbox checked={updateExisting} onCheckedChange={(value) => setUpdateExisting(value === true)} />
          Atualizar ramo, seção e status dos {count("atualiza")} já cadastrados
        </Label>}
        {shown.length > 0 && <div className="max-h-[50vh] overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left"><tr>
              <th className="px-2 py-1.5 text-right font-semibold">Linha</th><th className="px-2 py-1.5 font-semibold">Situação</th>
              <th className="px-2 py-1.5 font-semibold">Nome</th><th className="px-2 py-1.5 font-semibold">Ramo</th>
              <th className="px-2 py-1.5 font-semibold">Seção</th><th className="px-2 py-1.5 font-semibold">Patrulha</th><th className="px-2 py-1.5 font-semibold">Status</th>
            </tr></thead>
            <tbody>{shown.slice(0, VISIBLE).map((row) => <tr key={row.line} className="border-t">
              <td className="px-2 py-1 text-right text-muted-foreground num">{row.line}</td>
              <td className={cn("px-2 py-1 whitespace-nowrap", row.action === "erro" && "text-destructive")}>
                {ACTION_LABEL[row.action]}{row.action === "erro" && <span className="block">{row.errors.join("; ")}</span>}
              </td>
              <td className="px-2 py-1">{row.name}</td>
              <td className="px-2 py-1">{row.branch ? branchLabels[row.branch] : "—"}</td>
              <td className="px-2 py-1">{row.section ?? "—"}</td>
              <td className="px-2 py-1">{row.patrol ?? "—"}</td>
              <td className="px-2 py-1">{row.active ? "Ativo" : "Inativo"}</td>
            </tr>)}</tbody>
          </table>
          {shown.length > VISIBLE && <p className="m-0 border-t px-2 py-1.5 text-xs text-muted-foreground">Mostrando {VISIBLE} de {shown.length}.</p>}
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runImport} disabled={pending || toSend.length === 0}><IconUpload /> {pending ? "Importando…" : `Importar ${toSend.length} ${toSend.length === 1 ? "associado" : "associados"}`}</Button>
          <Button variant="ghost" onClick={() => setFile(null)} disabled={pending}>Cancelar</Button>
        </div>
      </>}
    </div>
  </SectionCard>;
}
