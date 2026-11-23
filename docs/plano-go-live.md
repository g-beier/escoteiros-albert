# Plano até colocar o Gestão no ar

Revisto em 2026-11-23 com o Diretor-presidente. Junta o que falta antes da produção; os planos por módulo
(`apps/gestao/BACKLOG.md`, `apps/gestao/docs/inventario/BACKLOG.md`, `apps/gestao/docs/associados/plano.md`) seguem
valendo para o que fica depois. Infra e Azure: `.azure/deployment-plan.md`.

## Ordem

1. **Papéis** (seção 1): pequeno, muda quem vê o quê; vem antes de dar acesso a mais gente.
2. **Importação de associados por CSV** (seção 2): o Financeiro e os relatórios dependem das pessoas.
3. **Importação do inventário por CSV** (seção 3), com as contagens de 2025 e 2026.
4. **Vida escoteira** (seção 4): modelo depois de ver a planilha de linha do tempo; implementação em seguida.
5. **Ir ao ar**: tela de consentimento do Google (página `/privacidade` pronta), Azure, domínio
   `gestao.escoteirosalbert.com.br`, carga real pelos CSVs, uso pela diretoria em paralelo às planilhas.
6. **Antes da contagem de 2027**: conferência anual no Inventário (Passo 4 do backlog do inventário).

Fora por ora: módulo Ações (o rascunho `apps/gestao/docs/acoes/modelo.md` não existe mais; recomeça quando voltar),
papel Secretaria/bloqueio da tesouraria no Associados, Lojinha, empréstimos, registro UEB e integrações financeiras.

## 1. Papéis

**Feito em 2026-11-23** (migrations `002_papeis.sql` e `003_niveis.sql`, branch `feat/papeis`): P1–P7 abaixo, depois
padronizados em cinco níveis iguais nos três módulos (P8). P5 já estava certo (edição de material pelo chefe gera
movimento "edição" para revisar).

Quem usa: a diretoria (Diretor-presidente, diretores Administrativo, de Métodos Educativos e Financeiro) e os
escotistas (chefes). Não há secretaria.

Níveis (os mesmos no Financeiro, no Inventário e no Associados; cada um pode tudo o que os anteriores podem):

| Nível | O que faz |
|---|---|
| Sem acesso | não vê o módulo (some do menu; o banco não deixa ler) |
| Consulta | só consulta |
| Colaborador | consulta e faz o dia a dia (lançamentos; cadastro, funções, passagens, controle e responsáveis de associados; materiais e movimentos), sempre "para revisar" |
| Editor | também revisa e mantém configurações, importações, conciliação e mensalidades |
| Administrador | também gerencia os usuários do módulo |

| Pessoa | Financeiro | Associados | Inventário |
|---|---|---|---|
| Diretor-presidente | Administrador | Administrador | Administrador |
| Diretor Financeiro | Editor | Editor | Editor |
| Diretores Administrativo e de Métodos Educativos | Consulta | Editor | Editor |
| Chefes (escotistas) | Sem acesso | Sem acesso (só os avisos do Início, dos jovens da própria seção) | Colaborador |

"Confirmar" o inventário = revisar os movimentos "para revisar" (`inventory_review_movements`); qualquer Editor
confirma.

### O que muda no código

