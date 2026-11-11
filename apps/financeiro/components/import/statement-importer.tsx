"use client";

import { useMemo, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconFileUpload } from "@tabler/icons-react";
import { importStatementLines, saveImportProfile, type ImportProfile } from "@/app/importacao/actions";
import { CsvProfileBuilder } from "@/components/import/csv-profile-builder";
import { ImportReview } from "@/components/import/import-review";
import { IgnoreList, KindPrefixes } from "@/components/import/profile-options";
import { OptionSelect } from "@/components/option-controls";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  csvSettingsFromProfile, descriptionValues, detectFormat, dropZeroLines, findMatchingProfile, missingRoles, newCsvSettings,
  newOfxSettings, ofxSettingsFromProfile, parseTextList, pruneColumns, reconciliationHref, sameSettings, toImportLines,
  type ImportFormat,
} from "@/lib/import-flow";
import {
  applyOfxProfile, applyProfile, decodeBytes, headerSignature, readCsv, readOfx, suggestKindPrefixes,
  type OfxProfileSettings, type ParsedStatement, type ProfileSettings,
} from "@/lib/statement-import";

export type ImportAccount = { id: string; name: string; bank: string | null };

type LoadedFile = { name: string; bytes: Uint8Array; format: ImportFormat };
type Draft = { format: "csv"; settings: ProfileSettings } | { format: "ofx"; settings: OfxProfileSettings };
type SaveChoice = { mode: "keep" } | { mode: "update"; id: string; name: string } | { mode: "create"; name: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const NEW_PROFILE = "";

/** Configurações que o arquivo terá com um perfil salvo, ou com sugestões quando não há perfil. */
function draftFor(file: LoadedFile, profile: ImportProfile | null): Draft {
  if (file.format === "ofx") {
    const settings = profile ? ofxSettingsFromProfile(profile.settings)
      : newOfxSettings(readOfx(decodeBytes(file.bytes).text).lines.map((line) => line.description));
    return { format: "ofx", settings };
  }
  const saved = profile ? csvSettingsFromProfile(profile.settings) : null;
  if (saved) return { format: "csv", settings: saved };
  const { text, encoding } = decodeBytes(file.bytes);
  return { format: "csv", settings: newCsvSettings(text, encoding) };
}

/** Período da importação: o declarado no arquivo, ampliado para cobrir todas as linhas. */
function importPeriod(statement: ParsedStatement) {
  const dates = statement.lines.map((line) => line.date).sort();
  const from = [statement.periodFrom, dates[0]].filter(Boolean).sort()[0];
  const to = [statement.periodTo, dates[dates.length - 1]].filter(Boolean).sort().at(-1);
  return { from, to };
}

export function StatementImporter({ accounts, profiles, accountId: initialAccountId }: {
  accounts: ImportAccount[];
  profiles: ImportProfile[];
  accountId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, startNavigation] = useTransition();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [profileId, setProfileId] = useState(NEW_PROFILE);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ignoreText, setIgnoreText] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  const profile = profiles.find((item) => item.id === profileId) ?? null;
  const account = accounts.find((item) => item.id === accountId);

  function loadProfile(next: ImportProfile | null, loaded: LoadedFile) {
    const nextDraft = draftFor(loaded, next);
    setProfileId(next?.id ?? NEW_PROFILE);
    setDraft(nextDraft);
    setIgnoreText((nextDraft.settings.ignoreIf ?? []).join("\n"));
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) { toast.error("Arquivo grande demais (máximo 10 MB)."); return; }
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    const { text } = decodeBytes(bytes);
    const format = detectFormat(text);
    const loaded: LoadedFile = { name: chosen.name, bytes, format };
    const match = format === "ofx"
      ? findMatchingProfile(profiles, "ofx", () => readOfx(text).signature)
      : findMatchingProfile(profiles, "csv", (candidate) => {
        const settings = csvSettingsFromProfile(candidate.settings);
        return settings ? headerSignature(readCsv(decodeBytes(bytes, settings.encoding).text, settings).header) : null;
      });
    setFile(loaded);
    loadProfile(match ?? null, loaded);
    if (match) toast.info(`Perfil “${match.name}” reconhecido. Confira e ajuste se precisar.`);
  }

  function chooseAccount(id: string) {
    setAccountId(id);
    // recarrega a lista de importações recentes da conta, sem perder o arquivo em montagem
    startNavigation(() => router.replace(`/importacao?conta=${encodeURIComponent(id)}`, { scroll: false }));
  }

  // Leitura em camadas: decodificar e separar colunas só quando a leitura muda.
  const csvSettings = draft?.format === "csv" ? draft.settings : null;
  const encoding = csvSettings?.encoding;
  const delimiter = csvSettings?.delimiter;
  const headerRow = csvSettings?.headerRow;
  const text = useMemo(() => (file ? decodeBytes(file.bytes, file.format === "csv" ? encoding : undefined).text : ""), [file, encoding]);
  const table = useMemo(
    () => (file?.format === "csv" && delimiter && headerRow ? readCsv(text, { delimiter, headerRow }) : null),
    [file, text, delimiter, headerRow],
  );
  const ofx = useMemo(() => (file?.format === "ofx" ? readOfx(text) : null), [file, text]);

  const view = useMemo(() => {
    if (!draft) return null;
    const ignoreIf = parseTextList(ignoreText);
    if (draft.format === "csv" && table) {
      const settings: ProfileSettings = { ...draft.settings, columns: pruneColumns(draft.settings.columns, table.header), ignoreIf };
      const missing = missingRoles(settings.columns);
      const statement = missing.length > 0 ? null : dropZeroLines(applyProfile(table, settings));
      const suggestions = suggestKindPrefixes(descriptionValues(table.header, table.rows, settings.columns));
      return { format: "csv" as const, settings, missing, statement, suggestions, signature: headerSignature(table.header) };
    }
    if (draft.format === "ofx" && ofx) {
      const settings: OfxProfileSettings = { ...draft.settings, ignoreIf };
      const statement = dropZeroLines(applyOfxProfile(ofx, settings));
      const suggestions = suggestKindPrefixes(ofx.lines.map((line) => line.description));
      return { format: "ofx" as const, settings, missing: [] as string[], statement, suggestions, signature: ofx.signature };
    }
    return null;
  }, [draft, ignoreText, table, ofx]);

  const statement = view?.statement ?? null;
  const changed = profile !== null && view !== null && (!sameSettings(profile.settings, view.settings) || profile.header_signature !== view.signature);
  const canImport = !!account && !!view && view.missing.length === 0 && !!statement && statement.lines.length > 0 && !pending;
  const formatProfiles = profiles.filter((item) => item.format === file?.format);
  const profileOptions = formatProfiles.map((item) => ({ value: item.id, label: item.name }));

  function setKindPrefixes(kindPrefixes: string[]) {
    if (draft) setDraft({ ...draft, settings: { ...draft.settings, kindPrefixes } } as Draft);
  }

  function requestImport() {
    if (!canImport) return;
    if (profile && !changed) runImport({ mode: "keep" });
    else setSaveOpen(true);
  }

  function runImport(choice: SaveChoice) {
    if (!file || !view || !statement || !account) return;
    startTransition(async () => {
      let usedProfileId = profile?.id ?? null;
      if (choice.mode !== "keep") {
        const saved = await saveImportProfile({
          id: choice.mode === "update" ? choice.id : null,
          name: choice.name,
          format: view.format,
          headerSignature: view.signature,
          settings: view.settings,
        });
        if (saved.error || !saved.data) { toast.error(saved.error ?? "Não foi possível salvar o perfil."); return; }
        usedProfileId = saved.data.id;
        setProfileId(saved.data.id);
        router.refresh();
      }
      setSaveOpen(false);
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

  const suggestedName = () => {
    const base = `${account?.bank || account?.name || "Banco"} ${file?.format.toUpperCase() ?? ""}`.trim();
    const taken = new Set(profiles.map((item) => item.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  };

  return <>
    <section className="card" aria-labelledby="import-file-title">
      <header className="card-head"><div>
        <h2 className="card-title" id="import-file-title">1. Conta e arquivo</h2>
        <p className="m-0 text-xs text-muted-foreground">CSV ou OFX; o formato é reconhecido pelo conteúdo. Nada é gravado até você confirmar.</p>
      </div></header>
      <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="grid gap-1.5"><Label htmlFor="import-account">Conta</Label>
          <OptionSelect id="import-account" value={accountId} onValueChange={chooseAccount} options={accounts.map((item) => ({ value: item.id, label: item.name }))} /></div>
        <div className="grid gap-1.5"><Label htmlFor="import-file">Arquivo do extrato</Label>
          <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-card px-2 text-xs hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring/30">
            <IconFileUpload className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{file ? file.name : "Escolher arquivo CSV ou OFX…"}</span>
            {file && <span className="ml-auto shrink-0 rounded-full bg-muted px-2 text-[11px] font-semibold uppercase">{file.format}</span>}
            <input id="import-file" type="file" accept=".csv,.ofx,.txt,text/csv,application/x-ofx" className="sr-only" onChange={onFile} />
          </label>
        </div>
      </div>
    </section>

    {file && draft && <section className="card" aria-labelledby="import-profile-title">
      <header className="card-head gap-4"><div>
        <h2 className="card-title" id="import-profile-title">2. Perfil de leitura</h2>
        <p className="m-0 text-xs text-muted-foreground">{profile
          ? `Pré-preenchido pelo perfil “${profile.name}”.${changed ? " Há ajustes: o perfil será atualizado ao importar." : ""}`
          : "Arquivo sem perfil salvo: confira as sugestões e defina o papel das colunas."}</p>
      </div>
      <div className="w-56 shrink-0"><OptionSelect aria-label="Perfil" value={profileId} emptyLabel="Novo perfil" options={profileOptions}
        onValueChange={(id) => loadProfile(formatProfiles.find((item) => item.id === id) ?? null, file)} /></div>
      </header>
      <div className="grid gap-5 p-5">
        {draft.format === "csv" && table && <CsvProfileBuilder settings={draft.settings} table={table} onChange={(settings) => setDraft({ format: "csv", settings })} />}
        {draft.format === "ofx" && <Label className="font-normal">
          <Checkbox checked={!!draft.settings.memoSplit} onCheckedChange={(checked) => setDraft({ format: "ofx", settings: { ...draft.settings, memoSplit: checked === true } })} />
          Separar o MEMO em “Tipo - Contraparte - …” (Nubank)
        </Label>}
        {view && <KindPrefixes selected={draft.settings.kindPrefixes ?? []} suggestions={view.suggestions} onChange={setKindPrefixes} />}
        <IgnoreList id="import-ignore" value={ignoreText} onChange={setIgnoreText} />
      </div>
    </section>}

    {file && view && <section className="card" aria-labelledby="import-review-title">
      <header className="card-head gap-4"><div>
        <h2 className="card-title" id="import-review-title">3. Conferência</h2>
        <p className="m-0 text-xs text-muted-foreground">As linhas entram abertas, para conciliar. Duplicatas de importações anteriores são puladas.</p>
      </div>
      <Button onClick={requestImport} disabled={!canImport}>{pending ? "Importando…" : `Importar ${statement?.lines.length ?? 0} linhas`}</Button>
      </header>
      <div className="p-5">
        {view.missing.length > 0
          ? <p role="alert" className="m-0 text-xs text-destructive">Defina o papel das colunas obrigatórias: {view.missing.join("; ")}.</p>
          : statement && <>
            {statement.lines.length === 0 && <p role="alert" className="m-0 mb-3 text-xs text-destructive">Nenhuma linha para importar.</p>}
            <ImportReview statement={statement} />
          </>}
      </div>
    </section>}

    {view && <SaveProfileDialog open={saveOpen} onOpenChange={setSaveOpen} profile={profile} pending={pending} defaultName={suggestedName}
      onConfirm={runImport} />}
  </>;
}

function SaveProfileDialog({ open, onOpenChange, profile, pending, defaultName, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ImportProfile | null;
  pending: boolean;
  defaultName: () => string;
  onConfirm: (choice: SaveChoice) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      {open && <SaveProfileForm key={profile?.id ?? "new"} profile={profile} pending={pending} defaultName={defaultName} onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />}
    </DialogContent>
  </Dialog>;
}

function SaveProfileForm({ profile, pending, defaultName, onCancel, onConfirm }: {
  profile: ImportProfile | null;
  pending: boolean;
  defaultName: () => string;
  onCancel: () => void;
  onConfirm: (choice: SaveChoice) => void;
}) {
  const [asNew, setAsNew] = useState(profile === null);
  const [name, setName] = useState(() => defaultName());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (profile && !asNew) onConfirm({ mode: "update", id: profile.id, name: profile.name });
    else onConfirm({ mode: "create", name: name.trim() });
  };
  return <form onSubmit={submit} className="grid gap-3">
    <DialogHeader>
      <DialogTitle>{profile ? "Perfil ajustado" : "Salvar perfil"}</DialogTitle>
      <DialogDescription>{profile
        ? <>O perfil “{profile.name}” será atualizado com os ajustes e usado nas próximas importações do grupo.</>
        : "Dê um nome ao perfil deste banco/formato. Ele pré-preenche as próximas importações do grupo."}</DialogDescription>
    </DialogHeader>
    {profile && <Label className="font-normal"><Checkbox checked={asNew} onCheckedChange={(checked) => setAsNew(checked === true)} />Salvar como novo perfil, sem alterar “{profile.name}”</Label>}
    {asNew && <div className="grid gap-1.5"><Label htmlFor="profile-name">Nome do perfil</Label>
      <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ex.: Mercado Pago CSV" required minLength={2} autoFocus /></div>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={pending || (asNew && name.trim().length < 2)}>{pending ? "Importando…" : asNew ? "Salvar perfil e importar" : "Atualizar perfil e importar"}</Button>
    </DialogFooter>
  </form>;
}
