# Plano: contas bancárias, importação de extrato e conciliação

Status: **proposta para revisão** (2026-11-11). Nada disto está implementado.

## Objetivo

Hoje cada lançamento é digitado à mão. Queremos:

1. Saber **de qual conta** (banco ou caixa) cada lançamento saiu ou entrou.
2. **Importar o extrato** do banco (CSV) e transformar linhas em lançamentos.
3. **Conciliar**: ligar cada linha do extrato a um ou mais lançamentos e ir "baixando" o que sobra dos dois lados, até a conta fechar com o saldo do banco.

## Conceitos

| Termo | O que é |
|---|---|
| **Conta** | Onde o dinheiro está: conta corrente, poupança, caixa (dinheiro em espécie), maquininha. Tem saldo inicial e data de início. |
| **Forma de pagamento** | Como o dinheiro se moveu (PIX, boleto, cartão, dinheiro). Ganha uma **conta padrão** (ex.: PIX → Conta corrente; Dinheiro → Caixa). |
| **Linha do extrato** | Uma linha importada do banco: data, histórico, documento, valor. É o "fato" do banco e não é editada. |
| **Lançamento** | O que já existe: data, nome, forma, total, rateio por rubricas. Passa a ter `conta`. |
| **Conciliação** | Vínculo entre linhas do extrato e lançamentos da mesma conta cujas somas batem. |

## Modelo de dados (proposta)

- `accounts`: `id, group_id, name, kind (corrente | poupanca | caixa | outro), bank, branch, number, opening_balance_cents, opening_date, active`.
- `payment_methods.default_account_id` → `accounts` (opcional).
- `ledger_entries.account_id` → `accounts` (obrigatório depois da migração; os lançamentos atuais recebem a conta padrão da forma ou uma conta "A definir").
- `statement_imports`: `id, account_id, file_name, imported_by, imported_at, period_from, period_to, line_count`.
- `statement_lines`: `id, account_id, import_id, line_date, description (histórico), document, amount_cents, balance_cents?, fingerprint (único por conta), status (aberta | conciliada | ignorada), ignored_reason`.
- `reconciliation_links`: `statement_line_id, ledger_entry_id, amount_cents`. Aceita 1:1, 1:N (uma transferência paga várias coisas) e N:1 (um lançamento pago em parcelas). A soma dos vínculos de cada lado tem que bater com o valor dele para ficar "conciliado".
- Tudo com RLS por grupo, escrita por funções SQL com auditoria, como hoje.

## Importação de CSV

1. Escolher a **conta** e enviar o arquivo.
2. **Mapeamento de colunas** com pré-visualização: data, histórico, documento, valor (ou crédito/débito separados), saldo. Também separador, formato de data, separador decimal e codificação (Latin-1 é comum nos bancos).
3. O mapeamento fica salvo como **perfil do banco** e é reaproveitado no próximo arquivo.
4. **Duplicatas**: a impressão digital `conta + data + valor + histórico + nº de ocorrência no dia` evita reimportar linhas quando os períodos se sobrepõem.
5. As linhas entram como **abertas**. Nada vira lançamento sem confirmação.

Depois do CSV, considerar OFX, que é padronizado e dispensa mapeamento.

## Tela de conciliação (`/conciliacao`)

Por conta e mês, em duas colunas:

- **Extrato** (linhas abertas) | **Lançamentos** sem vínculo da mesma conta.
- **Sugestões automáticas**: mesmo valor e data a até 3 dias, com o nome parecido pesando a favor. Um clique aceita.
- Ações sobre uma linha do extrato:
  - **Vincular** a lançamento(s) existente(s).
  - **Criar lançamento** a partir da linha: já preenche data, nome = histórico, valor, conta e forma provável; falta só o rateio por rubricas.
  - **Ignorar**, com motivo: transferência entre contas próprias, estorno que se anula, linha duplicada.
- Ações sobre um lançamento **sobressalente**, sem linha no extrato:
  - corrigir a conta (ex.: foi em dinheiro → Caixa);
  - marcar como **fora do extrato** (ex.: lançamentos do caixa);
  - deixar aberto para investigar.
- Rodapé: saldo inicial + movimentos conciliados = saldo do extrato? Mostrar a diferença do mês.
- Lista e dashboard passam a mostrar a coluna/filtro **Conta** e o status **Conciliado**.

## Fases

1. **Contas**: cadastro, conta padrão por forma de pagamento, conta no lançamento (com migração dos dados atuais), filtro e coluna Conta.
2. **Importação CSV**: upload, mapeamento, perfis por banco, deduplicação, lista de linhas importadas.
3. **Conciliação manual**: vincular, criar lançamento a partir da linha, ignorar, sobressalentes, fechamento do mês.
4. **Sugestões automáticas** e conciliação em lote.
5. **OFX** e transferências entre contas (um movimento que sai de uma conta e entra em outra sem virar receita ou despesa).

## Perguntas em aberto

- Quais bancos e contas o grupo usa? Precisamos de um **CSV de exemplo de cada banco**, com dados reais ou anonimizados.
- O dinheiro em espécie (caixa) entra como conta conciliável, ou só como conta sem extrato?
- Transferência entre contas próprias: tratar já na fase 1 ou deixar para a fase 5?
- Ao criar um lançamento a partir de uma linha do extrato, o "Nome do lançamento" deve ser o histórico do banco? Isso conversa com a revisão do nome do campo (ver BACKLOG).
- Quem pode importar e conciliar: só tesouraria/administração, como na edição de lançamentos?
