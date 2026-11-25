# Backlog

Modelo e vocabulário em `docs/modelo.md`.

## Concluído (2026-11-13, passo 1 — cadastro)

- Modelo recriado (`032_inventory_catalog.sql`): material por peça (etiqueta `GEAS-000-0000`) ou por lote, consumíveis com estoque mínimo, validade por lote, divisões em árvore, famílias com código, dados de entrada, baixa com motivo, movimentos com status de revisão. Escrita só pelas funções `inventory_*`, auditadas.
- Papéis por app: administrador do grupo = gestor nos dois apps; papel do inventário (gestor, chefe, consulta) definido em `/usuarios`.
- Telas: Materiais (lista, cadastro, detalhe com lotes/peças e ações), Divisões, Famílias, Início (validade, mínimo, pendentes), Movimentações.
- Carga de desenvolvimento da planilha "Doc 31 – Inventário" (`scripts/inventory/planilha-para-csv.ts`; a carga é pela tela `/importar`).

## Concluído (2026-11-13, ajustes)

- Materiais por local: abas com os locais macro (divisões raiz) e "Todos"; dentro de cada local, as subdivisões como subtítulos e os materiais com a quantidade, a validade e o valor daquela divisão (visão `inventory_stock_by_location`, 033). A busca mostra todos os locais; links de Divisões abrem só a subdivisão.
- Ordem das divisões escolhida pelo gestor (setas ↑ ↓ em Divisões), seguida pelas abas de Materiais e pelos seletores (034); a carga da planilha cria as divisões na ordem das abas e subtítulos.
- Lista de materiais: tela estreita, subdivisões recuadas por nível (com as divisões intermediárias como subtítulo), nome em peso normal, quantidade centralizada, sem a coluna Família e com a contagem do ano anterior quando houver (contagens anuais por material e divisão, `inventory_counts`, 035; carga da planilha 2024–2026).
- Configurações (engrenagem) com abas Divisões, Famílias e Usuários; o menu principal fica com Início, Materiais e Movimentações.
- Usuários compartilhados entre os apps (`@geas/ui`): uma tela com o papel no Financeiro e no Inventário; o administrador convida e altera nos dois apps.
- Celular: cabeçalho com botão de menu abaixo de 1024px e abas de área como botão com menu.
- Início: validade em dois cartões ("Lotes vencidos" e "Vencendo em 60 dias"); Movimentações recentes com material, tipo, quantidade e divisão, na mesma altura das outras listas.

## Concluído (2026-11-19, sugestões do PR #4)

- Lista de Materiais (continua por divisão): colunas como na planilha — Estado (pior condição da divisão, com a quebra no detalhe), contagens dos dois anos anteriores, valor unitário (faixa quando os lotes diferem) e valor total; o usuário escolhe as colunas visíveis (cookie). Estado e faixa de unitário vêm de `inventory_stock_by_location` (042).
- Ordenação por qualquer coluna, dentro de cada divisão. Estado, Quantidade, Validade e Valor unitário têm menu na coluna (como na planilha): ordenar nos dois sentidos e filtrar por valores (estado; abaixo do mínimo / no mínimo ou acima / sem mínimo; vencidos / não vencidos / sem validade) e/ou por faixa (quantidade, valor unitário); na URL. A tabela continua com cabeçalho mesmo vazia, para desfazer o filtro.
- Detalhe, edição e cadastro voltam para a lista com aba, busca, filtros e ordem (`voltar`).
- Busca ampliada (043): além do nome, descrição, família (nome e código), observação e fornecedor dos lotes com saldo, etiqueta, código antigo, descrição e observação das peças; sem acento e sem diferenciar maiúsculas; cada palavra precisa aparecer em algum campo. A "Categoria" da Alcateia (na observação dos lotes) entra na busca. Tags descartadas por ora.
- Movimentações e histórico do material com o que mudou: condição com as pills (Bom → Em manutenção), ajuste com a contagem antes → depois e a diferença com sinal (+5 / −2), edição do material com os campos alterados (nome, mínimo, controle, consumível, ativo), divisão do lote/peça quando o movimento não grava divisão (`lib/inventory/movements.ts`).
- Pill de estado colorida (verde → âmbar → vermelho; manutenção em azul) na lista, nos lotes e nas peças.

