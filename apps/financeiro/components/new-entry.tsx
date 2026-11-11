"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createEntry } from "@/app/actions";
import { money } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";

type Category = { id: string; name: string };
type Split = { categoryId: string; amount: string };

export function NewEntry({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [total, setTotal] = useState("");
  const [splits, setSplits] = useState<Split[]>([{ categoryId: categories[0]?.id ?? "", amount: "" }]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const splitCents = useMemo(() => splits.reduce((sum, item) => sum + (parseMoneyToCents(item.amount) ?? 0), 0), [splits]);
  const totalCents = parseMoneyToCents(total) ?? 0;
  const balanced = totalCents !== 0 && splitCents === totalCents;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const firstInput = dialog?.querySelector<HTMLElement>("input, select, button");
    firstInput?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); triggerRef.current?.focus(); };
  }, [open]);

  function updateSplit(index: number, patch: Partial<Split>) {
    setSplits((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createEntry({
        date: formData.get("date"),
        description: formData.get("description"),
        document: formData.get("document"),
        totalCents,
        splits: splits.map((item) => ({ categoryId: item.categoryId, amountCents: parseMoneyToCents(item.amount) ?? 0 })),
      });
      if (result.error) setError(result.error);
      else { setOpen(false); setTotal(""); setSplits([{ categoryId: categories[0]?.id ?? "", amount: "" }]); }
    });
  }

  return <>
    <button ref={triggerRef} className="button" onClick={() => setOpen(true)}><span aria-hidden="true">＋</span> Novo lançamento</button>
    {open && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="new-entry-title" aria-describedby="new-entry-description">
        <header className="modal-head"><div><span className="eyebrow">Movimentação</span><h2 id="new-entry-title" style={{ margin: "4px 0 0" }}>Novo lançamento</h2></div><button className="link-button" onClick={() => setOpen(false)} aria-label="Fechar">✕</button></header>
        <form action={submit} className="modal-body form">
          <p id="new-entry-description" className="sr-only">Informe os dados do extrato e distribua o valor total entre uma ou mais rubricas.</p>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="grid-2">
            <div className="field"><label htmlFor="date">Data</label><input className="input" id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></div>
            <div className="field"><label htmlFor="total">Valor total (R$)</label><input className="input" id="total" inputMode="decimal" placeholder="0,00" value={total} onChange={(e) => setTotal(e.target.value)} required /></div>
          </div>
          <div className="field"><label htmlFor="description">Descrição do extrato</label><input className="input" id="description" name="description" maxLength={200} placeholder="Ex.: Compra de materiais para atividade" required /></div>
          <div className="field"><label htmlFor="document">Documento / referência (opcional)</label><input className="input" id="document" name="document" maxLength={60} placeholder="NF 1234" /></div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><strong>Rateio por rubricas</strong><button type="button" className="link-button" style={{ color: "var(--green)", fontWeight: 750 }} onClick={() => setSplits((s) => [...s, { categoryId: categories[0]?.id ?? "", amount: "" }])}><span aria-hidden="true">＋</span> Adicionar rubrica</button></div>
            {splits.map((split, index) => <div className="split-row" key={index}>
              <div className="field"><label htmlFor={`category-${index}`}>Rubrica {index + 1}</label><select id={`category-${index}`} className="input" value={split.categoryId} onChange={(e) => updateSplit(index, { categoryId: e.target.value })} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="field"><label htmlFor={`amount-${index}`}>Valor {index + 1} (R$)</label><input id={`amount-${index}`} className="input" inputMode="decimal" placeholder="0,00" value={split.amount} onChange={(e) => updateSplit(index, { amount: e.target.value })} required /></div>
              <button type="button" className="button danger" aria-label="Remover rubrica" disabled={splits.length === 1} onClick={() => setSplits((s) => s.filter((_, i) => i !== index))}>✕</button>
            </div>)}
            <div className="split-total"><span>Soma do rateio: <strong>{money(splitCents / 100)}</strong></span><span role="status" aria-live="polite" className={balanced ? "valid" : "invalid"}>{balanced ? "✓ Valores conferem" : `Diferença: ${money((totalCents - splitCents) / 100)}`}</span></div>
          </div>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="button" disabled={!balanced || pending} aria-describedby={!balanced ? "balance-help" : undefined}>{pending ? "Salvando…" : "Salvar lançamento"}</button></div>
          {!balanced && <span id="balance-help" className="sr-only">O lançamento só pode ser salvo quando a soma das rubricas for igual ao valor total.</span>}
        </form>
      </section>
    </div>}
  </>;
}
