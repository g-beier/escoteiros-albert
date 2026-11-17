# Backlog

Modelo e vocabulário em `docs/modelo.md`.

## Concluído (2026-11-13, passo 1 — cadastro)

- Modelo recriado (`032_inventory_catalog.sql`): material por peça (etiqueta `GEAS-000-0000`) ou por lote, consumíveis com estoque mínimo, validade por lote, divisões em árvore, famílias com código, dados de entrada, baixa com motivo, movimentos com status de revisão. Escrita só pelas funções `inventory_*`, auditadas.
- Papéis por app: administrador do grupo = gestor nos dois apps; papel do inventário (gestor, chefe, consulta) definido em Financeiro › Usuários.
- Telas: Materiais (lista, cadastro, detalhe com lotes/peças e ações), Divisões, Famílias, Início (validade, mínimo, pendentes), Movimentações.
- Carga de desenvolvimento da planilha "Doc 31 – Inventário" (`scripts/planilha-para-csv.mjs`, `scripts/importar-planilha.mjs`).

## Concluído (2026-11-13, ajustes)

- Materiais por local: abas com os locais macro (divisões raiz) e "Todos"; dentro de cada local, as subdivisões como subtítulos e os materiais com a quantidade, a validade e o valor daquela divisão (visão `inventory_stock_by_location`, 033). A busca mostra todos os locais; links de Divisões abrem só a subdivisão.
- Ordem das divisões escolhida pelo gestor (setas ↑ ↓ em Divisões), seguida pelas abas de Materiais e pelos seletores (034); a carga da planilha cria as divisões na ordem das abas e subtítulos.
- Lista de materiais: tela estreita, subdivisões recuadas por nível (com as divisões intermediárias como subtítulo), nome em peso normal, quantidade centralizada, sem a coluna Família e com a contagem do ano anterior quando houver (contagens anuais por material e divisão, `inventory_counts`, 035; carga da planilha 2024–2026).
- Configurações (engrenagem) com abas Divisões, Famílias e Usuários; o menu principal fica com Início, Materiais e Movimentações.
- Usuários compartilhados entre os apps (`@geas/ui`): uma tela com o papel no Financeiro e no Inventário; o administrador convida e altera nos dois apps.
- Celular: cabeçalho com botão de menu abaixo de 1024px e abas de área como botão com menu.
- Início: validade em dois cartões ("Lotes vencidos" e "Vencendo em 60 dias"); Movimentações recentes com material, tipo, quantidade e divisão, na mesma altura das outras listas.

## A verificar

- Barracas B1–B11: conciliar com as linhas de barraca das seções e mover cada peça para a sua divisão (hoje em "Almoxarifado › Barracas (a conferir)").

## Próximos

### Passo 2 — Lojinha

- Produtos com variações (tamanho, tipo de lenço) e preço de venda; venda lançada no Financeiro (rubrica Lojinha, com os itens) gerando a saída; entrega gratuita (Acolhida, distintivos) registrada no Inventário, com o associado opcional.

### Passo 3 — Revisão

- Gestor revisa os movimentos pendentes dos chefes: aprova (revisado) ou recusa (vai para o relatório "Para revisar").

### Passo 4 — Conferência anual

- Processo aberto pelo gestor; os chefes lançam divergências de quantidade e de condição, que viram ajustes. Histórico das contagens anuais (inclui 2024–2026 da planilha).
