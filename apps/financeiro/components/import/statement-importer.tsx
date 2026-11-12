"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconFileUpload } from "@tabler/icons-react";
import { importStatementLines, saveImportProfile, type ImportProfile } from "@/app/importacao/actions";
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
  const changed = profile === null || (view !== null && (!sameSettings(profile.settings, view.settings) || profile.header_signature !== file?.statement.signature));
  const canImport = !!account && !!statement && statement.lines.length > 0 && !pending;

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
        lines: toImportLines(statement.lines),
      });
      if (result.error || !result.data) { toast.error(result.error ?? "Não foi possível importar o extrato."); return; }
      toast.success(result.success);
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
        <Button onClick={runImport} disabled={!canImport}>{pending ? "Importando…" : `Importar ${statement.lines.length} ${statement.lines.length === 1 ? "linha" : "linhas"}`}</Button>
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
        <ImportReview statement={statement} />
      </div>
    </SectionCard>}
  </>;
}

