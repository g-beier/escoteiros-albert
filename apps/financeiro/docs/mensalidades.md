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

No rodapé, **Alertas** mostra por mês quantos estão atrasados, não pagos ou em atenção; passar o mouse ou focar a célula abre o detalhe do mês (só os estados que ocorrem) e o recebido no mês, que não tem mais linha própria. No desktop a grade ocupa a tela e só as linhas rolam, com cabeçalho e rodapé fixos.

No popover da caixinha, escolher Pago, Atenção ou Não pago grava e mantém o popover aberto; a partir daí a observação é gravada sozinha 400 ms depois da última tecla (ou ao fechar) e marcar/desmarcar um rateio grava na hora.

O filtro **Só com atrasos** (`?atrasados=1`, também no link do Início) mostra apenas quem deve. Isentos no ano (com motivo) saem da grade, aparecem com "Mostrar isentos" e nunca ficam atrasados.

## Vencimento (Configurações › Mensalidades)

- Até o dia N do mês (1–28), até o N-ésimo dia útil (1–20; segunda a sexta, sem feriados nacionais fixos e móveis) ou até o último dia do mês.
- "Atrasado" a partir do dia seguinte ao vencimento, no fuso de São Paulo. Calculado no app (`lib/fees.ts`), nunca gravado.

## Valores do ano (Configurações › Mensalidades)

- **Mensalidade** por ano (ex.: R$ 60,00) e **desconto percentual** para quem paga os 10 meses de uma vez **até a data-limite** (`019_fee_prices.sql`, `fee_year_settings`).
- **Previsto × recebido**: previsto = 10 mensalidades (ou o integral com desconto, para quem pagou assim); **em aberto** = previsto − recebido, por associado e no total. Isentos não têm previsto.

## Integração com o fluxo de caixa

- A **rubrica de mensalidade** (padrão: código 1.1, com as de baixo) é configurável. Rateios nela **com associado** viram sugestões: no mês da data do lançamento, se livre e entre março e dezembro; senão, no primeiro mês livre.
- Com o valor do ano configurado, a sugestão confere o valor: pagamento **integral** (cheio, ou com desconto lançado até a data-limite) sugere os 10 meses; um múltiplo da mensalidade sugere vários meses seguidos; o que sobra (ou um valor menor que a mensalidade) vira **Atenção** com a nota "pagou R$ 30,00 de R$ 60,00" (✓/! tracejados).
- "Confirmar sugestões" grava Pago (ou Atenção, com a nota) com o vínculo. Um rateio pode cobrir vários meses (vincule no popover da caixinha) e um mês pode juntar vários rateios.
- Excluir o lançamento desfaz o vínculo; o registro Pago continua.

## Valores recebidos

A tela mostra quanto entrou de mensalidade, sem abrir os lançamentos: **Recebido em AAAA** (total e número de pagamentos), a coluna **Recebido** por associado e o recebido de cada mês no tooltip da linha **Alertas**. Vêm dos rateios da rubrica de mensalidade lançados no ano, pela data do lançamento (um pagamento de vários meses conta uma vez, no mês em que entrou; janeiro e fevereiro aparecem à parte). Respeitam os filtros de seção, busca e isentos (`feeAmounts` em `lib/fees.ts`).

## Banco (`018_fees.sql`)

`fee_settings`, `fee_records` (único por associado/ano/mês), `fee_record_splits` (N:N com `entry_splits`), `fee_exemptions`; visão `fee_split_candidates`. Escrita só por `set_fee_record`, `confirm_fee_suggestions`, `set_fee_exemption`, `set_fee_settings` (auditadas). Teste: `supabase/tests/fees.sql`.

## Início

A coluna **Mensalidades atrasadas** lista quem tem meses atrasados no ano, do maior número para o menor (`overdueRanking`).