## Concluído (2026-11-19, passo 3 — revisão e registro rápido)

- Revisão com dois status, **Para revisar** e **Revisado** (044; o antigo "pendente" virou "para revisar", e a recusa saiu). O gestor revisa em Movimentações › Para revisar (seleção em lote, nota opcional) ou no histórico do material; inconsistência é corrigida por fora, com um movimento normal.
- Registro rápido para celular (045; desde 049 parte do registro rápido comum `/rapido`, com lançamento financeiro e associado novo): busca, retirar/consumir, entrada, mudar condição, transferir, ajustar contagem e cadastro de material novo. Tudo fica para revisar, mesmo do gestor ou do administrador (`channel = 'rapido'`). Atalho no cabeçalho (raio) e no Resumo.

## Concluído (2026-11-19, entrada pelo Materiais)

- O Resumo do Inventário saiu: `/inventario` abre Materiais, e o menu começa por Materiais. O que pede atenção (para revisar, abaixo do mínimo, vencidos e vencendo) fica no Início do Gestão, com links para a lista já filtrada. Em Materiais, o gestor vê o aviso "N para revisar" e todos os editores têm o botão Registro rápido.

## Concluído (2026-11-19, saída como baixa)

- Saída é baixa, não ajuste: no detalhe, cada lote tem o botão **Consumir** (consumível) ou **Dar baixa**, e o menu ⋯ com transferir, condição, dados e, por último, **Corrigir contagem…** (só para registro errado). Ao corrigir para menos, o diálogo mostra quantas faltam e oferece registrar a diferença como consumo/baixa.
- Na lista de Materiais, cada linha de material por quantidade tem um botão ±: o diálogo escolhe entre **Remover** (consumir/dar baixa, escolhendo o lote; vem marcado o que vence antes; é o padrão quando há saldo) e **Incluir** (entrada naquela divisão), sem abrir o material.

## Concluído (2026-11-19, lotes iguais se juntam)

- Lote = material + divisão + condição + validade + **variação** (novo, opcional: "modelo antigo"). Comprar mais do mesmo soma no lote (valor pela média ponderada; dados da compra no movimento); transferência e mudança de condição somam num lote igual no destino (046). Os lotes idênticos que já existiam foram unificados. A carga da planilha dá uma variação às linhas com a mesma chave e observação ou valor diferentes, para continuarem separadas.

## A verificar

- Barracas B1–B11: conciliar com as linhas de barraca das seções e mover cada peça para a sua divisão (hoje em "Almoxarifado › Barracas (a conferir)").

## Próximos

### Passo 2 — Lojinha

- Produtos com variações (tamanho, tipo de lenço) e preço de venda; venda lançada no Financeiro (rubrica Lojinha, com os itens) gerando a saída; entrega gratuita (Acolhida, distintivos) registrada no Inventário, com o associado opcional.

### Empréstimo e devolução

- Material que sai da sede e volta (não a retirada definitiva, que é baixa). Decidir antes de codar: quem leva (associado ou texto livre), prazo, se o emprestado continua contando na divisão (proposta: sim, com selo "emprestado"), e se material de atividade do calendário continua sem registro. Proposta: tabela `inventory_loans`, tipos de movimento `emprestimo`/`devolucao`, as duas ações no registro rápido e a lista "Emprestados".

### Passo 4 — Conferência anual

- Processo aberto pelo gestor; os chefes lançam divergências de quantidade e de condição, que viram ajustes. Histórico das contagens anuais (inclui 2024–2026 da planilha).