| # | Hoje | Passa a ser |
|---|---|---|
| P1 | `admin` faz tudo; "Tesoureiro" edita o Financeiro | Continua (o administrador faz tudo em todos os módulos). Só renomear "Tesoureiro" para "Financeiro" |
| P2 | Todo membro lê o Financeiro (`memberships.role` = admin/treasurer/viewer) | Papel financeiro com "sem acesso" (separar o papel do Financeiro de "administrador"); RLS e menu sem o módulo |
| P3 | `associates_role` = manager/viewer ("Secretaria"/"Consulta") | manager/viewer/**none**; rótulo "Diretoria" no lugar de "Secretaria". `none` some do menu e do `AppBrand`, e o RLS não deixa ler `associates` |
| P4 | Início lê associados com o RLS de quem está logado | Avisos do Início para quem é `none` por uma função SQL que devolve só o aviso (nome e o fato: aniversário, promessa, transição de ramo), sem acesso à lista, e **só dos jovens das seções do chefe** (P7). Sem vínculo ou sem função de escotista ativa: nenhum aviso de associado |
| P5 | Chefe cadastra/edita material; movimentos do chefe ficam "para revisar" | Conferir que cadastro e edição de material pelo chefe também ficam "para revisar" (hoje só movimentos); ajustar `inventory_save_material` se não ficarem |
| P6 | `/rapido` mostra "associado novo" a quem edita associados | Continua; chefes (none) não veem |
| P7 | O acesso (e-mail) não tem ligação com o cadastro de associados | `memberships.associate_id` (por grupo; um associado adulto no máximo por acesso, e vice-versa), escolhido pelo administrador em `/usuarios`. Seções do chefe = seções das suas funções de escotista ativas (`associate_functions`: `kind = 'escotista'`, `section_id`, `ended_on` vazio ou futuro), calculadas na hora: mudou a função, mudam os avisos. Serve também para mostrar o nome no lugar do e-mail e, depois, para a vida escoteira de cada um |
| P8 | Cada módulo com papéis e rótulos próprios (Tesoureiro/Financeiro, Gestor/Chefe, Diretoria) e um administrador do grupo | Os cinco níveis acima em `memberships.finance_role`/`inventory_role`/`associates_role` (tipo `module_role`). Sem administrador do grupo: cada módulo tem os seus, que em `/usuarios` mudam só os seus módulos; quem fica sem acesso a todos sai do grupo. Ligar o acesso ao associado é do administrador do Associados |

Testes: pgTAP das permissões por papel (finance/associates/inventory), e2e com um usuário de cada perfil da tabela.

## 2. Importação de associados (CSV)

Só CSV. Os dados vêm dos Docs 10, 13, 14 e 22 e de planilhas ainda por criar, então o formato precisa aceitar colunas
novas sem mudar código.

Proposta: **três arquivos**, cada um com modelo para baixar na tela (Associados › Configurações › Importar), que já
existe hoje só com nome/ramo/seção/patrulha/status (`lib/associates/import.ts`).

1. **Pessoas**: nome, apelido, nascimento, ramo, seção, patrulha, entrada, promessa, registro
   (provisório/definitivo), situação (ativo/desligado com data), função (tipo, cargo, seção, início, eleito).
   Chave para não duplicar: nome + nascimento.
2. **Responsáveis**: nome do jovem (+ nascimento), nome do responsável, parentesco, legal, financeiro, e se o
   responsável é associado.
3. **Controle (Doc 22)**: uma linha por pessoa, uma coluna por item de controle (nome do item como no cadastro); os
   códigos da planilha viram situações (NÃO → pendente, OK → ok, DESAT./ANTIGA → desatualizado, VER/TEM? → a verificar,
   CONV. → convidado, XXX → não se aplica; anos e datas nos itens de valor ano/data). Item novo = coluna nova, sem código
   novo, desde que o item exista em Configurações › Itens.

Comum aos três:
- Pré-visualização com o que entra, o que muda e os erros por linha antes de gravar (como a importação de OFX).
- Repetível: reimportar atualiza, não duplica.
- Grava por funções SQL auditadas; roda no app, contra qualquer banco (vale para produção).
- Os CSVs são dados do grupo (com menores): nunca no repositório nem nos testes; os testes usam nomes fictícios.

**A decidir:** se o Doc 13/14 trazem algo além de nascimento e promessa (devem sair do arquivo de pessoas).

## 3. Importação do inventário (CSV)

Só CSV, com os materiais e as **quantidades contadas em 2025 e 2026**, para que em 2027 a conferência parta dessas
contagens e ajuste os itens.

- Hoje existe só a carga de desenvolvimento (`scripts/inventory/planilha-para-csv.mjs` + `importar-planilha.mjs`), que
  apaga e recarrega o inventário e só roda no banco local.
- Proposta: importação na tela (Inventário › Configurações › Importar, só gestor), com o CSV no formato que o
  `planilha-para-csv.mjs` já gera (divisão, família, material, controle, condição, validade, valor, observação,
  contagem 2025, contagem 2026). Cria divisões, famílias, materiais e lotes; o saldo de cada lote = contagem de 2026;
  as duas contagens vão para `inventory_counts` (`inventory_record_count`).
- Primeira carga: só com o inventário vazio (sem movimentos), para não misturar com registros feitos no app. Depois,
  as mudanças entram pelo app e pela conferência de 2027.
- Pré-visualização e erros por linha, como em Associados.

## 4. Vida escoteira (tempo de atividade)

Objetivo: registrar, de forma relativamente manual, a linha do tempo de cada pessoa para contar os anos de atividade.
Referência: uma planilha com uma linha do tempo por pessoa, com datas e células pintadas que representam a contagem
(ver com o Diretor-presidente antes de modelar).

Rascunho para discutir:
- **Períodos**: por pessoa, início e fim (ou só o ano), tipo (jovem num ramo, adulto numa função, afastamento), onde
  (este grupo ou outro, texto livre) e se conta para o tempo de atividade. Pode haver períodos antes da entrada no
  grupo.
- **Sugestão automática**: o que o app já sabe (entrada e saídas em `associate_movements`, passagens em
  `associate_moves`, funções de adulto) aparece como período sugerido; a diretoria confirma ou corrige. O resto é
  manual.
- **Contagem**: anos de atividade = soma dos períodos que contam, pela regra combinada (ex.: ano conta se ...).
- **Telas**: linha do tempo no perfil (anos em colunas, células pintadas como na planilha), edição dos períodos;
  relatório do grupo; aviso no Início para quem completa anos de atividade.
- **Importação**: a planilha atual entra pelo CSV (seção 2), como um quarto arquivo de períodos, ou um ano por coluna.

Perguntas para quando olharmos a planilha:
1. A unidade é o ano (célula por ano) ou períodos com datas? Meio ano conta?
2. O que significa cada cor?
3. Qual a regra oficial de contagem (UEB) e para que ela serve (distintivo de tempo de atividade, homenagens)?
4. Conta tempo em outros grupos? E afastamentos (licença, intercâmbio)?
5. Quem lança e quem confere?
