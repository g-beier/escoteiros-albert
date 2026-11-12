# Backlog

## Concluído (2026-11-11)

- Modelo: linha do extrato com data, forma de pagamento (lista), pasta (documento arquivado) e total; rateio com rubrica, valor, descrição e associado (lista).
- Associados com nome, ramo, seção e ativo/inativo (`/associados`).
- Cadastro de rubricas e formas de pagamento com ativação/inativação (`/cadastros`).
- Visões **Por extrato** (rateios agrupados na linha) e **Por rubrica** explodida (um rateio por linha, ligado à linha de origem).
- Tabelas compactas com as colunas Data, Forma pgto, Pasta, Valor, Nome do Associado, Descrição e Rubrica.
- Filtros por período, forma de pagamento, pasta, associado, rubrica e descrição (estado na URL).
- Edição e exclusão de lançamentos e conferência da pasta, com auditoria (`005_edit_delete_entries.sql`).
- Card de contagem de lançamentos substituído por entradas, saídas, saldo e documentos pendentes.
- shadcn/ui (preset `b1D0eVNQ`, estilo `base-mira`, Base UI) com tokens mapeados para a paleta do Albert; botões redondos.

## Concluído (2026-11-11, segunda rodada)

- Nome do lançamento (quem pagou/recebeu, emitente da nota) obrigatório (`006_entry_name.sql`).
- **Por extrato** sem rateios: Data, Nome do lançamento, Forma pgto, Pasta, Valor total.
- **Por rubrica** explodida inclui o nome do lançamento.
- Detalhes em `/lancamentos/[id]` (clique na linha nas duas visões): formulário completo, editável por tesouraria/administração e somente leitura para consulta; exclusão pelos detalhes; volta à lista com os mesmos filtros.
- Criação em página própria (`/lancamentos/novo`).
- Busca cobre nome do lançamento e descrição dos rateios.
- Cards de entradas/saídas/saldo removidos; mantido apenas o atalho de documentos pendentes na pasta.
- Tela de lançamentos no formato planilha: largura total, cabeçalho e filtros em barras compactas, tabela ocupando a altura da tela com cabeçalho fixo, até 1000 lançamentos / 2000 rateios.

## Concluído (2026-11-11, terceira rodada)

- Rolagem infinita (100 por página), mais recentes primeiro; cabeçalho "Data" inverte a ordem.
- Filtros com seleção múltipla (forma pgto, pasta, associado com "(Sem associado)", rubrica em árvore) com rótulo visível no botão e ícone de filtro no cabeçalho das colunas; atalhos "Só receitas/despesas/inativas".
- Rubricas hierárquicas com código, tipo receita/despesa e pai (`008_category_tree.sql`); sinais validados no banco.
- Formulário: passo Entrada/Saída antes da rubrica; seletor de rubrica em árvore; valores digitados sem sinal.
- `/cadastros`: rubricas em árvore com código; uso leva aos rateios para recategorizar.
- Fonte do app trocada para Outfit (algarismos tabulares); institucional segue em Poppins.

## Concluído (2026-11-11, quarta rodada)

- Lançamento com rubricas de receita e despesa misturadas (ex.: mensalidades atrasadas menos um ressarcimento na mesma transferência) (`009_mixed_split_kinds.sql`). O sinal de cada rateio vem da rubrica; entrada/saída vale só para o total do extrato. Seletor lista receitas e despesas (tipo do lançamento primeiro); a soma mostra receitas e despesas separadas quando há mistura.

## Concluído (2026-11-11, quinta rodada)

- Botão **Exportar** na tela de lançamentos (planilhas XLSX formatadas):
  - **Fluxo de caixa** por extrato ou por rubrica, por período (mês, ano ou datas personalizadas, limites inclusivos); ignora os demais filtros da lista; totais de entradas, saídas e saldo em fórmulas.
  - **Realizado anual**: rubricas × meses no layout da planilha do grupo (blocos verde/laranja), despesas positivas, grupos e totais como fórmulas SOMA, coluna Total e linha Saldo; rubricas ativas + inativas com movimento (`010_realized_by_month.sql`).

## Concluído (2026-11-11, sexta rodada)

