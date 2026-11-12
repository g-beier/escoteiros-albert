# Mensalidades

Grade anual (`/mensalidades?ano=AAAA`) de **março a dezembro** por associado, integrada ao fluxo de caixa.

## Estados de cada caixinha

| Estado | Origem | Visual |
|---|---|---|
| **Pago** | registrado (com vínculo opcional a rateios) | ✓ verde |
| **Atenção** | registrado, com nota (pagou parte, prometeu…) | ! amarelo |
| **Atrasado** | calculado: passou do vencimento sem registro | ✗ vermelho |
| **Sugestão** | calculada: rateio de mensalidade do associado ainda sem caixinha | ✓ tracejado |
| Vazio | mês futuro ou ainda no prazo | — |

Isentos no ano (com motivo) saem da grade, aparecem com "Mostrar isentos" e nunca ficam atrasados.

## Vencimento (Configurações › Mensalidades)

- Até o dia N do mês (1–28), até o N-ésimo dia útil (1–20; segunda a sexta, sem feriados nacionais fixos e móveis) ou até o último dia do mês.
- "Atrasado" a partir do dia seguinte ao vencimento, no fuso de São Paulo. Calculado no app (`lib/fees.ts`), nunca gravado.

## Integração com o fluxo de caixa

- A **rubrica de mensalidade** (padrão: código 1.1, com as de baixo) é configurável. Rateios nela **com associado** viram sugestões: no mês da data do lançamento, se livre e entre março e dezembro; senão, no primeiro mês livre.
- "Confirmar sugestões" grava Pago com o vínculo. Um rateio pode cobrir vários meses (vincule no popover da caixinha) e um mês pode juntar vários rateios.
- Excluir o lançamento desfaz o vínculo; o registro Pago continua.

## Valores recebidos

A tela mostra quanto entrou de mensalidade, sem abrir os lançamentos: **Recebido em AAAA** (total e número de pagamentos), a coluna **Recebido** por associado e a linha **Recebido no mês** no rodapé. Vêm dos rateios da rubrica de mensalidade lançados no ano, pela data do lançamento (um pagamento de vários meses conta uma vez, no mês em que entrou; janeiro e fevereiro aparecem à parte). Respeitam os filtros de seção, busca e isentos (`feeAmounts` em `lib/fees.ts`).

## Banco (`018_fees.sql`)

`fee_settings`, `fee_records` (único por associado/ano/mês), `fee_record_splits` (N:N com `entry_splits`), `fee_exemptions`; visão `fee_split_candidates`. Escrita só por `set_fee_record`, `confirm_fee_suggestions`, `set_fee_exemption`, `set_fee_settings` (auditadas). Teste: `supabase/tests/fees.sql`.

## Início

A coluna **Mensalidades atrasadas** lista quem tem meses atrasados no ano, do maior número para o menor (`overdueRanking`).
