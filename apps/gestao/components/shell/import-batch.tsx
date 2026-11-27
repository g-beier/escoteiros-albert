"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import { IconDownload, IconFileText, IconFileUpload, IconUpload, IconX } from "@tabler/icons-react";
import { importFiles } from "@/app/(gestao)/importar/actions";
import { Badge } from "@geas/ui/components/badge";
import { Button } from "@geas/ui/components/button";
import { Label } from "@geas/ui/components/label";
import { SectionCard, SectionHeader } from "@geas/ui/components/section-card";
import { Spinner } from "@geas/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@geas/ui/components/toggle-group";
import { cn } from "@geas/ui/lib/utils";
import { decodeBytes } from "@/lib/finance/statement-import";
import { FILES, MODULE_NAMES, fileSpec, type Module } from "@/lib/import/contract";
import { EXPORTABLE, templateCsv } from "@/lib/import/export";
import {
  SUPPORTED_KINDS,
  planBatch,
  planTotals,
  type PlanOptions,
  type PlannedFile,
  type PlannedRow,
  type RowAction,
} from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import type { ImportState } from "@/lib/import/state";

const MAX_BYTES = 3 * 1024 * 1024;
const VISIBLE = 300;
const ACTION_LABEL: Record<RowAction, string> = { nova: "Nova", atualiza: "Atualiza", igual: "Igual", erro: "Erro" };
const ACTION_ORDER: Record<RowAction, number> = { erro: 0, atualiza: 1, nova: 2, igual: 3 };
type Filter = "mudancas" | "erros" | "todas";

type Loaded = { name: string; text: string };

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