- Tela inicial (`/`) virou **dashboard** do ano: receitas, despesas, saldo, documentos pendentes, tabela mês a mês com acumulado e últimos lançamentos.
- Lista de lançamentos movida para `/lancamentos`; por padrão começa em 1º de janeiro do ano atual (`de` ausente); apagar a data inicial (`de=tudo`) mostra todos os anos.
- Lançamentos: a página não rola em nenhuma largura; só as linhas da tabela rolam sob cabeçalho fixo.

## Concluído (2026-11-11, sétima rodada)

- Coluna e filtro "Pasta" renomeados para **Documentos** (Pendente / Arquivado), também no formulário, no dashboard e nas exportações. Parâmetro de URL `pasta` mantido.

## Concluído (2026-11-11, oitava rodada)

- **Contas** (`011_accounts.sql`): cadastro em `/cadastros` (tipo, banco, agência, número, saldo inicial), conta padrão por forma de pagamento, conta obrigatória no lançamento (lançamentos antigos foram para "A definir"; Dinheiro → Caixa), coluna e filtro **Conta** (`conta` na URL) e coluna nas exportações.
- **Importação de extrato — banco e servidor** (`012_statement_import.sql`): perfis por banco, importações, linhas do extrato com impressão digital calculada no banco e duplicatas puladas; tabelas de vínculos/recusas de conciliação. Server Actions em `app/importacao/actions.ts`. Falta a tela de importação.

## Concluído (2026-11-11, nona rodada)

- **Tela de importação** (`/importacao`, menu "Importar extrato"): conta + arquivo (CSV ou OFX, detectado pelo conteúdo), perfil do grupo reconhecido pela assinatura do cabeçalho ou novo perfil com sugestões (`sniffCsv` + papéis pelo nome das colunas), grade com papel por coluna, natureza C/D, prefixos de tipo, linhas a ignorar, conferência (totais, saldos, primeira divergência, erros, ignoradas, valor zero), salvar/atualizar perfil ("salvar como novo") e importar; redireciona para `/conciliacao`. Lista das importações recentes da conta.
- Linha "SALDO ANTERIOR" ignorada vira saldo inicial quando o arquivo não traz outro (Itaú); no OFX, confere saldo inicial + movimentos com o `LEDGERBAL`.
- **Conciliação** (`013_reconciliation.sql`, `/conciliacao`): funções `link_reconciliation` (1:1, 1:N, N:1; somas com sinal), `unlink_reconciliation`, `reject_reconciliation_suggestion`, `ignore_statement_line`/`reopen_statement_line`, `create_entry_from_statement_line`, `set_ledger_entry_outside_statement`, `set_ledger_entry_account`; excluir um lançamento conciliado ou mudar seu valor/conta desfaz o vínculo e reabre as linhas. Tela em duas colunas com sugestões (mesmo dia + valor; ambíguas ordenadas por nome parecido), vínculo manual, ignorar com motivo, fora do extrato, trocar conta, vinculados/ignoradas/fora do extrato com desfazer e fechamento. ✓ de conciliado na visão Por extrato. Teste SQL em `supabase/tests/reconciliation.sql` (roda em transação desfeita).

## Concluído (2026-11-11, décima rodada — contabilidade e coesão)

- **Conta contábil** (`014_accounting.sql`): domínio `ledger_code` (`0.0.0.0.0000`) em rubricas e contas; campo com máscara em `/cadastros`, alerta e filtro "Só sem conta contábil".
- Rubricas e formas de pagamento gravadas só por funções SQL auditadas (políticas de escrita direta removidas), como as contas.
- **Importação só OFX**: TRNTYPE, CHECKNUM, REFNUM e NAME gravados; a conta (banco) é escolhida em cada importação, pois alguns OFX são convertidos; perfil de leitura lembrado por conta, aplicado e salvo sem diálogo. CSV desativado na interface (código mantido).
- **ID OFX** (FITID) como agregador: `external_ids` nas visões, coluna nas duas visões de `/lancamentos`, filtro `?ofx=`, busca, bloco "Extrato" nos detalhes, ID na conciliação e nas exportações.
- Forma de pagamento sugerida também pelo TRNTYPE.
- **Exportação contábil** (`/exportar/contabil`): CSV em partida dobrada, uma linha por rateio, Windows-1252 ou UTF-8; recusa quando falta conta contábil. Fluxo de caixa também em CSV. Colunas das exportações em `lib/export/columns.ts`, comuns aos formatos.
- Vocabulário: visão **Por lançamento**, campo **Histórico** (antes "Nome do lançamento"); glossário em `docs/modelo.md`; `docs/contabilidade.md`.
- `lib/session.ts` substitui as 15 cópias da consulta de grupo/papel; `SectionCard` substitui as classes `card`/`card-head` nos cadastros, importação, associados e lançamentos.
- Teste SQL `supabase/tests/accounting.sql`.

