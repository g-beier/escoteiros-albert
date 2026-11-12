import { describe, expect, it } from "vitest";
import { describeHistory, snapshotChanges, type AuditRow, type HistoryNames } from "./entry-history";

const names: HistoryNames = {
  accounts: new Map([["acc-a", "A definir"], ["acc-cora", "Cora"]]),
  paymentMethods: new Map([["pix", "PIX"], ["din", "Dinheiro"]]),
  categories: new Map([["cat-1", "2.1 Material"], ["cat-2", "2.2 Transporte"]]),
  associates: new Map([["ass-1", "Ana"]]),
};

const row = (action: string, details: Record<string, unknown>, id = 1): AuditRow =>
  ({ id, created_at: "2026-11-12T12:00:00Z", action, actor_email: "tes@escoteirosalbert.com.br", details });

const base = {
  entry_date: "2026-05-18", name: "Papelaria", account_id: "acc-a", payment_method_id: "pix", document: null,
  document_filed: false, total_cents: -3000, notes: null,
  splits: [{ category_id: "cat-1", amount_cents: -3000, description: "Cartolina", associate_id: null }],
};

describe("snapshotChanges", () => {
  it("lists changed fields with names instead of ids", () => {
    const changes = snapshotChanges(base, { ...base, account_id: "acc-cora", payment_method_id: "din", document_filed: true, notes: "Nota 12" }, names);
    expect(changes).toEqual([
      { label: "Conta", before: "A definir", after: "Cora" },
      { label: "Forma de pagamento", before: "PIX", after: "Dinheiro" },
      { label: "Documentos", before: "Pendente", after: "Arquivado" },
      { label: "Observações", before: "—", after: "Nota 12" },
    ]);
  });

  it("reports removed and added splits, ignoring reordering", () => {
    const two = [
      { category_id: "cat-1", amount_cents: -2000, description: "Cartolina", associate_id: null },
      { category_id: "cat-2", amount_cents: -1000, description: "Ônibus", associate_id: "ass-1" },
    ];
    expect(snapshotChanges({ ...base, splits: two }, { ...base, splits: [...two].reverse() }, names)).toEqual([]);
    expect(snapshotChanges(base, { ...base, splits: two }, names)).toEqual([
      { label: "Rateio removido", before: "2.1 Material · -R$ 30,00 · Cartolina" },
      { label: "Rateio incluído", after: "2.1 Material · -R$ 20,00 · Cartolina" },
      { label: "Rateio incluído", after: "2.2 Transporte · -R$ 10,00 · Ônibus · Ana" },
    ]);
  });
});

describe("describeHistory", () => {
  it("describes creation, account moves and reconciliation", () => {
    const items = describeHistory([
      row("ledger_entry.created", { entry_date: "2026-05-18", name: "Papelaria", account_id: "acc-a", payment_method_id: "pix", total_cents: -3000 }, 1),
      row("ledger_entry.account_changed", { from: "acc-a", to: "acc-cora", reason: "em lote" }, 2),
      row("reconciliation.linked", { statement_line_ids: ["l1"], ledger_entry_ids: ["e1"], amount_cents: -3000 }, 3),
      row("reconciliation.unlinked", { reason: "lançamento alterado (valor ou conta)" }, 4),
      { ...row("ledger_entry.document_filed", { filed: true }, 5), actor_email: null },
    ], names);
    expect(items.map((item) => item.title)).toEqual([
      "Lançamento criado", "Conta alterada em lote", "Conciliado com o extrato", "Conciliação desfeita", "Documento arquivado",
    ]);
    expect(items[0].changes).toContainEqual({ label: "Histórico", after: "Papelaria" });
    expect(items[1].changes).toEqual([{ label: "Conta", before: "A definir", after: "Cora" }]);
    expect(items[3].changes).toEqual([{ label: "Motivo", after: "valor ou conta do lançamento alterados" }]);
    expect(items[4].actor).toBe("Sistema");
  });

  it("describes attachments", () => {
    const [added, removed] = describeHistory([row("ledger_entry.attachment_added", { file_name: "nf.pdf" }), row("ledger_entry.attachment_removed", { file_name: "nf.pdf" }, 2)], names);
    expect(added).toMatchObject({ title: "Comprovante anexado", changes: [{ label: "Arquivo", after: "nf.pdf" }] });
    expect(removed).toMatchObject({ title: "Comprovante removido", changes: [{ label: "Arquivo", before: "nf.pdf" }] });
  });

  it("marks an edit without differences", () => {
    expect(describeHistory([row("ledger_entry.updated", { before: base, after: base })], names)[0].title).toBe("Lançamento salvo sem alterações");
  });
});
