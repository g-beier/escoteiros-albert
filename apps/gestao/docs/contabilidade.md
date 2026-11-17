# Exportação para a contabilidade

## Conta contábil

- Cada **rubrica** recebe, em `/configuracoes`, a **conta contábil** do plano de contas do sistema de destino, no formato `0.0.0.0.0000`. Várias rubricas podem apontar para a mesma conta contábil.
- Cada **conta** (banco, caixa) pode receber a conta contábil de contrapartida (por exemplo, "Bancos – Cora" no plano). Sem ela, a contrapartida sai em branco e a contabilidade completa.
- A máscara está em dois lugares, que mudam juntos: o domínio `public.ledger_code` (`014_accounting.sql`) e `lib/ledger-code.ts`.
- Em `/configuracoes`, rubricas usadas e sem conta contábil aparecem com um alerta; o filtro "Só sem conta contábil" lista as que faltam.

## Arquivo (`Exportar → Contabilidade (CSV)`, rota `/exportar/contabil`)

Partida dobrada, **uma linha por rateio**, período com limites inclusivos e, opcionalmente, uma conta.

| Coluna | Conteúdo |
|---|---|
| Data | `dd/mm/aaaa` |
| Conta débito | entrada: conta contábil da conta; saída: conta contábil da rubrica |
| Conta crédito | o inverso |
| Valor | sempre positivo, vírgula decimal, sem separador de milhar (`1234,56`) |
| Histórico | `Histórico do lançamento — descrição do rateio`, até 200 caracteres, sem `;`, aspas ou quebras de linha |
| Documento | documento do lançamento |
| ID OFX | FITID da movimentação; agrupa os rateios de uma mesma movimentação (lote) |
| Rubrica | código e nome, para conferência |
| Conta | nome da conta |

- Separador `;`, quebra de linha CRLF, cabeçalho na primeira linha.
- Codificação: **Windows-1252** (padrão; esperado pela maioria dos importadores) ou UTF-8 com BOM.
- O sinal de cada rateio decide débito/crédito; lançamentos com rubricas de receita e despesa misturadas saem corretos.
- Se alguma rubrica usada no período não tem conta contábil, a exportação é recusada e lista as rubricas. Não sai arquivo incompleto.

## Sistemas contábeis

Domínio (Thomson Reuters), Alterdata, Questor, Fortes e Nasajon importam lançamentos por **leiaute delimitado configurável**, com data, conta débito, conta crédito, valor e histórico. O arquivo acima é esse denominador comum: o contador mapeia as colunas uma vez no leiaute do sistema dele. O Contmatic usa TXT posicional e fica fora do escopo por enquanto.

### A confirmar com o contador

- O sistema usa o **código estruturado** (`0.0.0.0.0000`) ou o **código reduzido** da conta? Se for o reduzido, ele entra como um segundo campo na rubrica.
- Aceita **lançamento múltiplo** (um débito contra vários créditos, com o ID OFX como lote) ou só lançamentos simples (o formato atual)?
- Exige **código de histórico padrão**? Se sim, entra uma coluna fixa ou por rubrica.
- Quais contas de contrapartida usar para cada conta bancária e para o caixa.

## Fluxo de caixa em CSV

`Exportar → Fluxo de caixa` também gera CSV (UTF-8 com BOM) com as mesmas colunas da planilha, inclusive ID OFX e conta contábil na visão Detalhamento. As colunas ficam em `lib/export/columns.ts` e servem aos dois formatos.
