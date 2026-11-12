"use client";

import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconFileUpload } from "@tabler/icons-react";
import { importStatementLines, previewStatementImport, saveImportProfile, type ImportProfile } from "@/app/importacao/actions";
import { ignoreStatementLines } from "@/app/conciliacao/actions";
import type { ImportPreview } from "@/lib/import-schema";
import { dateBR, money } from "@/lib/format";
import { ImportReview } from "@/components/import/import-review";
import { IgnoreList, KindPrefixes } from "@/components/import/profile-options";
import { OptionSelect } from "@/components/option-controls";
import { SectionCard, SectionHeader } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  detectFormat, dropZeroLines, newOfxSettings, ofxSettingsFromProfile, parseTextList, profileForAccount, reconciliationHref,
  sameSettings, toImportLines,
} from "@/lib/import-flow";
import { applyOfxProfile, decodeBytes, readOfx, suggestKindPrefixes, type OfxProfileSettings, type OfxStatement } from "@/lib/statement-import";

export type ImportAccount = { id: string; name: string; bank: string | null };

type LoadedFile = { name: string; statement: OfxStatement };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Hash curto (djb2) para comparar listas de linhas sem guardá-las. */
function hashText(text: string) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** Período da importação: o declarado no arquivo, ampliado para cobrir todas as linhas. */
function importPeriod(statement: OfxStatement) {
  const dates = statement.lines.map((line) => line.date).sort();
  const from = [statement.periodFrom, dates[0]].filter(Boolean).sort()[0];
  const to = [statement.periodTo, dates[dates.length - 1]].filter(Boolean).sort().at(-1);
  return { from, to };
}

/**
 * Importação de extrato OFX. A conta (o banco) é escolhida pela pessoa em cada importação: alguns OFX
 * são convertidos de outros formatos e não trazem banco/conta confiáveis. O perfil de leitura (separar MEMO,
 * prefixos de tipo, linhas a ignorar) é o da última importação da conta, aplicado sozinho e salvo ao importar.
 * A importação CSV foi desativada na interface; a biblioteca continua em lib/statement-import.
 */
