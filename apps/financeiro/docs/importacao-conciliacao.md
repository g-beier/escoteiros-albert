# Plano: contas bancárias, importação de extrato e conciliação

Status: fases 1 a 3 implementadas (2026-11-11): contas (`011`), importação no banco (`012`) e conciliação (`013`, `/conciliacao`). Vínculo N:M ainda é recusado.

**Atualização (2026-11-11, `014`): a importação passou a ser só OFX.** A interface não aceita mais CSV; o código CSV (`lib/statement-import/csv.ts`, `apply.ts`, `components/import/csv-profile-builder.tsx`) fica no repositório, sem uso, caso volte a ser necessário. Ver a seção [Importação OFX](#importação-ofx-desde-014) e o glossário em [`modelo.md`](modelo.md). As seções sobre perfis CSV abaixo descrevem o desenho original.

## Objetivo

Hoje cada lançamento é digitado à mão. Queremos:

1. Saber **de qual conta** (banco ou caixa) cada lançamento saiu ou entrou.
2. **Importar o extrato** do banco (CSV ou OFX) e transformar linhas em lançamentos.
3. **Conciliar**: ligar cada linha do extrato a um ou mais lançamentos e ir "baixando" o que sobra dos dois lados, até a conta fechar com o saldo do banco.

## Conceitos

| Termo | O que é |
|---|---|
| **Conta** | Onde o dinheiro está: conta corrente, poupança, caixa (dinheiro em espécie), maquininha. Tem saldo inicial e data de início. |
| **Forma de pagamento** | Como o dinheiro se moveu (PIX, boleto, cartão, dinheiro). Ganha uma **conta padrão** (ex.: PIX → Conta corrente; Dinheiro → Caixa). |
| **Perfil de importação** | Template, montado pelo usuário, que diz como ler o arquivo de um banco: linha do cabeçalho, separador, formatos e o papel de cada coluna. Vale para o grupo inteiro; serve de pré-preenchimento e pode ser ajustado em qualquer importação, e o ajuste atualiza o perfil salvo. |
| **Linha do extrato** | Uma linha importada do banco: data, histórico, contraparte, valor, ID do banco. É o "fato" do banco e não é editada. |
| **Lançamento** | O que já existe: data, nome, forma, total, rateio por rubricas. Passa a ter `conta`. |
| **Conciliação** | Vínculo entre linhas do extrato e lançamentos da mesma conta cujas somas batem. |

## Formatos observados (amostras de 2026-11)

Cada banco exporta um CSV diferente; nem o OFX é uniforme. Por isso a importação é guiada por **perfis montados pelo usuário**, e não por um parser fixo por banco.

| | Mercado Pago (CSV) | Cora (CSV) | OFX (Nubank, Itaú) |
|---|---|---|---|
| Codificação | UTF-8 | UTF-8 | UTF-8, mesmo quando o header declara `USASCII`/`1252` (Itaú) — o header não é confiável |
| Estrutura | Bloco de resumo (saldo inicial, créditos, débitos, saldo final), linha em branco, depois a tabela | Tabela direta | SGML 1.02, com tags fechadas (Nubank) ou sem fechamento (Itaú) |
| Separador / decimal | `;` / `1.234,56` | `,` / `1234.56` (às vezes sem casas: `-150`) | — / `1234.56` |
| Data | `DD-MM-AAAA` | `DD/MM/AAAA` | `AAAAMMDDhhmmss[-3:BRT]` |
| Sinal | Valor com sinal | Valor com sinal + coluna redundante `DÉBITO`/`CRÉDITO` | `TRNAMT` com sinal + `TRNTYPE` |
| Tipo e contraparte | Na mesma coluna: `Pix recebido FULANO`, `Pagamento de conta X` | Colunas separadas: `Transação`, `Identificação` | No `MEMO`: rico no Nubank (`Tipo - Nome - CPF/CNPJ - Banco`), truncado no Itaú (`PIX TRANSF MARCIA 14 08`) |
| ID do banco | `REFERENCE_ID`, único | Não tem | `FITID`: UUID no Nubank; no Itaú é `data + sequência do dia`, pode mudar entre exportações |
| Saldo | Por linha + inicial/final no resumo | Não tem | Só final (`LEDGERBAL`); o Itaú às vezes inclui pseudo-transações `SALDO ANTERIOR` e `SALDO TOTAL DISPONÍVEL DIA`, que **não** são movimentos |

Consequências:

- O perfil precisa saber **pular linhas antes do cabeçalho**, aceitar **valor com sinal, colunas crédito/débito ou valor + natureza**, **juntar colunas** na descrição e **separar tipo e contraparte** quando vêm juntos.
- Precisa também de uma lista de **linhas a ignorar** (pseudo-linhas de saldo aparecem em CSV e em OFX).
- O ID do banco ajuda a deduplicar, mas não é sempre estável: o dedup combina ID com data e valor, e usa impressão digital quando não há ID.
- As amostras usadas contêm dados reais de pessoas; fixtures de teste no repositório devem ser **anonimizadas**.

## Modelo de dados (proposta)

- `accounts`: `id, group_id, name, kind (corrente | poupanca | caixa | outro), bank, branch, number, opening_balance_cents, opening_date, active`.
- `payment_methods.default_account_id` → `accounts` (opcional).
- `ledger_entries.account_id` → `accounts` (obrigatório depois da migração; os lançamentos atuais recebem a conta padrão da forma ou uma conta "A definir").
- `import_profiles`: `id, group_id, name (ex.: "Cora CSV"), format (csv | ofx), header_signature, settings jsonb, created_by, updated_by, updated_at`. Um por banco/formato, compartilhado pelo grupo inteiro (não é ligado a uma conta). Alterações são auditadas.
- `statement_imports`: `id, account_id, profile_id, profile_settings jsonb (cópia do perfil usado), file_name, imported_by, imported_at, period_from, period_to, line_count, opening_balance_cents?, closing_balance_cents?`. A cópia garante que se saiba como uma importação antiga foi lida mesmo depois de o perfil mudar.
- `statement_lines`: `id, account_id, import_id, line_date, description (texto original), kind? (ex.: "Pix recebido"), counterparty?, external_id?, amount_cents, balance_cents?, fingerprint, status (aberta | conciliada | ignorada), ignored_reason`.
  - Únicos por conta: `fingerprint`; e `(external_id, line_date, amount_cents)` quando houver ID.
- `reconciliation_links`: `statement_line_id, ledger_entry_id, amount_cents`. Aceita 1:1, 1:N (uma transferência paga várias coisas) e N:1 (um lançamento pago em parcelas). A soma dos vínculos de cada lado tem que bater com o valor dele para ficar "conciliado".
- `reconciliation_rejections`: `statement_line_id, ledger_entry_id, rejected_by, rejected_at`. Sugestões recusadas, para não sugerir o mesmo par de novo.
- Tudo com RLS por grupo, escrita por funções SQL com auditoria, como hoje.

## Importação

### Perfil de importação (montado pelo usuário)

Cada banco/formato ganha um perfil construído **manualmente uma vez**, na primeira importação daquele arquivo, e salvo para as próximas. Não há parsers fixos por banco no código.

O perfil é do **grupo** e funciona como **template**: pré-preenche a montagem, mas tudo continua editável em cada importação. Se o usuário muda algo e importa, o perfil salvo é **atualizado** com a nova versão (o banco mudou o arquivo, um papel de coluna estava errado etc.). Também pode ser editado fora da importação, numa lista de perfis.

Conteúdo do perfil (`settings`):

```jsonc
{
  "encoding": "utf-8",            // ou "latin1"
  "delimiter": ";",
  "headerRow": 4,                 // linhas antes são ignoradas (ex.: resumo do Mercado Pago)
  "dateFormat": "DD-MM-YYYY",
  "decimal": "comma",             // "comma" = 1.234,56 | "dot" = 1234.56
  "columns": {
    "date": "RELEASE_DATE",
    "amount": "TRANSACTION_NET_AMOUNT",       // ou "credit" + "debit"
    "nature": null,                            // coluna C/D quando o valor vem sempre positivo
    "debitValues": [],                         // textos que indicam saída, ex.: ["DÉBITO", "D"]
    "description": ["TRANSACTION_TYPE"],      // uma ou mais colunas, concatenadas
    "counterparty": null,                      // coluna própria (ex.: "Identificação" no Cora)
    "externalId": "REFERENCE_ID",
    "balance": "PARTIAL_BALANCE"
  },
  "kindPrefixes": ["Pix recebido", "Pix enviado", "Pagamento com Pix", "Pagamento de conta"],
  "ignoreIf": ["SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL DIA"]
}
```

`header_signature` é a lista normalizada dos nomes das colunas (para OFX, `ORG`/`BANKID`). Serve para reconhecer o arquivo e aplicar o perfil sozinho.

### Fluxo

1. **Escolher a conta e enviar o arquivo.** CSV ou OFX.
2. **Reconhecer o perfil.** Se a assinatura do cabeçalho bate com um perfil salvo, ele pré-preenche a montagem (passo 3) já com a pré-visualização aplicada; o usuário confere e segue, ou ajusta. Também pode escolher outro perfil ou começar um novo.
3. **Montar o perfil** (primeira vez):
   - **Leitura do arquivo**, com sugestões automáticas que o usuário corrige: codificação (UTF-8, senão Latin-1), separador (o que dá número de colunas mais constante), linha do cabeçalho (primeira linha a partir da qual o número de colunas estabiliza), formato de data e separador decimal (inferidos das amostras).
   - **Grade de pré-visualização** com as primeiras linhas e, sobre cada coluna, um seletor de papel:

     | Papel | Obrigatório | Observação |
     |---|---|---|
     | Data | sim | |
     | Valor | sim* | com sinal |
     | Crédito / Débito | sim* | duas colunas, alternativa a Valor |
     | Natureza (C/D) | — | dá o sinal quando o valor vem sempre positivo; o usuário informa qual texto significa saída |
     | Descrição | sim | pode marcar várias colunas, que são concatenadas |
     | Contraparte | — | coluna própria |
     | ID do banco | — | ajuda no dedup |
     | Saldo | — | permite validar a sequência |
     | Ignorar | — | padrão |

     \* Valor **ou** Crédito/Débito.
   - **Separar tipo e contraparte** (opcional), quando vêm na mesma coluna: o sistema sugere os prefixos que mais se repetem no início da descrição (`Pix recebido`, `Pix enviado`…), o usuário marca os válidos; o prefixo vira o tipo e o restante, a contraparte. Sem regex na interface.
   - **Linhas a ignorar**: textos que, se aparecem na descrição, descartam a linha (pseudo-linhas de saldo).
   - Para OFX não há grade (os campos já têm nome); só tipo/contraparte a partir do `MEMO` e linhas a ignorar.
4. **Salvar o perfil**: na primeira vez, com um nome ("Mercado Pago CSV", "Cora CSV"); nas seguintes, se houve ajuste, o perfil existente é atualizado ao confirmar a importação (com aviso "o perfil X será atualizado"; opção de salvar como novo perfil em vez de sobrescrever).
5. **Conferência antes de gravar**:
   - tabela normalizada (data, valor, tipo, contraparte, ID);
   - totais de entradas, saídas e líquido;
   - com coluna de saldo: valida linha a linha e aponta a primeira divergência; com saldo inicial/final do arquivo, confere com o saldo anterior da conta;
   - duplicatas já importadas (serão puladas) e linhas que não puderam ser lidas, com o motivo.
6. **Confirmar.** As linhas entram como **abertas**. Nada vira lançamento sem confirmação.

### Implementação

- Leitura e aplicação do perfil no **navegador**, para a pré-visualização ser instantânea. O servidor recebe linhas já normalizadas e uma função SQL (`import_statement_lines`) valida, deduplica, grava e audita.
- Núcleo como funções puras, testadas com vitest e fixtures anonimizadas dos formatos acima:
  - `readCsv(text, {delimiter, encoding, headerRow})` e `readOfx(text)`;
  - `applyProfile(rows, profile) => ParsedStatement`.
- Parser OFX tolerante por regex (`<TAG>valor` até `<` ou fim da linha), cobrindo SGML com e sem tags de fechamento, sem depender do encoding declarado.
- Dedup: `external_id + data + valor` quando há ID; senão impressão digital `conta + data + valor + descrição + nº de ocorrência no dia`.

## Importação OFX (desde `014`)

- O arquivo é lido no navegador (`readOfx`): DTPOSTED, TRNAMT, MEMO, NAME, FITID, TRNTYPE, CHECKNUM, REFNUM, LEDGERBAL e `BANKACCTFROM`.
- **A conta (o banco) é escolhida em cada importação.** Alguns bancos não exportam OFX e os arquivos são convertidos antes; por isso `BANKID`/`ACCTID` do arquivo não são usados para identificar a conta.
- O perfil de leitura (separar MEMO do Nubank, prefixos de tipo, linhas a ignorar) é o da **última importação da conta escolhida**; sem histórico, o que reconhece o arquivo pela assinatura `ofx:<ORG ou BANKID>`; senão, sugestões. É aplicado sem perguntar e salvo/atualizado ao importar (nome padrão "<conta> OFX"). Os ajustes ficam recolhidos em "Ajustes de leitura". Trocar a conta com o arquivo carregado recarrega a leitura daquela conta.
- Cada linha guarda `external_id` (FITID), `trn_type`, `check_number`, `reference` e `payee`. O TRNTYPE ajuda a sugerir a forma de pagamento ao criar o lançamento (PAYMENT → Boleto, FEE → Tarifa, XFER → Transferência, CASH → Dinheiro), depois das regras pelo histórico.

### Cenários de importação (`015`)

| Situação | Como o app trata |
|---|---|
| **Lançamentos digitados antes**, extrato completo depois | Sugestões por mesmo valor no mesmo dia ou **até 3 dias** de diferença (pix de sexta compensado na segunda), com o nome desempatando. Lançamentos sem conta (**"A definir"**) aparecem como candidatos em qualquer conta e passam para a conta do extrato ao vincular. Um lançamento para várias linhas (N:1) e uma linha para vários lançamentos (1:N) continuam aceitos. |
| **Extrato parcial, depois o completo** | **Pré-conferência** antes de gravar (`preview_statement_lines`, nada é gravado): cada linha sai como *nova*, *já importada* (mesmo ID OFX + data + valor, ou mesma impressão digital; será pulada) ou *suspeita* (mesma data e valor de uma linha existente que o arquivo não repete, mas ID/histórico diferentes — típico de OFX convertido de novo). Suspeitas ficam desmarcadas; a pessoa marca as que são movimentos distintos. **Órfãs** são linhas já gravadas no período que o arquivo não traz (ex.: pendente que sumiu no extrato completo); as abertas podem ser ignoradas ao importar. Linhas desmarcadas vão com `skip`, para que a numeração de ocorrências da impressão digital siga o arquivo inteiro. |
| **Muitas linhas viram lançamentos** | Na conciliação, marcar várias linhas (ou "Marcar todas") → **Criar lançamentos**: um lançamento por linha, já conciliado, numa transação (`create_entries_from_statement_lines`, até 500). Histórico = contraparte (editável), forma sugerida pelo histórico/TRNTYPE (com "aplicar a todas"), rubrica automática pelo sinal: entrada → **1 Receitas**, saída → **2 Despesas**, para recategorizar em Lançamentos › Por rubrica. Lançamentos com várias rubricas seguem pelo "Criar lançamento" individual. |
| **Linhas sem lançamento** (tarifas, transferências entre contas próprias) | **Ignorar** várias linhas de uma vez com o mesmo motivo (`ignore_statement_lines`). |
| **Extrato importado na conta errada** (ou para refazer) | **Desfazer importação** em Importações recentes (`delete_statement_import`): apaga as linhas daquela importação e desfaz as conciliações delas; os lançamentos continuam, pendentes. |

### ID OFX como agregador

O FITID não é único (o Itaú reaproveita `data + sequência`), nem combinado com a conta. Mesmo assim, é o que liga a movimentação do banco ao que foi discriminado: as visões `ledger_entry_rows` e `entry_split_rows` expõem `external_ids` (FITIDs das linhas vinculadas), e a lista de lançamentos mostra a coluna **ID OFX** nas duas visões. Clicar no ID filtra por `?ofx=<FITID>` e traz o lançamento, todos os seus rateios e, numa linha 1:N, os outros lançamentos pagos por ela. A busca também encontra o ID; os detalhes do lançamento mostram as linhas do extrato vinculadas; as exportações levam a coluna ID OFX.

## Tela de conciliação (`/conciliacao`)

Objetivo: cruzar o que **já foi lançado à mão** com o que **veio do banco**, para que o mesmo movimento não exista duas vezes. Ao confirmar uma importação, o usuário cai direto nesta tela, filtrada pela conta e pelo período do arquivo. Também é acessível pelo menu, por conta e mês.

### Layout em duas colunas

```
 Conta: Cora ▾   Período: 01/05/2026 – 31/05/2026          Pendentes: 3 extrato · 2 lançamentos

 EXTRATO (importado)                          │ LANÇAMENTOS (já lançados)
 ─────────────────────────────────────────────┼─────────────────────────────────────────────
 ✦ 18/05  Pix enviado  Lucas T. F.   -239,90  ┿ 18/05  Lucas T. F. — material   -239,90  ✦
   [Aceitar] [Recusar]                        │
 ✦ 18/05  Pix enviado  Comunidade…   -150,00  ┿ 18/05  Aluguel salão           -150,00  ✦
   [Aceitar] [Recusar]                        │
   18/05  Pix enviado  Atenante…   -1.311,75  │   20/05  Acampamento — transporte -440,00
   18/05  Pix enviado  Comunidade…   -600,00  │
   [Criar lançamento] [Ignorar]               │   [Fora do extrato] [Trocar conta]
 ─────────────────────────────────────────────┼─────────────────────────────────────────────
 ✔ Vinculados (12) ▸                                                     [Aceitar todas (2)]
```

- **Esquerda — Extrato**: linhas importadas ainda abertas (data, tipo, contraparte, valor).
- **Direita — Lançamentos**: lançamentos da mesma conta, no período, ainda sem vínculo.
- Ordenadas por data e valor, para que pares prováveis fiquem na mesma altura.
- Linhas já vinculadas saem das colunas e vão para uma seção recolhida **Vinculados**, de onde podem ser desfeitas.

### Sugestões

- **Fase 3 (regra exata)**: mesmo dia e mesmo valor (com sinal). As duas linhas aparecem lado a lado marcadas como **sugestão** (✦), com **Aceitar** e **Recusar**.
  - Se houver mais de um candidato com mesmo dia e valor (ex.: várias mensalidades de R$ 20,00 no mesmo dia), não sugere par automático: mostra os candidatos e o usuário escolhe. Nome/contraparte parecido desempata.
  - **Aceitar todas** confirma de uma vez as sugestões sem ambiguidade.
  - Sugestão recusada não volta a aparecer para o mesmo par.
- **Fase 4 (regra ampliada)**: data a até 3 dias, contraparte parecida com o nome do lançamento, e combinações 1:N (uma linha do extrato = soma de vários lançamentos do mesmo dia).

### Vincular manualmente

- Selecionar uma ou mais linhas de um lado e uma ou mais do outro (clique ou checkbox); a barra inferior mostra a soma de cada lado e a diferença. **Vincular** só fica disponível quando as somas batem.
- Vincular significa: "este lançamento **é** esta linha do extrato". Nada é duplicado e nenhum valor é alterado; o lançamento passa a ter status **Conciliado**.

### Demais ações

- Ações sobre uma linha do extrato:
  - **Criar lançamento** a partir da linha: já preenche data, nome = contraparte (ou descrição), valor, conta e forma provável (pelo tipo: Pix recebido/enviado → PIX; Pagamento de conta → boleto); falta só o rateio por rubricas.
  - **Ignorar**, com motivo: transferência entre contas próprias, estorno que se anula, linha duplicada.
- Ações sobre um lançamento **sobressalente**, sem linha no extrato:
  - corrigir a conta (ex.: foi em dinheiro → Caixa);
  - marcar como **fora do extrato** (ex.: lançamentos do caixa);
  - deixar aberto para investigar.
- Rodapé: saldo inicial + movimentos conciliados = saldo do extrato? Mostrar a diferença do mês.
- Lista e dashboard passam a mostrar a coluna/filtro **Conta** e o status **Conciliado**.

## Fases

1. **Contas**: cadastro, conta padrão por forma de pagamento, conta no lançamento (com migração dos dados atuais), filtro e coluna Conta.
2. **Importação**: upload, montagem e reuso de perfis (CSV e OFX), conferência, deduplicação, lista de linhas importadas.
3. **Conciliação**: tela em duas colunas logo após a importação, sugestões por mesmo dia + mesmo valor (aceitar/recusar/aceitar todas), vínculo manual com conferência de somas, criar lançamento a partir da linha, ignorar, sobressalentes, fechamento do mês.
4. **Sugestões ampliadas**: tolerância de datas e semelhança de nomes feitas (`015`); falta sugerir combinações 1:N.
5. **Transferências entre contas** (um movimento que sai de uma conta e entra em outra sem virar receita ou despesa).

## Decisões

- Importação por **perfis montados manualmente pelo usuário** e salvos para reuso; sem parsers fixos por banco (2026-11-11).
- CSV e OFX na mesma fase; o OFX usa o mesmo mecanismo de perfil, sem a grade de colunas.
- Perfis são do grupo inteiro, funcionam como template editável e são atualizados quando ajustados numa importação (2026-11-11).
- Após importar, o usuário vai direto para a conciliação em duas colunas (extrato × lançamentos); mesmo dia + mesmo valor já aparece como sugestão desde a primeira versão (2026-11-11).
- Importação só por OFX; CSV desativado na interface (2026-11-11, `014`).
- O ID OFX (FITID) aparece nos lançamentos e rateios como agregador, derivado da conciliação (2026-11-11).
- "Nome do lançamento" passa a se chamar **Histórico** na interface (a coluna continua `name`) (2026-11-11).
- Criação em massa a partir do extrato usa a rubrica raiz pelo sinal (1 Receitas / 2 Despesas); a recategorização vem depois (2026-11-11).

## Perguntas em aberto

- Lista dos bancos/contas do grupo. Cora e Mercado Pago confirmados; há outros.
- Bancos sem OFX (Cora, Mercado Pago…) entram com o OFX convertido antes da importação.
- O dinheiro em espécie (caixa) entra como conta conciliável, ou só como conta sem extrato?
- Transferência entre contas próprias: tratar já na fase 1 ou deixar para a fase 5?
- Quem pode importar, montar perfis e conciliar: só tesouraria/administração, como na edição de lançamentos?
