# Plano do Associados

Fases do módulo Associados (`/associados`). Modelo e vocabulário em `modelo.md`. Revisto em 2026-11-26. O que vem antes
da produção está em `docs/plano-go-live.md`; aqui fica o que é do módulo.

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
| **Papéis** (go-live, 002/003) | Os cinco níveis comuns aos módulos (`associates_role`); chefes sem acesso ao módulo veem no Início só os avisos dos jovens das suas seções (`memberships.associate_id`). Substituiu as diretorias por usuário e o papel Chefe da antiga fase A. | Edição do controle só pelas diretorias donas de cada item. |
| **Carga** (006–009) | `/importar` com `secoes`, `itens-controle`, `pessoas`, `funcoes`, `responsaveis`, `controle` e `vida-escoteira`, contrato em `docs/importacao.md`, conversor `associates:csv`. Substituiu os scripts locais da antiga fase B. | Converter as planilhas reais (go-live). |
| **2 — Datas** (parte) | Aniversários de nascimento e promessa, transições de ramo com níveis e "transição iniciada" (050), Doc 13 e Doc 14a em PDF, cartões no Início. | Faixas dos ramos configuráveis (hoje fixas em `TRANSITIONS`). |
| **Vida escoteira** (004, 005) | Períodos, estrelas, eventos, exclusões (Regra 173), linha do tempo, visão do grupo, Doc 14b. | Avisos de estrela aos chefes no Início (`sectionOverview` devolve `stars: []`). |
| **Registro e funções** (052–055) | Registro provisório/definitivo, apelido, tipos de função (honorífico, colaborador, contribuinte, comissão fiscal), eleito, função editável, passagem só para o ramo seguinte. | — |
| **Controle por público** (016) | Tirar ou incluir um público num item apaga ou cria as situações; quem muda de público (ramo ↔ adulto) acompanha. | — |
| **Exclusão** (018) | Pedido de exclusão com quarentena de 60 dias, Configurações › Excluídos, purga diária (`associates_purge_due`). | — |

Testes: pgTAP `associates*.test.sql`, `roles_modules.test.sql`; vitest em `lib/associates/*.test.ts`; e2e
`associates*.e2e.ts`, `roles.e2e.ts`.

## Próximas fases

### 4 — Adultos (restante)
- Gestões (mandatos); ATV com os três tipos de validade; PPF marcado "a revisar" ao mudar a função; diretoria atual.

### 6 — Registro UEB (fora do go-live)
- Configurações › Registro: rubricas de registro e de repasse.
- Ano-base e Validade do registro calculados dos rateios por associado; validade sugerida e confirmada à mão; lista de
  quem pagou, quem falta repassar e quem vence.

### 7 — Integrações financeiras (fora do go-live)
- Responsável financeiro em mensalidades e devedores; irmãos agrupados; sugestão de rateio por família.
- Desligamento avisa de mensalidades em aberto, dívidas e registro pendente.

## Pendências técnicas

- `associates` ainda aceita escrita direta (política "editors manage associates" em `001_schema.sql`). Nenhum código
  do app escreve direto: trocar por funções auditadas e tirar a política.
- Passagem não guarda a equipe de origem.
- A situação de um responsável só se edita pela matriz (não há página de responsável).
- Responsável que era associado e foi desligado volta à matriz com "sem registro" (sem valor inicial).
- O tema tem CSS legado em `td` (`border-top`): a matriz zera; outras tabelas novas devem fazer o mesmo.

## Perguntas em aberto

1. Ano-base e Validade do registro ficam na Administrativa (como nas abas de adultos do Doc 22) ou na Financeira?
2. Twitter do GEAS: manter ativo ou desativar?
3. A coluna "Observações" da aba de jovens do Doc 22 precisa de um campo próprio, além da observação por célula e da
   nota do associado?

Respondidas: seções e patrulhas ficam no Associados (Configurações › Seções); a ordem das fases seguiu
`docs/plano-go-live.md`.

## Divisão do trabalho

- Banco (migrations, funções auditadas, pgTAP) e telas podem andar em paralelo depois de fechado um contrato com nomes
  e assinaturas.
- Arquivos compartilhados com outros módulos (migrations, `memberships`, `session.ts`, `/usuarios`, `AppBrand`, tema)
  num PR só por vez, para reduzir conflitos entre os módulos.
- Dados reais das planilhas nunca entram no repositório nem nos testes.