## Concluído (2026-11-11, décima primeira rodada — cenários de importação)

- `015_import_scenarios.sql`: pré-conferência (novas, já importadas, suspeitas, órfãs) antes de importar; linhas desmarcadas com `skip`; desfazer importação; criação em massa de lançamentos conciliados (rubrica raiz pelo sinal); ignorar em massa; lançamentos "A definir" vinculáveis em qualquer conta.
- Conciliação: sugestões com até 3 dias de diferença (nome desempata), "Marcar todas", "Criar lançamentos (N)" e "Ignorar (N)" na barra de seleção.
- Teste SQL `supabase/tests/import_scenarios.sql` (digitado antes → parcial → completo reconvertido → órfã → massa → desfazer).

## A verificar

- Validar com o contador: código estruturado × reduzido, lançamento múltiplo, histórico padrão e contas de contrapartida (ver `docs/contabilidade.md`).
- Abrir o CSV contábil no sistema do contador (leiaute de importação) e o CSV do fluxo no Excel/LibreOffice.
- `/importacao` no navegador com `nubank.ofx` e `itau.ofx` e com um OFX convertido: escolha da conta, perfil lembrado na segunda importação, suspeitas/órfãs na conferência e desfazer.
- `/conciliacao` no navegador: sugestões aproximadas, criação e ignorar em massa.


- Aplicar `013` no banco local e testar `/conciliacao` no navegador (desktop e celular), inclusive "Criar lançamento" e o retorno de `/importacao`.

- Aplicar `011`/`012` no banco local (`npx supabase migration up`) e conferir `/cadastros`, formulário e lista com a coluna Conta no navegador.
- `/importacao` no navegador, ponta a ponta, com as fixtures de `lib/statement-import/__fixtures__/` (ainda não exercitada: o banco local não tinha `011`/`012`).

- Dashboard e rolagem da tabela no navegador (desktop e celular).
- Exportações abertas no Excel/Google Sheets (cores, fórmulas) e download pelo navegador logado.
- Formulário com rateio misto (receita + despesa), seletor de rubrica e painel de filtros ainda não passaram pelo teste automatizado no navegador (compilam e as rotas respondem).
- Confirmar se "conta" é um campo distinto da forma de pagamento.

## Próximos

- Migrar `/usuarios` e `/login` para os componentes shadcn (ainda usam classes legadas em `globals.css`, inclusive `card`/`card-head`).
- Remover do `@layer legacy` as classes que deixarem de ser usadas (`.button`, `.input`, `.modal*`, `.split-row` etc.).
- Responsivo das tabelas: hoje rolam na horizontal no celular; avaliar cartões por lançamento em telas estreitas.
- Virtualizar a tabela se a rolagem infinita ficar pesada com milhares de linhas carregadas.
- Histórico de alterações (auditoria) na página de detalhes.
- Testes pgTAP das políticas RLS e funções; Playwright para OTP, lançamentos e gestão de usuários.
- Importação: conferir o saldo inicial do arquivo com o saldo da conta e lista de perfis editável fora da importação.
- Remover o código CSV de importação (`csv.ts`, `apply.ts`, `csv-profile-builder.tsx`) se o CSV não voltar.
- Exportação contábil: código reduzido e histórico padrão, se o contador pedir; lançamento múltiplo agrupado pelo ID OFX.
- Mover em lote os lançamentos de "A definir" para a conta certa.
- Conciliação: sugerir combinações 1:N (uma linha = soma de vários lançamentos); vínculo N:M (hoje recusado).
- Criação em massa: lembrar a rubrica usada antes para a mesma contraparte, se a recategorização manual pesar.
- Importação: conferir se o arquivo é mesmo da conta escolhida (ex.: saldo inicial do arquivo × saldo da conta).
- Filtro "Conciliado" em `/lancamentos` (hoje só o indicador ✓ na visão Por extrato).
- Anexos de comprovantes em bucket privado (complementa a "pasta").
- Mensalidades por associado.
