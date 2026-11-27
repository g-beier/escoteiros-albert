"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  IconArrowsExchange,
  IconArrowsJoin,
  IconArrowsSplit,
  IconCategory,
  IconChecks,
  IconChevronDown,
  IconCreditCard,
  IconFolderCheck,
  IconFolderExclamation,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import {
  type MergeData,
  mergeSplitEntries,
  moveEntriesAccount,
  reviewEntries,
  setEntriesFiled,
  setEntriesPaymentMethod,
  setSplitsAssociate,
  setSplitsCategory,
  splitSplitEntries,
} from "@/app/actions";
import { Button } from "@geas/ui/components/button";
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@geas/ui/components/dropdown-menu";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Textarea } from "@geas/ui/components/textarea";
import { OptionCombobox, OptionSelect, type Option } from "@geas/ui/components/option-controls";
import type { CategoryItem } from "@/lib/finance/categories";
import { CategoryPicker } from "./category-picker";
import { useEntrySelection, type SelectedEntry } from "./entry-editor";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
type Dialogs = "conta" | "forma" | "rubrica" | "associado" | "agrupar" | "desagrupar" | null;

/** Barra em lote, acima da lista: contagem, ações e limpar. */
function Bar({
  count,
  children,
  onClear,
  pending,
}: {
  count: string;
  children: ReactNode;
  onClear: () => void;
  pending: boolean;
}) {
  return (
    <section
      aria-label="Ações em lote"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-accent/40 px-3 py-2"
    >
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon-lg"
          variant="ghost"
          onClick={onClear}
          disabled={pending}
          aria-label="Limpar seleção"
          title="Limpar seleção"
        >
          <IconX />
        </Button>
        <p className="m-0 text-sm font-semibold whitespace-nowrap" aria-live="polite">
          {count}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

/** Diálogo de uma ação em lote: um campo, confirmar ou cancelar. */
function BulkDialog({
  open,
  onClose,
  title,
  description,
  confirm,
  disabled,
  pending,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirm: string;
  disabled: boolean;
  pending: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="w-[min(32rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={disabled || pending}>
            {pending ? "Salvando…" : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Movimentações: com lançamentos marcados, mover de conta (conciliados em outra conta perdem o vínculo), trocar a
 * forma de pagamento, marcar documentos arquivados ou pendentes e marcar revisados os do registro rápido.
 */
export function BulkAccountBar({ accounts, paymentMethods }: { accounts: Option[]; paymentMethods: Option[] }) {
  const { canBulk, selected, clearSelection, override } = useEntrySelection();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [accountId, setAccountId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [pending, startTransition] = useTransition();
  if (!canBulk || selected.size === 0) return null;

  const entries = [...selected.entries()];
  const ids = entries.map(([id]) => id);
  const target = accounts.find((account) => account.value === accountId);
  const moving = target ? entries.filter(([, entry]) => entry.accountName !== target.label) : [];
  const unlinking = moving.filter(([, entry]) => entry.reconciled).length;
  const method = paymentMethods.find((option) => option.value === methodId);
  const done = () => {
    setDialog(null);
    clearSelection();
    setAccountId("");
    setMethodId("");
  };

  function move() {
    if (!target) return;
    startTransition(async () => {
      const result = await moveEntriesAccount(ids, target.value);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      for (const [id, entry] of moving)
        override(id, { accountName: target.label, ...(entry.reconciled && { reconciled: false }) });
      const parts = [`${plural(result.moved ?? 0, "lançamento movido", "lançamentos movidos")} para ${target.label}`];
      if (result.unchanged) parts.push(`${plural(result.unchanged, "já estava", "já estavam")} nela`);
      if (result.unlinked) parts.push(`${plural(result.unlinked, "conciliação desfeita", "conciliações desfeitas")}`);
      toast.success(`${parts.join("; ")}.`);
      done();
    });
  }

  function changeMethod() {
    if (!method) return;
    startTransition(async () => {
      const result = await setEntriesPaymentMethod(ids, method.value);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      for (const id of ids) override(id, { paymentMethodName: method.label });
      toast.success(
        result.changed
          ? `Forma de pagamento de ${plural(result.changed, "lançamento", "lançamentos")} trocada para ${method.label}.`
          : `Os selecionados já eram ${method.label}.`,
      );
      done();
    });
  }

  function file(filed: boolean) {
    startTransition(async () => {
      const result = await setEntriesFiled(ids, filed);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      for (const id of ids) override(id, { filed });
      toast.success(
        result.changed
          ? `${plural(result.changed, "lançamento", "lançamentos")} com documentos ${filed ? "arquivados" : "pendentes"}.`
          : "Nada mudou: os selecionados já estavam assim.",
      );
      done();
    });
  }

  function review() {
    startTransition(async () => {
      const result = await reviewEntries(ids);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      for (const id of ids) override(id, { reviewed: true });
      toast.success(
        result.reviewed
          ? `${plural(result.reviewed, "lançamento marcado", "lançamentos marcados")} como revisado.`
          : "Nenhum dos selecionados estava para revisar.",
      );
      done();
    });
  }

  return (
    <Bar
      count={plural(selected.size, "lançamento selecionado", "lançamentos selecionados")}
      onClear={clearSelection}
      pending={pending}
    >
      <Button variant="outline" onClick={() => setDialog("conta")} disabled={pending}>
        <IconArrowsExchange data-icon="inline-start" /> Mover de conta
      </Button>
      <Button variant="outline" onClick={() => setDialog("forma")} disabled={pending}>
        <IconCreditCard data-icon="inline-start" /> Forma de pagamento
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" disabled={pending} />}>
          <IconFolderCheck data-icon="inline-start" /> Documentos <IconChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => file(true)}>
            <IconFolderCheck /> Arquivados na pasta
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => file(false)}>
            <IconFolderExclamation /> Pendentes
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" onClick={review} disabled={pending}>
        <IconChecks data-icon="inline-start" /> Marcar revisados
      </Button>

      <BulkDialog
        open={dialog === "conta"}
        onClose={() => setDialog(null)}
        title={`Mover ${plural(selected.size, "lançamento", "lançamentos")} de conta`}
        pending={pending}
        confirm={unlinking ? `Mover e desfazer ${plural(unlinking, "conciliação", "conciliações")}` : "Mover"}
        disabled={!target}
        onConfirm={move}
        description={
          unlinking ? (
            <>
              {plural(
                unlinking,
                "lançamento selecionado está conciliado",
                "lançamentos selecionados estão conciliados",
              )}{" "}
              com o extrato de outra conta: ao mudar a conta, o vínculo é desfeito e as linhas do extrato voltam a ficar
              abertas na conciliação.
            </>
          ) : (
            "Os lançamentos passam para a conta escolhida; a mudança fica no histórico de cada um."
          )
        }
      >
        <Label htmlFor="bulk-account">Conta</Label>
        <OptionSelect
          id="bulk-account"
          value={accountId}
          onValueChange={setAccountId}
          options={accounts}
          placeholder="Escolha a conta…"
        />
      </BulkDialog>
      <BulkDialog
        open={dialog === "forma"}
        onClose={() => setDialog(null)}
        title={`Forma de pagamento de ${plural(selected.size, "lançamento", "lançamentos")}`}
        pending={pending}
        confirm="Trocar"
        disabled={!method}
        onConfirm={changeMethod}
        description="Muda só a forma de pagamento: a conta e a conciliação continuam como estão."
      >
        <Label htmlFor="bulk-method">Forma de pagamento</Label>
        <OptionSelect
          id="bulk-method"
          value={methodId}
          onValueChange={setMethodId}
          options={paymentMethods}
          placeholder="Escolha a forma…"
        />
      </BulkDialog>
    </Bar>
  );
}

/**
 * Detalhamento: com rateios marcados, trocar a rubrica (o valor continua; a rubrica tem de servir ao tipo, entrada ou
 * saída) ou o associado. Rateios de mensalidade só vão para rubrica de mensalidade e não trocam de associado aqui.
 */
export function BulkSplitBar({
  categories,
  associates,
  accounts,
  paymentMethods,
}: {
  categories: CategoryItem[];
  associates: Option[];
  accounts: Option[];
  paymentMethods: Option[];
}) {
  const { canBulk, selected, clearSelection, override, reloadList } = useEntrySelection();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [categoryId, setCategoryId] = useState("");
  const [associateId, setAssociateId] = useState("");
  const [pending, startTransition] = useTransition();
  if (!canBulk || selected.size === 0) return null;

  const ids = [...selected.keys()];
  const entryCount = new Set([...selected.values()].map((entry) => entry.entryId)).size;
  const amounts = [...selected.values()].map((entry) => entry.amountCents ?? 0);
  const kind = amounts.every((cents) => cents > 0) ? "receita" : amounts.every((cents) => cents < 0) ? "despesa" : null;
  const category = categories.find((item) => item.id === categoryId);
  const done = () => {
    setDialog(null);
    clearSelection();
    setCategoryId("");
    setAssociateId("");
  };
  const count = plural(selected.size, "rateio", "rateios");

  function changeCategory() {
    if (!category) return;
    startTransition(async () => {
      const result = await setSplitsCategory(ids, category.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      for (const id of ids)
        override(id, { category: { name: category.name, code: category.code, kind: category.kind } });
      toast.success(
        result.changed
          ? `Rubrica trocada em ${plural(result.changed, "lançamento", "lançamentos")}.`
          : "Os rateios já estavam nesta rubrica.",
      );
      done();
    });
  }

  function changeAssociate() {
    startTransition(async () => {
      const result = await setSplitsAssociate(ids, associateId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const name = associates.find((option) => option.value === associateId)?.label ?? null;
      for (const id of ids) override(id, { associateName: name });
      toast.success(
        result.changed
          ? `${name ? `Associado ${name}` : "Associado retirado"} em ${plural(result.changed, "lançamento", "lançamentos")}.`
          : "Nada mudou: os rateios já estavam assim.",
      );
      done();
    });
  }

  function merge(data: MergeData) {
    startTransition(async () => {
      const result = await mergeSplitEntries(ids, data);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${plural(entryCount, "lançamento agrupado", "lançamentos agrupados")} em um só.`);
      setDialog(null);
      clearSelection();
      reloadList();
    });
  }

  function split() {
    startTransition(async () => {
      const result = await splitSplitEntries(ids);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${plural(result.changed ?? 0, "lançamento novo", "lançamentos novos")}, um por rateio.`);
      setDialog(null);
      clearSelection();
      reloadList();
    });
  }

  return (
    <Bar
      count={plural(selected.size, "rateio selecionado", "rateios selecionados")}
      onClear={clearSelection}
      pending={pending}
    >
      <Button variant="outline" onClick={() => setDialog("rubrica")} disabled={pending}>
        <IconCategory data-icon="inline-start" /> Trocar rubrica
      </Button>
      <Button variant="outline" onClick={() => setDialog("associado")} disabled={pending}>
        <IconUser data-icon="inline-start" /> Associado
      </Button>
      <Button
        variant="outline"
        onClick={() => setDialog("agrupar")}
        disabled={pending || entryCount < 2}
        title={entryCount < 2 ? "Marque rateios de pelo menos dois lançamentos" : undefined}
      >
        <IconArrowsJoin data-icon="inline-start" /> Agrupar
      </Button>
      <Button variant="outline" onClick={() => setDialog("desagrupar")} disabled={pending}>
        <IconArrowsSplit data-icon="inline-start" /> Desagrupar
      </Button>

      {dialog === "agrupar" && (
        <MergeDialog
          onClose={() => setDialog(null)}
          pending={pending}
          onConfirm={merge}
          splits={[...selected.values()]}
          accounts={accounts}
          paymentMethods={paymentMethods}
        />
      )}
      <BulkDialog
        open={dialog === "desagrupar"}
        onClose={() => setDialog(null)}
        title={`Desagrupar ${count}`}
        pending={pending}
        confirm="Desagrupar"
        disabled={false}
        onConfirm={split}
        description={
          <>
            Cada rateio marcado vira um lançamento próprio, com a data, o histórico, a conta, a forma e o documento do
            lançamento de origem. Se todos os rateios de um lançamento forem marcados, o primeiro fica no original.
            Lançamento conciliado não muda.
          </>
        }
      >
        <p className="m-0 text-sm text-muted-foreground">Para juntar de novo, marque os rateios e use Agrupar.</p>
      </BulkDialog>

      <BulkDialog
        open={dialog === "rubrica"}
        onClose={() => setDialog(null)}
        title={`Rubrica de ${count}`}
        pending={pending}
        confirm="Trocar rubrica"
        disabled={!category}
        onConfirm={changeCategory}
        description={
          kind
            ? `Só rateios de ${kind === "receita" ? "entrada" : "saída"} selecionados: escolha uma rubrica de ${kind}. O valor de cada rateio continua o mesmo.`
            : "Há rateios de entrada e de saída na seleção: uma rubrica de receita ou de despesa não serve aos dois. Selecione só um tipo."
        }
      >
        <Label htmlFor="bulk-category">Rubrica</Label>
        <CategoryPicker
          id="bulk-category"
          value={categoryId}
          onChange={setCategoryId}
          categories={categories}
          preferredKind={kind}
          usedIds={[]}
          disabled={!kind}
          placeholder="Buscar rubrica…"
        />
      </BulkDialog>
      <BulkDialog
        open={dialog === "associado"}
        onClose={() => setDialog(null)}
        title={`Associado de ${count}`}
        pending={pending}
        confirm={associateId ? "Definir associado" : "Tirar o associado"}
        disabled={false}
        onConfirm={changeAssociate}
        description="Deixe vazio para tirar o associado dos rateios. Rateios de mensalidade e lançamentos que pagam dívida não mudam aqui (use Mensalidades ou o próprio lançamento)."
      >
        <Label htmlFor="bulk-associate">Associado</Label>
        <OptionCombobox
          id="bulk-associate"
          value={associateId}
          onValueChange={setAssociateId}
          options={associates}
          placeholder="Buscar associado… (vazio = nenhum)"
          emptyText="Nenhum associado encontrado."
        />
      </BulkDialog>
    </Bar>
  );
}

type EntryChoice = {
  id: string;
  date: string;
  name: string;
  account: string;
  method: string;
  document: string;
  filed: boolean;
};

/**
 * Agrupar: os dados do lançamento que resulta são preenchidos aqui (nada é escolhido sozinho). O formulário começa com
 * os dados do lançamento do primeiro rateio marcado; "Copiar dados de" troca para os de outro lançamento envolvido.
 */
function MergeDialog({
  splits,
  accounts,
  paymentMethods,
  pending,
  onClose,
  onConfirm,
}: {
  splits: SelectedEntry[];
  accounts: Option[];
  paymentMethods: Option[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (data: MergeData) => void;
}) {
  const choices: EntryChoice[] = [];
  for (const split of splits) {
    if (!split.entryId || choices.some((choice) => choice.id === split.entryId)) continue;
    choices.push({
      id: split.entryId,
      date: split.entryDate ?? "",
      name: split.entryName ?? "",
      account: split.accountName ?? "",
      method: split.paymentMethodName ?? "",
      document: split.document ?? "",
      filed: Boolean(split.filed),
    });
  }
  const idOf = (options: Option[], label: string) => options.find((option) => option.label === label)?.value ?? "";
  const fromChoice = (choice: EntryChoice | undefined): MergeData => ({
    date: choice?.date ?? "",
    name: choice?.name ?? "",
    accountId: idOf(accounts, choice?.account ?? ""),
    paymentMethodId: idOf(paymentMethods, choice?.method ?? ""),
    document: choice?.document ?? "",
    filed: choice?.filed ?? false,
    notes: "",
  });
  const [source, setSource] = useState(choices[0]?.id ?? "");
  const [data, setData] = useState<MergeData>(() => fromChoice(choices[0]));
  const set = (patch: Partial<MergeData>) => setData((current) => ({ ...current, ...patch }));
  const total = splits.reduce((sum, split) => sum + (split.amountCents ?? 0), 0);
  const ready = data.date && data.name.trim().length >= 2 && data.accountId && data.paymentMethodId;
  const label = (choice: EntryChoice) =>
    `${choice.date.split("-").reverse().join("/")} · ${choice.name} · ${choice.account}`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[min(40rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>Agrupar {plural(choices.length, "lançamento", "lançamentos")} em um só</DialogTitle>
          <DialogDescription>
            Os rateios destes lançamentos passam a ser de um lançamento só (
            {plural(splits.length, "rateio marcado", "rateios marcados")}; os demais rateios dos mesmos lançamentos vão
            junto). Preencha os dados do lançamento que resulta. Lançamentos conciliados não agrupam.
          </DialogDescription>
        </DialogHeader>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="merge-source">Copiar dados de</Label>
            <OptionSelect
              id="merge-source"
              value={source}
              onValueChange={(id) => {
                setSource(id);
                setData((current) => ({ ...fromChoice(choices.find((c) => c.id === id)), notes: current.notes }));
              }}
              options={choices.map((choice) => ({ value: choice.id, label: label(choice) }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="merge-date">Data</Label>
            <Input
              id="merge-date"
              type="date"
              value={data.date}
              onChange={(e) => set({ date: e.target.value })}
              className="num"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="merge-total">Total (soma dos rateios)</Label>
            <Input
              id="merge-total"
              value={(total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              readOnly
              className="num"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="merge-name">Histórico</Label>
            <Input id="merge-name" value={data.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="merge-account">Conta</Label>
            <OptionSelect
              id="merge-account"
              value={data.accountId}
              onValueChange={(accountId) => set({ accountId })}
              options={accounts}
              placeholder="Escolha a conta…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="merge-method">Forma de pagamento</Label>
            <OptionSelect
              id="merge-method"
              value={data.paymentMethodId}
              onValueChange={(paymentMethodId) => set({ paymentMethodId })}
              options={paymentMethods}
              placeholder="Escolha a forma…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="merge-document">Documento</Label>
            <Input
              id="merge-document"
              value={data.document}
              maxLength={60}
              onChange={(e) => set({ document: e.target.value })}
            />
          </div>
          <Label htmlFor="merge-filed" className="gap-2 self-end pb-2 font-normal">
            <Checkbox id="merge-filed" checked={data.filed} onCheckedChange={(on) => set({ filed: on === true })} />{" "}
            Documentos arquivados na pasta
          </Label>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="merge-notes">Observações</Label>
            <Textarea
              id="merge-notes"
              value={data.notes}
              maxLength={2000}
              rows={2}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(data)} disabled={!ready || pending}>
            {pending ? "Agrupando…" : "Agrupar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
