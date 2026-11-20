"use client";

import { createContext, useContext, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconDots, IconFileDescription, IconFolderCheck, IconFolderExclamation, IconPlus, IconTrash } from "@tabler/icons-react";
import { deleteEntry, setDocumentFiled } from "@/app/actions";
import { Button, buttonVariants } from "@geas/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { Badge } from "@geas/ui/components/badge";
import { cn } from "@geas/ui/lib/utils";

export type EntryOverride = { filed?: boolean; deleted?: boolean; accountName?: string; reconciled?: boolean; reviewed?: boolean };
/** Lançamento marcado para ação em lote, com o que a barra precisa mostrar. */
export type SelectedEntry = { accountName: string; reconciled: boolean };

type ListApi = {
  canEdit: boolean;
  overrides: Record<string, EntryOverride>;
  detailHref: (entryId: string) => string;
  requestDelete: (entryId: string) => void;
  toggleFiled: (entryId: string, filed: boolean) => void;
  busyEntryId: string | null;
  /** Seleção para ações em lote (só tesouraria/administração, na visão Movimentações). */
  selected: Map<string, SelectedEntry>;
  setSelected: (entries: [string, SelectedEntry][], on: boolean) => void;
  clearSelection: () => void;
  override: (entryId: string, patch: EntryOverride) => void;
};

const EMPTY_SELECTION = new Map<string, SelectedEntry>();

const ListContext = createContext<ListApi | null>(null);

function useList() {
  const api = useContext(ListContext);
  if (!api) throw new Error("EntryListProvider ausente.");
  return api;
}

