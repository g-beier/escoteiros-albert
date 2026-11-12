# Modelo e vocabulário

Termos usados na interface, no código e na documentação. Quando um termo aparecer em outro lugar com outro sentido, corrija lá.

| Termo | O que é | No banco |
|---|---|---|
| **Conta** | Onde o dinheiro está: conta corrente, poupança, caixa. Cada lançamento pertence a uma conta. | `accounts` |
| **Conta contábil** | Código do plano de contas do sistema contábil de destino (`0.0.0.0.0000`). Sempre escrito por extenso: nunca chame de "conta" só. A rubrica tem uma (várias rubricas podem usar a mesma); a conta pode ter uma, usada como contrapartida. | `categories.ledger_code`, `accounts.ledger_code` (domínio `ledger_code`) |
| **Extrato / linha do extrato** | O que veio do banco num arquivo OFX. É o "fato" do banco e não é editado. | `statement_imports`, `statement_lines` |
| **ID OFX** | O `FITID` da linha do extrato. Não é único (nem combinado com a conta), mas junta a movimentação do banco ao lançamento e aos seus rateios. | `statement_lines.external_id`; nas visões, `external_ids` |
| **Lançamento** | Movimentação registrada no app: data, **histórico** (quem pagou/recebeu, emitente), conta, forma de pagamento, documento e total. | `ledger_entries` (`name` = histórico) |
| **Rateio** | Parte do lançamento numa rubrica, com descrição e associado opcional. O sinal vem da rubrica. | `entry_splits` |
| **Rubrica** | Classificação gerencial do grupo, em árvore pelo código (`1.x` receita, `2.x` despesa). Traduzida para a contabilidade pela conta contábil. | `categories.code` |
| **Conciliação** | Vínculo entre linhas do extrato e lançamentos da mesma conta cujas somas batem (1:1, 1:N, N:1). | `reconciliation_links` |
| **Documentos** | Situação do comprovante: Pendente ou Arquivado (parâmetro de URL `pasta`, por compatibilidade). | `ledger_entries.document_filed` |

## Visões de `/lancamentos`

- **Por lançamento** (`visao` ausente; `visao=extrato` ainda é aceito): um lançamento por linha.
- **Por rubrica** (`visao=rubricas`): um rateio por linha.
- `ofx=<FITID>` filtra pelo ID OFX: o lançamento, seus rateios e os demais lançamentos pagos pela mesma movimentação.

## Fluxo

OFX → linhas do extrato (abertas) → conciliação (vincular a lançamentos existentes ou criar a partir da linha) → lançamento com rateios por rubrica → conta contábil → CSV para a contabilidade.

## Regras de escrita

Toda escrita passa por funções SQL `security definer` que validam o papel (`can_edit_group`) e gravam `audit_events`. Não há políticas de escrita direta em `categories`, `payment_methods`, `accounts` nem nas tabelas de extrato e conciliação. No app, a sessão e o grupo vêm de `lib/session.ts` (`pageSession`, `pageMember`, `memberOrError`, `editorOrError`, `requireEditor`, `requireAdmin`).
