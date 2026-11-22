# Plano do Associados

Fases do módulo Associados (`/associados`). Modelo e vocabulário em `modelo.md`. Revisto em 2026-11-19, depois da
primeira entrega (branch `feat/associados-base`, migrations 040 e 041).

Prioridade do grupo: o **controle de dados pessoais (Doc 22)** vem antes de datas, adultos e registro. A lista divide os
associados só por ramo (seção e equipe não agrupam), com os adultos em Escotistas / Dirigentes / Sem função.

## Feito

| Fase | O que entrou | O que ficou de fora |
|---|---|---|
| **0 — Base** | Route group `app/(associados)`, tema verde (`data-app="associados"`), `AppBrand` com três módulos, papel `associates_role` (Secretaria/Consulta) em `/usuarios`, `Member.associates`, guards `associatesEditorOrError`/`requireAssociatesEditor`, camada `lib/server/associates/*`. | Diretorias por usuário; papel Chefe. |
| **1 — Cadastro** | Lista por ramo com efetivo; novo, detalhe, editar; passagem (inclui pioneiro → adulto); desligar e reingressar; `active` derivado das movimentações; Configurações › Seções e Importar (saíram do Financeiro). | Carga das planilhas; equipe de origem na passagem. |
| **3 — Responsáveis** (parte) | Responsáveis com parentesco, legal e financeiro; compartilhados entre irmãos; ligação com associado; seção Responsáveis no detalhe do jovem. | Uso em mensalidades e devedores (Fase 7). |
| **4 — Adultos** (parte) | Funções escotista/dirigente com cargo, início e fim; subdivisão da lista. | Gestões; regras de validade do ATV; PPF "a revisar" ao mudar a função. |
| **5 — Controle de dados** | Itens por diretoria com posição (arrastar), validade, remover no desligamento, público (Jovem/Adulto/Responsável) com valor inicial, e valor na célula (situação, ano ou data); carga inicial com as 28 colunas do Doc 22; matriz única `/associados/controle` (abas Jovens/Adultos, diretorias em sequência, ocultar diretoria, só pendências, incluir desligados, responsáveis abaixo do jovem); situações no detalhe; "a remover" em toda saída. | Edição só pelas diretorias donas; cartão de pendências por diretoria no Início. |

Testes: pgTAP `associates.test.sql`, `associates_controls.test.sql`, `associates_relatives.test.sql`; vitest em
`lib/associates/*.test.ts`; e2e `associates.e2e.ts`, `associates-controls.e2e.ts`, `associates-relatives.e2e.ts`.

## Próximas fases

### A — Diretorias e papéis (completa a 0 e a 5)
- `memberships.directorates`; papel **Diretoria**: edita só as colunas das suas diretorias, vê o resto.
- Papel **Chefe**: vê os jovens e responsáveis da sua seção.
- Tirar a tesouraria de `can_manage_associates` quando a secretaria estiver usando o módulo.
- Início geral (`/`): cartão do Associados com pendências por diretoria (`pendingByDirectorate` já existe).

### B — Carga das planilhas (desenvolvimento)
- Scripts locais (como o do Inventário) para Docs 10, 13, 14 e 22: CSV fora do repo, só contra o banco local.
- Doc 22: NÃO → pendente, OK → ok, DESAT./ANTIGA → desatualizado, VER/TEM? → a verificar, CONV. → convidado,
  XXX → não se aplica, cinza → item fora do público; anos e datas nas colunas de registro; `*` → parentesco "outro".

### 2 — Datas (substitui Docs 13 e 14)
- Faixa do ramo e transição; aniversários de nascimento e promessa; tempo de atividade.
- Configurações › Faixas dos ramos. Resumo do módulo: aniversariantes do mês, transição, fora da faixa.

### 4 — Adultos (restante)
- Gestões (mandatos); ATV com os três tipos de validade; PPF marcado "a revisar" ao mudar a função; diretoria atual.

### 6 — Registro UEB
- Configurações › Registro: rubricas de registro e de repasse.
- Ano-base e Validade do registro calculados dos rateios por associado; validade sugerida e confirmada à mão; lista de
  quem pagou, quem falta repassar e quem vence.

### 7 — Integrações financeiras
- Responsável financeiro em mensalidades e devedores; irmãos agrupados; sugestão de rateio por família.
- Desligamento avisa de mensalidades em aberto, dívidas e registro pendente.

## Pendências técnicas

- `associates` ainda aceita escrita direta (política "editors manage associates", usada pelo código antigo do
  Financeiro); trocar por funções auditadas quando nada mais escrever direto.
- Passagem não guarda a equipe de origem.
- A situação de um responsável só se edita pela matriz (não há página de responsável).
- Responsável que era associado e foi desligado volta à matriz com "sem registro" (sem valor inicial).
- O tema tem CSS legado em `td` (`border-top`): a matriz zera; outras tabelas novas devem fazer o mesmo.

## Perguntas em aberto

1. Ano-base e Validade do registro ficam na Administrativa (como nas abas de adultos do Doc 22) ou na Financeira?
2. Twitter do GEAS: manter ativo ou desativar?
3. A coluna "Observações" da aba de jovens do Doc 22 precisa de um campo próprio, além da observação por célula e da
   nota do associado?
4. Seções e equipes ainda precisam aparecer no Associados (cadastro e Configurações), ou só no Financeiro?
5. Ordem das próximas fases: A (diretorias) e B (carga) antes de 2, 4, 6, 7?

## Divisão do trabalho

- Banco (migrations, funções auditadas, pgTAP) e telas podem andar em paralelo depois de fechado um contrato com nomes
  e assinaturas.
- Arquivos compartilhados com outros módulos (migrations, `memberships`, `session.ts`, `/usuarios`, `AppBrand`, tema)
  num PR só por vez, para reduzir conflitos com o Inventário e o Ações.
- Dados reais das planilhas nunca entram no repositório nem nos testes.