/** Ações rápidas da lista (documentos e exclusão) e links para a página de detalhes. */
/** `returnHref`: caminho da visão atual com os filtros, para os detalhes voltarem ao mesmo lugar. */
export function EntryListProvider({ canEdit, returnHref, children }: { canEdit: boolean; returnHref: string; children: React.ReactNode }) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, EntryOverride>>({});
  // a seleção vale para a lista atual: trocar filtro, visão ou ordem começa uma seleção nova
  const [selection, setSelection] = useState<{ query: string; entries: Map<string, SelectedEntry> }>({ query: returnHref, entries: new Map() });
  const selected = selection.query === returnHref ? selection.entries : EMPTY_SELECTION;
  const [pending, startTransition] = useTransition();
  const override = (entryId: string, patch: EntryOverride) => setOverrides((current) => ({ ...current, [entryId]: { ...current[entryId], ...patch } }));

  const api: ListApi = {
    canEdit,
    overrides,
    busyEntryId,
    detailHref: (entryId) => `/financeiro/lancamentos/${entryId}${returnHref ? `?voltar=${encodeURIComponent(returnHref)}` : ""}`,
    requestDelete: (entryId) => setDeleteId(entryId),
    selected,
    setSelected: (entries, on) => setSelection((current) => {
      const next = new Map(current.query === returnHref ? current.entries : undefined);
      for (const [id, entry] of entries) {
        if (on) next.set(id, entry); else next.delete(id);
      }
      return { query: returnHref, entries: next };
    }),
    clearSelection: () => setSelection({ query: returnHref, entries: new Map() }),
    override,
    toggleFiled: (entryId, filed) => {
      setBusyEntryId(entryId);
      override(entryId, { filed });
      startTransition(async () => {
        const result = await setDocumentFiled(entryId, filed);
        if (result.error) { toast.error(result.error); override(entryId, { filed: !filed }); }
        setBusyEntryId(null);
      });
    },
  };

  function confirmDelete() {
    if (!deleteId) return;
    const id = deleteId;
    startTransition(async () => {
      const result = await deleteEntry(id);
      if (result.error) toast.error(result.error);
      else { override(id, { deleted: true }); toast.info("Lançamento excluído."); }
      setDeleteId(null);
    });
  }

  return <ListContext.Provider value={api}>
    {children}
    {canEdit && <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir lançamento?</DialogTitle>
          <DialogDescription>O lançamento, todos os seus rateios e os comprovantes anexados serão excluídos. A exclusão fica registrada na auditoria.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={pending}>{pending ? "Excluindo…" : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </ListContext.Provider>;
}

export function NewEntryButton({ returnHref }: { returnHref: string }) {
  return <Link href={`/financeiro/lancamentos/novo${returnHref ? `?voltar=${encodeURIComponent(returnHref)}` : ""}`} className={buttonVariants({ size: "lg" })}><IconPlus data-icon="inline-start" /> Novo lançamento</Link>;
}

export function useEntryOverrides() {
  return useList().overrides;
}

export function useEntrySelection() {
  const { canEdit, selected, setSelected, clearSelection, override } = useList();
  return { canEdit, selected, setSelected, clearSelection, override };
}

/** Abre os detalhes ao clicar, exceto quando o clique é em um controle interno ou seleciona texto. */
function useOpenOnClick(entryId: string) {
  const { detailHref } = useList();
  const router = useRouter();
  return (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a, button, label, [role=menuitem], [role=checkbox], input, select")) return;
    if (window.getSelection()?.toString()) return;
    router.push(detailHref(entryId));
  };
}

/** Linha clicável: abre os detalhes, exceto quando o clique é em um controle interno. */
export function EntryRow({ entryId, className, children, ...props }: { entryId: string; className?: string; children: React.ReactNode } & React.ComponentProps<"tr">) {
  const open = useOpenOnClick(entryId);
  return <tr
    {...props}
    data-slot="table-row"
    className={cn("cursor-pointer border-b transition-colors hover:bg-accent/50", className)}
    onClick={open}
  >{children}</tr>;
}

/** Cartão clicável (telas estreitas): mesmo comportamento da linha da tabela. */
export function EntryCard({ entryId, className, children, ...props }: { entryId: string; className?: string; children: React.ReactNode } & React.ComponentProps<"li">) {
  const open = useOpenOnClick(entryId);
  return <li {...props} className={cn("cursor-pointer transition-colors hover:bg-accent/50", className)} onClick={open}>{children}</li>;
}

/** Link acessível para os detalhes (alvo de teclado e leitores de tela). */
export function EntryLink({ entryId, children, className }: { entryId: string; children: React.ReactNode; className?: string }) {
  const { detailHref } = useList();
  return <Link href={detailHref(entryId)} className={cn("font-medium underline-offset-2 hover:underline focus-visible:underline", className)}>{children}</Link>;
}

/** Marca do lançamento que veio do registro rápido e ainda não foi revisado (some ao marcar revisado na lista). */
export function ReviewMark({ entryId, status }: { entryId: string; status?: string }) {
  const { overrides } = useList();
  if (status !== "para_revisar" || overrides[entryId]?.reviewed) return null;
  return <Badge variant="caution" className="ml-1.5 align-middle" title="Veio do registro rápido: confira e marque como revisado">Revisar</Badge>;
}

export function FolderStatus({ entryId, filed, document }: { entryId: string; filed: boolean; document: string | null }) {
  const { canEdit, toggleFiled, busyEntryId } = useList();
  const label = filed ? "Arquivado" : "Pendente";
  const variant = filed ? "success" : "caution";
  const icon = filed ? <IconFolderCheck className="size-3.5" aria-hidden /> : <IconFolderExclamation className="size-3.5" aria-hidden />;
  const action = filed ? "Marcar documento como pendente" : "Marcar documento como arquivado";
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    {canEdit
      ? <Badge size="md" variant={variant} className="cursor-pointer [&>svg]:size-3.5! hover:ring-1 hover:ring-current disabled:opacity-50"
          render={<button type="button" disabled={busyEntryId === entryId} onClick={() => toggleFiled(entryId, !filed)} title={action}
            aria-label={`${label}${document ? `, ${document}` : ""}. ${action}`} />}>{icon}{label}</Badge>
      : <Badge size="md" variant={variant} className="[&>svg]:size-3.5!">{icon}{label}</Badge>}
    {document && <span className="max-w-32 truncate text-muted-foreground" title={document}>{document}</span>}
  </span>;
}

/**
 * Menu ⋯ da linha/cartão. Até o primeiro clique é só o botão: o menu (Base UI) é montado aberto nessa hora, para as
 * linhas e cartões montados durante a rolagem (listas virtualizadas) saírem baratos.
 */
export function EntryRowActions({ entryId, filed }: { entryId: string; filed: boolean }) {
  const [active, setActive] = useState(false);
  if (!active) return <Button variant="ghost" size="icon-sm" aria-label="Ações do lançamento" aria-haspopup="menu" aria-expanded={false} onClick={() => setActive(true)}><IconDots /></Button>;
  return <EntryRowMenu entryId={entryId} filed={filed} />;
}

function EntryRowMenu({ entryId, filed }: { entryId: string; filed: boolean }) {
  const { canEdit, detailHref, requestDelete, toggleFiled } = useList();
  const router = useRouter();
  return <DropdownMenu defaultOpen>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Ações do lançamento" />}><IconDots /></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => router.push(detailHref(entryId))}><IconFileDescription /> {canEdit ? "Detalhes e edição" : "Detalhes"}</DropdownMenuItem>
        {canEdit && <DropdownMenuItem onClick={() => toggleFiled(entryId, !filed)}>{filed ? <IconFolderExclamation /> : <IconFolderCheck />} {filed ? "Marcar documento como pendente" : "Marcar documento como arquivado"}</DropdownMenuItem>}
      </DropdownMenuGroup>
      {canEdit && <>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={() => requestDelete(entryId)}><IconTrash /> Excluir</DropdownMenuItem>
        </DropdownMenuGroup>
      </>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