/** Envio de CSVs do contrato (docs/importacao.md): leitura e pré-visualização no navegador; gravação pela action. */
export function ImportBatch({
  state,
  options,
  modules,
}: {
  state: ImportState;
  options: PlanOptions;
  modules: Record<Module, boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState<Loaded[]>([]);

  const read = useMemo(
    () => loaded.map((file) => ({ name: file.name, ...readImportFile(file.name, file.text) })),
    [loaded],
  );
  const readErrors = read.flatMap((item) => (item.error ? [item.error] : []));
  const notAllowed = read.flatMap((item) => {
    if (!item.file) return [];
    const spec = fileSpec(item.file.kind);
    return modules[spec.module]
      ? []
      : [
          `${item.name}: só ${spec.module === "financeiro" ? "administradores" : "editores"} do ${MODULE_NAMES[spec.module]} importam ${spec.file}.`,
        ];
  });
  const plan = useMemo(
    () =>
      planBatch(
        read.flatMap((item) => (item.file ? [item.file] : [])),
        state,
        options,
      ),
    [read, state, options],
  );
  const blocking = [...readErrors, ...notAllowed, ...plan.errors];
  // linhas novas e alteradas (o payload pode juntar linhas: na vida escoteira, uma entrada por pessoa)
  const toSend = plan.files.some((file) => file.payload.length)
    ? plan.files.reduce(
        (sum, file) => sum + file.rows.filter((row) => row.action === "nova" || row.action === "atualiza").length,
        0,
      )
    : 0;

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])];
    event.target.value = "";
    const big = chosen.find((file) => file.size > MAX_BYTES);
    if (big) {
      toast.error(`${big.name}: grande demais (máximo 3 MB).`);
      return;
    }
    const next = await Promise.all(
      chosen.map(async (file) => ({
        name: file.name,
        text: decodeBytes(new Uint8Array(await file.arrayBuffer())).text,
      })),
    );
    setLoaded((current) => [...current.filter((file) => !next.some((added) => added.name === file.name)), ...next]);
  }

  function runImport() {
    startTransition(async () => {
      const result = await importFiles(loaded);
      if (result.error) {
        toast.error(result.error, { duration: 15000 });
        return;
      }
      toast.success(result.success);
      setLoaded([]);
    });
  }

  const contractFiles = FILES.filter((spec) => modules[spec.module]);

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader
          title="Arquivos"
          description="Um ou vários CSVs de uma vez. O tipo vem do nome do arquivo (ex.: pessoas.csv) ou do cabeçalho."
        />
        <div className="grid gap-3 p-4">
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="import-files">Arquivos CSV</Label>
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-card px-2 text-xs focus-within:ring-2 focus-within:ring-ring/30 hover:bg-muted/50">
              <IconFileUpload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">Escolher arquivos…</span>
              <input
                id="import-files"
                type="file"
                multiple
                accept=".csv,text/csv,.txt"
                className="sr-only"
                onChange={onFiles}
              />
            </label>
          </div>
          {loaded.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {read.map((item) => (
                <li key={item.name}>
                  <Badge variant={item.error ? "destructive" : "secondary"}>
                    <IconFileText data-icon="inline-start" aria-hidden />
                    {item.name}
                    {item.file && item.name !== fileSpec(item.file.kind).file && ` → ${fileSpec(item.file.kind).file}`}
                    <button
                      type="button"
                      className="ml-1 cursor-pointer"
                      aria-label={`Tirar ${item.name}`}
                      onClick={() => setLoaded((current) => current.filter((file) => file.name !== item.name))}
                    >
                      <IconX className="size-3" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {blocking.length > 0 && (
            <ul role="alert" className="m-0 grid gap-1 pl-4 text-xs text-destructive">
              {blocking.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {plan.files.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={runImport} disabled={pending || toSend === 0 || blocking.length > 0}>
                {pending ? <Spinner data-icon="inline-start" /> : <IconUpload data-icon="inline-start" />}
                {pending
                  ? "Importando…"
                  : toSend
                    ? `Importar ${toSend} ${toSend === 1 ? "linha" : "linhas"}`
                    : "Nada a importar"}
              </Button>
              <Button variant="ghost" onClick={() => setLoaded([])} disabled={pending}>
                Limpar
              </Button>
              <span className="text-xs text-muted-foreground">
                Linhas com erro ficam de fora: corrija o CSV e envie de novo.
              </span>
            </div>
          )}
        </div>
      </SectionCard>

      {plan.files.map((file) => (
        <FilePlan key={file.kind} file={file} />
      ))}

      <SectionCard>
        <SectionHeader
          title="Modelos e dados atuais"
          description="O formato de cada arquivo está no contrato: entregue-o junto com a planilha a quem (ou à IA que) for converter. Os dados atuais vêm no mesmo formato, com o id: corrija numa planilha e reimporte."
        >
          <a
            href="/importar/contrato"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary no-underline hover:underline"
          >
            <IconDownload className="size-4" aria-hidden /> Contrato (.md)
          </a>
        </SectionHeader>
        <ul className="m-0 grid list-none gap-0 p-0">
          {contractFiles.map((spec) => (
            <li
              key={spec.kind}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs last:border-b-0"
            >
              <span className="min-w-44 font-semibold">{spec.file}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">
                {spec.title}
                {!SUPPORTED_KINDS.includes(spec.kind) && " · em breve"}
              </span>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 font-semibold text-primary hover:underline"
                onClick={() => download(spec.file, templateCsv(spec.kind))}
              >
                <IconDownload className="size-4" aria-hidden /> Modelo
              </button>
              {EXPORTABLE.includes(spec.kind) && (
                <a
                  href={`/importar/exportar/${spec.kind}`}
                  className="inline-flex items-center gap-1 font-semibold text-primary no-underline hover:underline"
                >
                  <IconDownload className="size-4" aria-hidden /> Dados atuais
                </a>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function FilePlan({ file }: { file: PlannedFile }) {
  const [filter, setFilter] = useState<Filter>("mudancas");
  const totals = planTotals(file);
  const spec = fileSpec(file.kind);
  const rows = file.rows
    .filter(
      (row) =>
        filter === "todas" ||
        (filter === "erros" ? row.action === "erro" : row.action !== "igual" || row.warnings.length > 0),
    )
    .sort((a, b) => ACTION_ORDER[a.action] - ACTION_ORDER[b.action] || a.line - b.line);

  return (
    <SectionCard>
      <SectionHeader
        title={`${spec.file} · ${spec.title}`}
        description={
          <>
            <strong className="num">{totals.nova}</strong> {totals.nova === 1 ? "nova" : "novas"} ·{" "}
            <strong className="num">{totals.atualiza}</strong> {totals.atualiza === 1 ? "atualiza" : "atualizam"} ·{" "}
            <strong className="num">{totals.igual}</strong> {totals.igual === 1 ? "igual" : "iguais"}
            {totals.erro > 0 && (
              <>
                {" "}
                · <strong className="num text-destructive">{totals.erro}</strong> com erro
              </>
            )}
          </>
        }
      >
        <ToggleGroup
          value={[filter]}
          onValueChange={(value) => value[0] && setFilter(value[0] as Filter)}
          aria-label={`Linhas de ${spec.file}`}
        >
          <ToggleGroupItem value="mudancas">Mudanças</ToggleGroupItem>
          <ToggleGroupItem value="erros">Erros</ToggleGroupItem>
          <ToggleGroupItem value="todas">Todas</ToggleGroupItem>
        </ToggleGroup>
      </SectionHeader>
      {(file.creations.length > 0 || file.warnings.length > 0) && (
        <div className="grid gap-1 border-b px-4 py-2 text-xs">
          {file.creations.map((message) => (
            <p key={message} className="m-0 text-primary">
              {message}
            </p>
          ))}
          {file.warnings.map((message) => (
            <p key={message} className="m-0 text-amber-700 dark:text-amber-400">
              {message}
            </p>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="m-0 px-4 py-3 text-xs text-muted-foreground">
          {filter === "erros" ? "Nenhuma linha com erro." : "Nenhuma mudança: tudo já está igual no app."}
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-2 py-1.5 text-right font-semibold">Linha</th>
                <th className="px-2 py-1.5 font-semibold">Situação</th>
                <th className="px-2 py-1.5 font-semibold">Quem / o quê</th>
                <th className="px-2 py-1.5 font-semibold">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, VISIBLE).map((row) => (
                <RowView key={row.line} row={row} />
              ))}
            </tbody>
          </table>
          {rows.length > VISIBLE && (
            <p className="m-0 border-t px-2 py-1.5 text-xs text-muted-foreground">
              Mostrando {VISIBLE} de {rows.length}.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function RowView({ row }: { row: PlannedRow }) {
  return (
    <tr className="border-t align-top">
      <td className="px-2 py-1 text-right num text-muted-foreground">{row.line}</td>
      <td
        className={cn(
          "px-2 py-1 font-semibold whitespace-nowrap",
          row.action === "erro" && "text-destructive",
          row.action === "nova" && "text-primary",
        )}
      >
        {ACTION_LABEL[row.action]}
      </td>
      <td className="px-2 py-1">{row.label}</td>
      <td className="px-2 py-1">
        {row.errors.map((message) => (
          <span key={message} className="block text-destructive">
            {message}
          </span>
        ))}
        {row.changes.map((change) => (
          <span key={change.field} className="block">
            <span className="text-muted-foreground">{change.field}:</span>{" "}
            {change.before && (
              <>
                <s className="text-muted-foreground">{change.before}</s> →{" "}
              </>
            )}
            {change.after || <em className="text-muted-foreground">vazio</em>}
          </span>
        ))}
        {row.warnings.map((message) => (
          <span key={message} className="block text-amber-700 dark:text-amber-400">
            {message}
          </span>
        ))}
      </td>
    </tr>
  );
}