export function StatementImporter({ accounts, profiles, lastProfiles, accountId: initialAccountId }: {
  accounts: ImportAccount[];
  profiles: ImportProfile[];
  /** Perfil da última importação de cada conta. */
  lastProfiles: Record<string, string>;
  accountId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, startNavigation] = useTransition();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [profile, setProfile] = useState<ImportProfile | null>(null);
  const [settings, setSettings] = useState<OfxProfileSettings | null>(null);
  const [ignoreText, setIgnoreText] = useState("");

  const account = accounts.find((item) => item.id === accountId);

  /** Perfil e ajustes de leitura para a conta e o arquivo. */
  function loadReading(forAccount: string, statement: OfxStatement) {
    const match = profileForAccount(profiles, lastProfiles[forAccount], statement.signature) ?? null;
    const next = match ? ofxSettingsFromProfile(match.settings) : newOfxSettings(statement.lines.map((line) => line.description));
    setProfile(match);
    setSettings(next);
    setIgnoreText((next.ignoreIf ?? []).join("\n"));
  }

  function chooseAccount(id: string) {
    setAccountId(id);
    if (file) loadReading(id, file.statement);
    // recarrega a lista de importações recentes da conta, sem perder o arquivo carregado
    startNavigation(() => router.replace(`/importacao?conta=${encodeURIComponent(id)}`, { scroll: false }));
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) { toast.error("Arquivo grande demais (máximo 10 MB)."); return; }
    const { text } = decodeBytes(new Uint8Array(await chosen.arrayBuffer()));
    if (detectFormat(text) !== "ofx") { toast.error("Envie o extrato em OFX. Nos bancos, procure por “Exportar extrato” → OFX (Money/Quicken)."); return; }
    const statement = readOfx(text);
    setFile({ name: chosen.name, statement });
    loadReading(accountId, statement);
  }

  const view = useMemo(() => {
    if (!file || !settings) return null;
    const applied: OfxProfileSettings = { ...settings, ignoreIf: parseTextList(ignoreText) };
    return {
      settings: applied,
      statement: dropZeroLines(applyOfxProfile(file.statement, applied)),
      suggestions: suggestKindPrefixes(file.statement.lines.map((line) => line.description)),
    };
  }, [file, settings, ignoreText]);

  const statement = view?.statement ?? null;

  // Pré-conferência no banco: novas, já importadas, suspeitas (desmarcadas por padrão) e órfãs.
  const [preview, setPreview] = useState<{ key: string; data: ImportPreview | null; error?: string } | null>(null);
  const [includedSuspects, setIncludedSuspects] = useState<Set<number>>(new Set());
  const [ignoreOrphans, setIgnoreOrphans] = useState(true);
  // muda quando a conta ou o que define a impressão digital muda (não ao separar tipo/contraparte)
  const linesHash = useMemo(() => statement ? hashText(statement.lines.map((l) => `${l.date};${l.amountCents};${l.description};${l.externalId ?? ""}`).join("\n")) : "", [statement]);
  const previewKey = account && statement ? `${account.id}|${statement.lines.length}|${linesHash}` : "";
  useEffect(() => {
    if (!previewKey || !account || !statement) return;
    let current = true;
    const period = importPeriod(statement);
    previewStatementImport({ accountId: account.id, periodFrom: period.from ?? null, periodTo: period.to ?? null, lines: toImportLines(statement.lines) })
      .then((result) => {
        if (!current) return;
        setPreview({ key: previewKey, data: result.data ?? null, error: result.error });
        setIncludedSuspects(new Set());
      });
    return () => { current = false; };
    // previewKey resume conta + linhas; statement/account vêm junto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);
  const checked = preview?.key === previewKey ? preview.data : null;
  const previewLoading = !!previewKey && preview?.key !== previewKey;
  const statusOf = (index: number) => checked?.lines[index]?.status;
  const counts = { nova: 0, importada: 0, suspeita: 0 };
  checked?.lines.forEach((line) => { counts[line.status] += 1; });
  const openOrphans = checked?.orphans.filter((orphan) => orphan.status === "aberta") ?? [];
  const willInsert = counts.nova + includedSuspects.size;

  const changed = profile === null || (view !== null && (!sameSettings(profile.settings, view.settings) || profile.header_signature !== file?.statement.signature));
  const canImport = !!account && !!statement && statement.lines.length > 0 && !!checked && willInsert > 0 && !pending;

  function profileName() {
    const base = `${account?.name ?? "Banco"} OFX`;
    const taken = new Set(profiles.map((item) => item.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  }

  function runImport() {
    if (!canImport || !file || !view || !statement || !account) return;
    startTransition(async () => {
      let usedProfileId = profile?.id ?? null;
      // O perfil do banco é salvo (ou atualizado) junto com a importação, para as próximas.
      if (changed) {
        const saved = await saveImportProfile({
          id: profile?.id ?? null,
          name: profile?.name ?? profileName(),
          format: "ofx",
          headerSignature: file.statement.signature,
          settings: view.settings,
        });
        if (saved.error || !saved.data) { toast.error(saved.error ?? "Não foi possível salvar o perfil de leitura."); return; }
        usedProfileId = saved.data.id;
      }
      const period = importPeriod(statement);
      const result = await importStatementLines({
        accountId: account.id,
        profileId: usedProfileId,
        profileSettings: view.settings,
        fileName: file.name,
        periodFrom: period.from ?? null,
        periodTo: period.to ?? null,
        openingBalanceCents: statement.openingBalanceCents ?? null,
        closingBalanceCents: statement.closingBalanceCents ?? null,
        // suspeitas desmarcadas vão com skip: o banco numera as ocorrências pelo arquivo inteiro
        lines: toImportLines(statement.lines).map((line, index) =>
          statusOf(index) === "suspeita" && !includedSuspects.has(index) ? { ...line, skip: true } : line),
      });
      if (result.error || !result.data) { toast.error(result.error ?? "Não foi possível importar o extrato."); return; }
      toast.success(result.success);
      if (ignoreOrphans && openOrphans.length) {
        const ignored = await ignoreStatementLines(openOrphans.map((orphan) => orphan.id), "Não consta no extrato importado depois");
        if (ignored.error) toast.error(`Órfãs não ignoradas: ${ignored.error}`);
      }
      router.push(reconciliationHref(account.id, period.from, period.to));
    });
  }

  return <>
    <SectionCard aria-labelledby="import-file-title">
      <SectionHeader title="1. Banco e arquivo OFX" titleId="import-file-title" description="Escolha a conta do banco deste extrato. Nada é gravado até você confirmar." />
      <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="grid gap-1.5"><Label htmlFor="import-account">Conta</Label>
          <OptionSelect id="import-account" value={accountId} onValueChange={chooseAccount} placeholder="Escolha o banco…" invalid={!!file && !account}
            options={accounts.map((item) => ({ value: item.id, label: item.bank && item.bank !== item.name ? `${item.name} (${item.bank})` : item.name }))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="import-file">Arquivo do extrato</Label>
          <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-card px-2 text-xs hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring/30">
            <IconFileUpload className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file ? file.name : "Escolher arquivo OFX…"}</span>
            <input id="import-file" type="file" accept=".ofx,application/x-ofx" className="sr-only" onChange={onFile} />
          </label>
        </div>
        {file && !account && <p role="alert" className="m-0 text-xs text-destructive sm:col-span-2">Escolha a conta do banco deste extrato para importar.</p>}
      </div>
    </SectionCard>

    {file && view && statement && <SectionCard aria-labelledby="import-review-title">
      <SectionHeader title="2. Conferência" titleId="import-review-title"
        description={`As linhas entram abertas, para conciliar. Duplicatas de importações anteriores são puladas.${profile ? ` Leitura pelo perfil “${profile.name}”.` : ""}`}>
        <Button onClick={runImport} disabled={!canImport}>{pending ? "Importando…" : previewLoading ? "Conferindo…" : `Importar ${willInsert} ${willInsert === 1 ? "linha" : "linhas"}`}</Button>
      </SectionHeader>
      <div className="grid gap-4 p-5">
        <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold">Ajustes de leitura{profile && changed ? " (alterados: o perfil será atualizado ao importar)" : ""}</summary>
          <div className="mt-3 grid gap-5">
            <Label className="font-normal">
              <Checkbox checked={!!view.settings.memoSplit} onCheckedChange={(checked) => setSettings({ ...view.settings, memoSplit: checked === true })} />
              Separar o MEMO em “Tipo - Contraparte - …” (Nubank)
            </Label>
            <KindPrefixes selected={view.settings.kindPrefixes ?? []} suggestions={view.suggestions} onChange={(kindPrefixes) => setSettings({ ...view.settings, kindPrefixes })} />
            <IgnoreList id="import-ignore" value={ignoreText} onChange={setIgnoreText} />
          </div>
        </details>
        {statement.lines.length === 0 && <p role="alert" className="m-0 text-xs text-destructive">Nenhuma linha para importar.</p>}
        {!account && <p className="m-0 text-xs text-muted-foreground">Escolha a conta para conferir o que já foi importado nela.</p>}
        {preview?.key === previewKey && preview.error && <p role="alert" className="m-0 text-xs text-destructive">Não foi possível conferir com o que já existe: {preview.error}</p>}
        {checked && <div className="grid gap-2 rounded-md border px-3 py-2 text-xs">
          <p className="m-0">
            <strong className="num">{counts.nova}</strong> {counts.nova === 1 ? "nova" : "novas"}
            {" · "}<strong className="num">{counts.importada}</strong> já {counts.importada === 1 ? "importada (será pulada)" : "importadas (serão puladas)"}
            {counts.suspeita > 0 && <>{" · "}<strong className="num text-destructive">{counts.suspeita}</strong> {counts.suspeita === 1 ? "suspeita" : "suspeitas"}</>}
            {checked.orphans.length > 0 && <>{" · "}<strong className="num text-destructive">{checked.orphans.length}</strong> {checked.orphans.length === 1 ? "órfã" : "órfãs"}</>}
          </p>
          {counts.suspeita > 0 && <p className="m-0 text-muted-foreground">
            <strong className="text-foreground">Suspeitas</strong> têm a mesma data e valor de uma linha já importada, mas ID ou histórico diferentes — comum em OFX convertido de novo.
            Ficam de fora; marque na tabela as que são movimentos diferentes de verdade.
          </p>}
          {checked.orphans.length > 0 && <details>
            <summary className="cursor-pointer"><strong>Órfãs:</strong> linhas já importadas neste período que não aparecem no arquivo (ex.: lançamento pendente de um extrato parcial).</summary>
            <ul className="m-0 mt-2 grid gap-1 pl-4">{checked.orphans.map((orphan) => <li key={orphan.id}>
              <span className="num">{dateBR(orphan.date)}</span> {orphan.description} <span className="num">{money(orphan.amountCents / 100)}</span>
              {orphan.status === "conciliada" && <strong className="text-destructive"> — conciliada com um lançamento: confira</strong>}
            </li>)}</ul>
            {openOrphans.length > 0 && <Label className="mt-2 font-normal">
              <Checkbox checked={ignoreOrphans} onCheckedChange={(value) => setIgnoreOrphans(value === true)} />
              Ignorar as {openOrphans.length} órfãs abertas ao importar (motivo “Não consta no extrato importado depois”; dá para reabrir na conciliação)
            </Label>}
          </details>}
        </div>}
        <ImportReview statement={statement} statuses={checked?.lines}
          includedSuspects={includedSuspects}
          onToggleSuspect={(index) => setIncludedSuspects((set) => { const next = new Set(set); if (next.has(index)) next.delete(index); else next.add(index); return next; })} />
      </div>
    </SectionCard>}
  </>;
}

