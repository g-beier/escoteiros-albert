"use client";

import { OptionSelect } from "@/components/option-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COLUMN_ROLES, distinctValues, roleOf, setColumnRole, type ColumnRole } from "@/lib/import-flow";
import { DATE_FORMATS, normalizeText, type CsvTable, type DateFormat, type Decimal, type Encoding, type ProfileSettings } from "@/lib/statement-import";
import { cn } from "@/lib/utils";

const PREVIEW_ROWS = 8;

const encodingOptions = [{ value: "utf-8", label: "UTF-8" }, { value: "latin1", label: "Latin-1 (Windows)" }];
const delimiterOptions = [
  { value: ";", label: "Ponto e vírgula ( ; )" },
  { value: ",", label: "Vírgula ( , )" },
  { value: "\t", label: "Tabulação" },
  { value: "|", label: "Barra vertical ( | )" },
];
const dateOptions = DATE_FORMATS.map((format) => ({ value: format, label: format.replaceAll("Y", "A") }));
const decimalOptions = [{ value: "comma", label: "1.234,56" }, { value: "dot", label: "1,234.56" }];
const roleOptions = COLUMN_ROLES.map(({ value, label }) => ({ value, label }));

/** Leitura do arquivo (codificação, separador, cabeçalho, data, decimal) e papel de cada coluna. */
export function CsvProfileBuilder({ settings, table, onChange }: {
  settings: ProfileSettings;
  table: CsvTable;
  onChange: (settings: ProfileSettings) => void;
}) {
  const set = <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => onChange({ ...settings, [key]: value });
  const setRole = (index: number, role: ColumnRole) => onChange({ ...settings, columns: setColumnRole(settings.columns, table.header, index, role) });
  const natureValues = distinctValues(table.header, table.rows, settings.columns.nature);
  const debitValues = settings.columns.debitValues ?? [];
  const isDebit = (value: string) => debitValues.some((item) => normalizeText(item) === normalizeText(value));
  const toggleDebit = (value: string, checked: boolean) => onChange({
    ...settings,
    columns: { ...settings.columns, debitValues: checked ? [...debitValues, value] : debitValues.filter((item) => normalizeText(item) !== normalizeText(value)) },
  });
  const descriptionOrder = (name: string) => settings.columns.description.findIndex((column) => normalizeText(column) === normalizeText(name));

  return <div className="grid gap-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="grid gap-1.5"><Label htmlFor="csv-encoding">Codificação</Label>
        <OptionSelect id="csv-encoding" value={settings.encoding} onValueChange={(value) => set("encoding", value as Encoding)} options={encodingOptions} /></div>
      <div className="grid gap-1.5"><Label htmlFor="csv-delimiter">Separador</Label>
        <OptionSelect id="csv-delimiter" value={settings.delimiter} onValueChange={(value) => set("delimiter", value)} options={delimiterOptions} /></div>
      <div className="grid gap-1.5"><Label htmlFor="csv-header-row">Linha do cabeçalho</Label>
        <Input id="csv-header-row" type="number" min={1} step={1} className="num" value={settings.headerRow}
          onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1) set("headerRow", value); }} /></div>
      <div className="grid gap-1.5"><Label htmlFor="csv-date-format">Formato da data</Label>
        <OptionSelect id="csv-date-format" value={settings.dateFormat} onValueChange={(value) => set("dateFormat", value as DateFormat)} options={dateOptions} /></div>
      <div className="grid gap-1.5"><Label htmlFor="csv-decimal">Valores</Label>
        <OptionSelect id="csv-decimal" value={settings.decimal} onValueChange={(value) => set("decimal", value as Decimal)} options={decimalOptions} /></div>
    </div>

    {table.preamble.length > 0 && <div className="grid gap-1">
      <span className="text-xs font-semibold">Antes do cabeçalho</span>
      <div className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <table className="min-w-0 border-collapse"><tbody>{table.preamble.map((row, i) => <tr key={i}>
          {row.map((cell, j) => <td key={j} className="border-0 py-0.5 pl-0 pr-4 text-xs whitespace-nowrap num">{cell}</td>)}
        </tr>)}</tbody></table>
      </div>
    </div>}

    {table.header.length === 0
      ? <p className="m-0 text-xs text-destructive">Nenhuma coluna na linha {settings.headerRow}. Ajuste a linha do cabeçalho ou o separador.</p>
      : <div className="grid gap-1">
        <span className="text-xs font-semibold">Papel de cada coluna</span>
        <Table containerClassName="rounded-md border" className="min-w-0">
          <TableCaption className="sr-only">Primeiras linhas do arquivo com o papel de cada coluna</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
            {table.header.map((name, index) => {
              const role = roleOf(settings.columns, name);
              const order = role === "description" && settings.columns.description.length > 1 ? descriptionOrder(name) + 1 : 0;
              return <TableHead key={index} className={cn("h-auto min-w-32 px-2 py-1.5 align-top normal-case tracking-normal", role !== "ignore" && "bg-primary/10")}>
                <OptionSelect value={role} onValueChange={(value) => setRole(index, value as ColumnRole)} options={roleOptions} aria-label={`Papel da coluna ${name || index + 1}`} />
                <div className="mt-1 max-w-48 truncate text-xs font-semibold" title={name}>{name || <span className="text-muted-foreground">(sem nome)</span>}{order > 0 && <span className="text-muted-foreground"> · {order}ª parte</span>}</div>
              </TableHead>;
            })}
          </TableRow></TableHeader>
          <TableBody>{table.rows.slice(0, PREVIEW_ROWS).map((row, i) => <TableRow key={i}>
            {table.header.map((_, j) => <TableCell key={j} className={cn("max-w-60 truncate px-2 py-1 num", roleOf(settings.columns, table.header[j]) === "ignore" && "text-muted-foreground")} title={row[j]}>{row[j]}</TableCell>)}
          </TableRow>)}</TableBody>
        </Table>
        <p className="m-0 text-xs text-muted-foreground">Mostrando {Math.min(PREVIEW_ROWS, table.rows.length)} de {table.rows.length} linhas. Várias colunas com papel Descrição são juntadas na ordem do arquivo.</p>
      </div>}

    {settings.columns.nature && <fieldset className="grid gap-2">
      <legend className="mb-1 text-xs font-semibold">Natureza: quais valores de “{settings.columns.nature}” indicam saída?</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {natureValues.map((value) => <Label key={normalizeText(value)} className="font-normal">
          <Checkbox checked={isDebit(value)} onCheckedChange={(checked) => toggleDebit(value, checked === true)} />{value}
        </Label>)}
        {natureValues.length === 0 && <span className="text-xs text-muted-foreground">A coluna está vazia.</span>}
      </div>
    </fieldset>}
  </div>;
}
