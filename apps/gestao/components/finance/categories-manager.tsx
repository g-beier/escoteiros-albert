"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Link } from "@geas/ui/components/link";
import {
  IconAlertTriangle,
  IconArrowsMove,
  IconDeviceFloppy,
  IconDots,
  IconPackage,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { saveCategoryTree } from "@/app/(financeiro)/financeiro/configuracoes/actions";
import { LedgerCodeInput } from "@/components/finance/ledger-code-input";
import {
  addNode,
  createDraft,
  deletedTarget,
  draftChanges,
  draftPayload,
  draftRows,
  dropError,
  moveNode,
  removeNode,
  updateNode,
  MAX_DEPTH,
  type Draft,
  type DraftChanges,
  type DraftRow,
  type SavedCategory,
} from "@/lib/finance/category-draft";
import { isLedgerCode } from "@/lib/finance/ledger-code";
import { OptionCombobox } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geas/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { DragHandle, DragHandleSpacer, DROP_CLASS, useTreeDrag, type DropPlace } from "@geas/ui/components/tree-drag";
import { cn } from "@geas/ui/lib/utils";

/**
 * Rubricas em árvore, editadas como rascunho: arrastar pela alça (acima, abaixo ou dentro de outra), renomear,
 * criar, inativar e excluir não gravam nada até "Salvar alterações". Os códigos se recalculam na hora;
 * os lançamentos acompanham a rubrica (id), não o código.
 */
export function CategoriesManager({ categories, canEdit }: { categories: SavedCategory[]; canEdit: boolean }) {
  const saved = useMemo(() => createDraft(categories), [categories]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [moving, setMoving] = useState<DraftRow | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, startSaving] = useTransition();

  const rows = useMemo(() => draftRows(draft), [draft]);
  const changes = useMemo(() => draftChanges(draft, saved), [draft, saved]);
  const dirty = changes.total > 0;
  const missing = rows.filter(needsLedgerCode).length;
  const visible = onlyMissing ? rows.filter(needsLedgerCode) : rows;

  // não perder o rascunho ao sair da página sem salvar
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const add = (parentKey: string) => {
    const [next, key] = addNode(draft, parentKey);
    setDraft(next);
    setFocusKey(key);
  };

  const save = () => {
    const invalid = rows.find(
      (row) => row.node.name.trim().length < 2 || (row.node.ledgerCode && !isLedgerCode(row.node.ledgerCode)),
    );
    if (invalid) {
      toast.error(
        `${invalid.code ?? ""} ${invalid.node.name || "(sem nome)"}: ${invalid.node.name.trim().length < 2 ? "nome com ao menos 2 caracteres" : "conta contábil incompleta"}.`,
      );
      setFocusKey(invalid.node.key);
      setReviewing(false);
      return;
    }
    startSaving(async () => {
      const result = await saveCategoryTree(draftPayload(draft));
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success);
      setReviewing(false);
    });
  };

  const drag = useTreeDrag({
    dropError: (key, target, place) => dropError(draft, key, target, place),
    onDrop: (key, target, place) => setDraft(moveNode(draft, key, target, place)),
  });
  const dragKey = drag.dragKey;

  const expenses = rows.find((row) => row.node.isRoot && row.kind === "despesa");
  return (
    <>
      <SectionCard aria-labelledby="categories-title" className={cn(dirty && "mb-20")}>
        <SectionHeader
          title="Rubricas"
          titleId="categories-title"
          description="Arraste pela alça para reordenar ou pôr dentro de outra; renomeie, crie e exclua à vontade. Nada é gravado até salvar, e os códigos se recalculam na hora. Excluir leva os rateios para a rubrica de cima."
        >
          {missing > 0 && (
            <Label className="text-xs font-normal">
              <Checkbox checked={onlyMissing} onCheckedChange={(checked) => setOnlyMissing(checked === true)} />
              Só sem conta contábil ({missing})
            </Label>
          )}
          <SectionCount>
            {rows.filter((row) => row.node.active).length} ativas de {rows.length}
          </SectionCount>
          {canEdit && expenses && (
            <Button variant="outline" onClick={() => add(expenses.node.key)}>
              <IconPlus data-icon="inline-start" /> Nova rubrica
            </Button>
          )}
        </SectionHeader>
        <div className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableCaption className="sr-only">Rubricas do grupo</TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-3">Nome</TableHead>
                <TableHead className="h-8 px-3">Conta contábil</TableHead>
                <TableHead className="h-8 px-3 text-right">Uso</TableHead>
                <TableHead className="h-8 w-24 px-3 text-right">
                  <span className="sr-only">Status e ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <CategoryTableRow
                  key={row.node.key}
                  row={row}
                  saved={saved}
                  canEdit={canEdit}
                  draggable={canEdit && !onlyMissing && !row.node.isRoot && !saving}
                  dragging={dragKey === row.node.key}
                  drop={drag.dropFor(row.node.key)}
                  autoFocus={focusKey === row.node.key}
                  rowProps={drag.rowProps(row.node.key)}
                  handleProps={drag.handleProps(row.node.key)}
                  onChange={(patch) => setDraft(updateNode(draft, row.node.key, patch))}
                  onAdd={() => add(row.node.key)}
                  onMove={() => setMoving(row)}
                  onRemove={() => setDraft(removeNode(draft, row.node.key))}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {(dirty || dragKey) && (
        <div
          role="region"
          aria-label="Alterações não salvas"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-lg backdrop-blur"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5">
            <p className="m-0 min-w-0 flex-1 text-xs" aria-live="polite">
              {dragKey ? (
                drag.hint ? (
                  <span className="text-destructive">{drag.hint}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Solte acima, abaixo ou no meio de uma rubrica (para pôr dentro dela).
                  </span>
                )
              ) : (
                <>
                  <strong>{summary(changes)}</strong> <span className="text-muted-foreground">· ainda não gravado</span>
                </>
              )}
            </p>
            {!dragKey && (
              <>
                <Button variant="outline" disabled={saving} onClick={() => setDraft(saved)}>
                  Descartar
                </Button>
                <Button disabled={saving} onClick={() => (draft.deleted.length ? setReviewing(true) : save())}>
                  <IconDeviceFloppy data-icon="inline-start" /> {saving ? "Salvando…" : "Salvar alterações"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {canEdit && (
        <Dialog
          open={moving !== null}
          onOpenChange={(open) => {
            if (!open) setMoving(null);
          }}
        >
          <DialogContent className="w-[min(34rem,calc(100%-2rem))]">
            {moving && (
              <MoveForm
                key={moving.node.key}
                row={moving}
                draft={draft}
                rows={rows}
                onMove={(target) => {
                  setDraft(moveNode(draft, moving.node.key, target, "inside"));
                  setMoving(null);
                }}
                onCancel={() => setMoving(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent className="w-[min(36rem,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>Salvar alterações nas rubricas</DialogTitle>
            <DialogDescription>
              {summary(changes)}. Excluir não dá para desfazer: os rateios das rubricas excluídas mudam de rubrica, e
              cada lançamento registra a troca no histórico.
            </DialogDescription>
          </DialogHeader>
          <ul className="m-0 grid max-h-64 list-none gap-1 overflow-y-auto p-0 text-xs">
            {draft.deleted.map((item) => {
              const target = deletedTarget(draft, item);
              const targetCode = target && rows.find((row) => row.node.key === target.key)?.code;
              return (
                <li key={item.key} className="flex flex-wrap items-baseline gap-x-1.5">
                  <IconTrash className="size-3 shrink-0 self-center text-destructive" aria-hidden />
                  <span className="line-through">
                    {item.savedCode} {item.name}
                  </span>
                  {item.usage > 0 && (
                    <span className="text-muted-foreground">
                      — {plural(item.usage, "rateio vai", "rateios vão")} para{" "}
                      <strong className="text-foreground">
                        {targetCode} {target?.name}
                      </strong>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(false)}>
              Voltar
            </Button>
            <Button disabled={saving} onClick={save}>
              <IconDeviceFloppy data-icon="inline-start" /> {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function summary(changes: DraftChanges) {
  const parts = [
    changes.created && plural(changes.created, "nova", "novas"),
    changes.renamed && plural(changes.renamed, "renomeada", "renomeadas"),
    changes.moved && plural(changes.moved, "código muda", "códigos mudam"),
    changes.toggled && plural(changes.toggled, "ativação", "ativações"),
    changes.deleted &&
      `${plural(changes.deleted, "excluída", "excluídas")}${changes.movedSplits ? ` (${plural(changes.movedSplits, "rateio muda", "rateios mudam")} de rubrica)` : ""}`,
  ].filter(Boolean);
  return parts.join(" · ") || "Sem alterações";
}

function needsLedgerCode(row: DraftRow) {
  return row.subtree.length === 1 && row.node.usage > 0 && !row.node.ledgerCode;
}

type RowProps = {
  row: DraftRow;
  saved: Draft;
  canEdit: boolean;
  draggable: boolean;
  dragging: boolean;
  drop: DropPlace | null;
  autoFocus: boolean;
  rowProps: ReturnType<ReturnType<typeof useTreeDrag>["rowProps"]>;
  handleProps: { onDragStart: () => void; onDragEnd: () => void };
  onChange: (patch: { name?: string; ledgerCode?: string | null; active?: boolean; sellsItems?: boolean }) => void;
  onAdd: () => void;
  onMove: () => void;
  onRemove: () => void;
};

function CategoryTableRow({
  row,
  saved,
  canEdit,
  draggable,
  dragging,
  drop,
  autoFocus,
  rowProps,
  handleProps,
  onChange,
  onAdd,
  onMove,
  onRemove,
}: RowProps) {
  const { node } = row;
  const before = node.id ? saved.nodes[node.key] : null;
  const title = `${row.code ?? ""} ${node.name}`.trim();
  const renamed = before && before.name !== node.name;
  const ledgerChanged = before && (before.ledgerCode ?? "") !== (node.ledgerCode ?? "");
  return (
    <TableRow
      className={cn(!node.active && "text-muted-foreground", dragging && "opacity-40", drop && DROP_CLASS[drop])}
      {...rowProps}
    >
      <TableCell className="px-3 py-1">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
          {draggable ? <DragHandle id={node.key} {...handleProps} /> : <DragHandleSpacer />}
          <span className="grid w-14 shrink-0 text-right leading-tight">
            <span
              className={cn(
                "num text-xs font-semibold",
                row.kind === "receita"
                  ? "text-success"
                  : row.kind === "despesa"
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {row.code ?? "—"}
            </span>
            {row.moved && (
              <span className="num text-[10px] text-muted-foreground line-through" title="Código gravado">
                {node.savedCode ?? "—"}
              </span>
            )}
          </span>
          {canEdit ? (
            <>
              {/* rótulo visível: cabeçalho da coluna; este nomeia o campo de cada linha para leitores de tela */}
              <Label htmlFor={`category-${node.key}`} className="sr-only">
                Nome de {title}
              </Label>
              <Input
                id={`category-${node.key}`}
                value={node.name}
                maxLength={100}
                autoFocus={autoFocus}
                onFocus={autoFocus ? (event) => event.currentTarget.select() : undefined}
                onChange={(event) => onChange({ name: event.target.value })}
                aria-invalid={node.name.trim().length < 2 || undefined}
                className={cn(
                  "max-w-md",
                  row.subtree.length > 1 && "font-semibold",
                  (renamed || !node.id) && "border-attention-line",
                )}
              />
            </>
          ) : (
            <span className={cn(row.subtree.length > 1 && "font-semibold")}>{node.name}</span>
          )}
          {!node.id && (
            <span className="shrink-0 rounded-full bg-attention-soft px-2 py-0.5 text-[11px] font-semibold text-attention-soft-foreground">
              Nova
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-1">
        {canEdit ? (
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`category-${node.key}-ledger`} className="sr-only">
              Conta contábil de {title}
            </Label>
            <LedgerCodeInput
              id={`category-${node.key}-ledger`}
              defaultValue={node.ledgerCode}
              onValueChange={(value) => onChange({ ledgerCode: value || null })}
              className={cn("w-36 shrink-0", ledgerChanged && "border-attention-line")}
            />
            {needsLedgerCode(row) && (
              <IconAlertTriangle
                className="size-4 shrink-0 text-attention-strong"
                aria-label="Sem conta contábil"
                title="Rubrica usada e sem conta contábil: necessária para exportar à contabilidade"
              />
            )}
          </div>
        ) : (
          <span className="num">{node.ledgerCode ?? "—"}</span>
        )}
      </TableCell>
      <TableCell className="px-3 py-1 text-right num" title="Rateios que usam esta rubrica">
        {node.usage > 0 ? (
          <Link
            href={`/financeiro/lancamentos/detalhamento?de=tudo&rubrica=${node.id}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
            title="Ver os rateios que usam esta rubrica (para recategorizar)"
          >
            {node.usage} <IconExternalLink className="size-3" aria-hidden />
            <span className="sr-only">ver rateios</span>
          </Link>
        ) : (
          node.usage
        )}
      </TableCell>
      <TableCell className="px-3 py-1">
        <div className="flex items-center justify-end gap-1">
          {row.sells && (
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                node.sellsItems ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
              title={
                node.sellsItems
                  ? "Os lançamentos desta rubrica e das de baixo podem listar itens vendidos, que dão baixa no Inventário"
                  : "Vende itens: herdado da rubrica de cima"
              }
            >
              {node.sellsItems ? "Venda de itens" : "Venda (herdada)"}
            </span>
          )}
          {!node.active && (
            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Inativa
            </span>
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${title}`} />}>
                <IconDots />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  {!node.isRoot && (
                    <DropdownMenuItem onClick={onMove}>
                      <IconArrowsMove /> Mover para dentro de…
                    </DropdownMenuItem>
                  )}
                  {row.code && row.depth < MAX_DEPTH && (
                    <DropdownMenuItem onClick={onAdd}>
                      <IconPlus /> Nova rubrica dentro desta
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                {!node.isRoot && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {row.kind === "receita" && (
                        <DropdownMenuItem onClick={() => onChange({ sellsItems: !node.sellsItems })}>
                          <IconPackage />{" "}
                          {node.sellsItems ? "Desmarcar venda de itens" : "Marcar venda de itens (Lojinha)"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onChange({ active: !node.active })}>
                        {node.active ? <IconEyeOff /> : <IconEye />} {node.active ? "Inativar" : "Reativar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={onRemove}>
                        <IconTrash /> Excluir{row.subtree.length > 1 ? " (com as de baixo)" : ""}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Alternativa ao arrastar (teclado, celular): escolher a rubrica pai; vai para o fim das filhas dela. */
function MoveForm({
  row,
  draft,
  rows,
  onMove,
  onCancel,
}: {
  row: DraftRow;
  draft: Draft;
  rows: DraftRow[];
  onMove: (target: string) => void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState("");
  const options = rows
    .filter(
      (candidate) =>
        candidate.node.key !== row.node.parentKey &&
        dropError(draft, row.node.key, candidate.node.key, "inside") === null,
    )
    .map((candidate) => ({ value: candidate.node.key, label: `${candidate.code} ${candidate.node.name}` }));
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (target) onMove(target);
      }}
    >
      <DialogHeader>
        <DialogTitle>
          Mover {row.code} {row.node.name}
        </DialogTitle>
        <DialogDescription>
          Vai para o fim da rubrica escolhida{row.subtree.length > 1 ? ", com as de baixo" : ""}. Só é gravado ao salvar
          as alterações.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={`category-${row.node.key}-move`}>Para dentro de</Label>
        <OptionCombobox
          id={`category-${row.node.key}-move`}
          value={target}
          onValueChange={setTarget}
          options={options}
          placeholder="Buscar rubrica…"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!target}>
          Mover
        </Button>
      </DialogFooter>
    </form>
  );
}
