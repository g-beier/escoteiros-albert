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
- Algarismos tabulares com Outfit (a Poppins do Google Fonts não tem `tnum`).

## A verificar

- Seletor de rubrica do formulário e painel de filtros ainda não passaram pelo teste automatizado no navegador (compilam e as rotas respondem).
- Decidir se o app inteiro passa para Outfit ou mantém Poppins no texto.
- Confirmar se "conta" é um campo distinto da forma de pagamento.

## Próximos

- Migrar `/usuarios` e `/login` para os componentes shadcn (ainda usam classes legadas em `globals.css`).
- Remover do `@layer legacy` as classes que deixarem de ser usadas (`.button`, `.input`, `.modal*`, `.split-row` etc.).
- Responsivo das tabelas: hoje rolam na horizontal no celular; avaliar cartões por lançamento em telas estreitas.
- Virtualizar a tabela se a rolagem infinita ficar pesada com milhares de linhas carregadas.
- Histórico de alterações (auditoria) na página de detalhes.
- Testes pgTAP das políticas RLS e funções; Playwright para OTP, lançamentos e gestão de usuários.
- Importação/conciliação de extrato CSV/OFX.
- Anexos de comprovantes em bucket privado (complementa a "pasta").
- Mensalidades por associado.
