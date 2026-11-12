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

## Concluído (2026-11-12)

- Navegação: Início · Lançamentos · Extrato (Conciliar/Importar), Configurações na engrenagem, menu da pessoa; mesmo cabeçalho e mesma largura em todas as telas.
- Criação em massa cria as linhas prontas e deixa as sem forma de pagamento para depois; conciliação lê até 5.000 linhas por lado.
- Associados: importação por CSV (`016_import_associates.sql`) e visualização por seção com filtro.
- Observações nos lançamentos (`017_entry_notes.sql`).
- **Mensalidades** (`018_fees.sql`, `/mensalidades`): grade março–dezembro, vencimento configurável com atraso automático, sugestões e vínculo aos rateios, isenção por ano; coluna de atrasadas no Início.
- Mensalidades: valor por ano e desconto do pagamento integral até a data-limite (`019_fee_prices.sql`); valor individual por associado com motivo (`020_fee_associate_prices.sql`); estado "não pago" registrado à mão (`021_fee_not_paid.sql`); entradas, saídas e retornos de associados, sem cobrança nos meses fora do grupo (`022_associate_movements.sql`); recebido por associado e por mês; filtro "Só com atrasos"; seções recolhíveis.
- `PageHeader` em todas as telas; Início em colunas 2:2:1.

## Concluído (2026-11-12, frentes A, C, D e F)

- **A — interface legada:** `/usuarios` e `/login` em componentes shadcn; classes sem uso removidas do `@layer legacy` (ficam `.shell` e as regras de `table`/`th`/`td`, ainda usadas por tabelas cruas).
- **C — lançamentos:** histórico de alterações nos detalhes (`023_entry_history.sql`, `ledger_entry_history`, também para Consulta); filtro "Conciliado" (`?conciliado=sim|nao`) e ✓ nas duas visões; seleção e movimento em lote de conta com atalho "N em 'A definir'" (`024_move_entries_account.sql`). Teste `supabase/tests/entries.sql`.
- **D — importação:** código CSV de extrato removido (leitor genérico em `lib/csv-reader.ts` para associados); conferência compara saldo inicial do OFX com o saldo da conta (`025_account_balance_before.sql`); aba "Perfis de leitura" em `/cadastros?aba=perfis` para renomear/excluir (`026_import_profile_admin.sql`). Testes `account_balance.sql`, `import_profiles.sql`.
- **F — comprovantes:** anexos em bucket privado `comprovantes` (PDF, JPG, PNG, HEIC; 10 MB), envio direto ao Storage por URL assinada, abrir/baixar por URL de 60 s, clipe na lista, exclusão junto com o lançamento (`027_entry_attachments.sql`). Teste `entry_attachments.sql`.

## Concluído (2026-11-12, frentes B e E)

- **B — tabelas:** `/lancamentos` em cartões abaixo de `md` nas duas visões (seleção, mover em lote, rolagem infinita e filtros mantidos); tabela desktop virtualizada acima de 300 linhas carregadas (`@tanstack/react-virtual`), cabeçalho fixo e `aria-rowcount`/`aria-rowindex`.
- **E — testes:** pgTAP (`npm run test:db`): isolamento entre grupos, papéis, ausência de escrita direta e auditoria (`*.test.sql`, dados em `_fixture.psql`); scripts SQL antigos com TAP mínimo, também rodáveis via psql. Playwright (`npm run test:e2e`, Chromium desktop, porta 3210, OTP pelo Mailpit, grupo "Grupo E2E"): login, lançamentos, usuários, mover em lote, comprovantes, importação OFX → conciliação → filtro Conciliado → desfazer. Como rodar no `README.md`.
- Corrigido: ids dos campos de rateio estáveis no formulário (erro de hidratação).

## Concluído (2026-11-12, ajustes de uso)

- **Mensalidades:** rodapé "Alertas" (atrasados + não pagos + atenção por mês), com tooltip do mês só com os estados que ocorrem e o recebido no mês (a linha "Recebido no mês" saiu); grade ocupa a tela no desktop com rolagem só nas linhas e rodapé fixo; escolher o status mantém o popover aberto e a observação grava sozinha (debounce de 400 ms), rateios gravam ao marcar.
- **Início:** "Mês a mês" na largura do conteúdo; "Últimos lançamentos" com os últimos 7 dias mais o último dia com lançamentos antes deles, na altura do "Mês a mês" e com rolagem (atrasadas também).
- **Rubricas:** código já usado avisado ao sair do campo, com o nome da rubrica.
- **Seções e patrulhas** (`028_sections.sql`): Ramo › Seção › Patrulha cadastrados em Configurações › Associados; seção vira lista do ramo (pré-selecionada quando há uma só), patrulha opcional; seções antigas em texto descartadas; importação CSV casa seção/patrulha pelo nome. Teste `sections.test.sql`.

## A verificar

Com o contador:

- Código estruturado × reduzido, lançamento múltiplo, histórico padrão e contas de contrapartida (ver `docs/contabilidade.md`).
- Abrir o CSV contábil no sistema do contador (leiaute de importação).

No navegador (desktop e celular):

- `/importacao` com `nubank.ofx`, `itau.ofx` e um OFX convertido: escolha da conta, perfil lembrado na segunda importação, suspeitas/órfãs na conferência, desfazer e retorno para `/conciliacao`.
- `/conciliacao`: sugestões aproximadas, "Criar lançamento", criação e ignorar em massa.
- `/cadastros` (contas, conta contábil), formulário com rateio misto (receita + despesa), seletor de rubrica e painel de filtros.
- Dashboard e rolagem da tabela de lançamentos.
- `/mensalidades`: valores individuais, não pago, entradas/saídas/retornos.
- `/associados`: recadastrar as seções e patrulhas reais e atribuir aos associados (as seções em texto foram descartadas).
- Celular: cartões de `/lancamentos` (seleção, rodapé fixo); desktop com mais de 300 lançamentos carregados (virtualização, teclado).
- Comprovantes: HEIC real e arquivo perto de 10 MB (fluxo básico coberto pelo e2e).
- `/lancamentos`: "Limpar filtros" seguido de busca antes da navegação terminar pode trazer de volta o filtro antigo.
- Importação: bloco de saldo inicial na conferência e aba "Perfis de leitura".
- `/login` e `/usuarios` com a aparência de antes.
- Exportações (XLSX e CSV do fluxo) abertas no Excel/LibreOffice/Google Sheets (cores, fórmulas) e download pelo navegador logado.

Decidido (2026-11-12):

- Conta (banco: Itaú, Caixa…) é campo distinto da forma de pagamento (Pix, dinheiro…).
- CSV de importação não volta; código pode ser removido.
- Mensalidades por associado: concluído com a grade e o valor individual (`020`); novas melhorias virão dos testes.

## Próximos

### D — Contabilidade (aguarda o contador)

- Exportação contábil: código reduzido e histórico padrão, lançamento múltiplo agrupado pelo ID OFX.

### Regras para os agentes

- Cada frente em worktree própria, um commit por item, `npm run lint`, `npm run typecheck` e `npm test` verdes; SQL testado com `supabase/tests/`.
- Worktree criada a partir de `feat/financeiro-contabilidade` (não de `main`); numeração de migrations reservada por frente para evitar colisão.
- Seguir `CLAUDE.md` (PageHeader, rótulos visíveis, escrita só por funções SQL auditadas, `lib/session.ts`) e `AGENTS.md` (Next.js desta versão).
- Atualizar este BACKLOG e os `docs/` ao concluir.
