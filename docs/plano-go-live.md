# Plano até colocar o Gestão no ar

Revisto em 2026-11-23 com o Diretor-presidente. Junta o que falta antes da produção; os planos por módulo
(`apps/gestao/BACKLOG.md`, `apps/gestao/docs/inventario/BACKLOG.md`, `apps/gestao/docs/associados/plano.md`) seguem
valendo para o que fica depois. Infra e Azure: `.azure/deployment-plan.md`.

## Ordem

1. **Papéis** (seção 1): feito.
2. **Importação de associados por CSV** (seção 2): feito.
3. **Importação do inventário por CSV** (seção 3): feito.
4. **Vida escoteira** (seção 4): feito, com a importação (009) e os avisos de estrela aos chefes no Início (026).
5. **Ir ao ar** (seção 5): tela de consentimento do Google (página `/privacidade` pronta), Azure, domínio
   `gestao.escoteirosalbert.com.br`, carga real pelos CSVs, uso pela diretoria em paralelo às planilhas.
6. **Antes da contagem de 2027**: conferência anual no Inventário (Passo 4 do backlog do inventário; a folha impressa
   já existe).

Entrou também, fora da lista (2026-11-26): ações em lote, importação, agrupamento de lançamentos e papel Administrador
no Financeiro (012–015), situações de controle que seguem o público (016), edição em lote, ordem manual e folha de
conferência no Inventário (011, 017), exclusão de associados com quarentena de 60 dias (018).

Em 2026-11-27: avisos do Início só das seções do escotista com acesso ao Associados (abas "<seção>" | "Grupo todo"),
Lojinha (019–021: lote à venda com preço, vendido pelo lançamento do Financeiro com baixa no estoque), Devedores como
conta a receber por associado (022–025: linhas de dívida por rubrica, venda fiada, mensalidade não paga, pagamento
parcial, acordo na conta), estrelas de atividade aos chefes sem acesso ao Associados e escrita em `associates` só pelas
funções auditadas (026).

Fora por ora: módulo Ações (rascunho `apps/gestao/docs/acoes/modelo.md` só no branch local `acoes/modelo`, commit `bae1171`),
papel Secretaria/bloqueio da tesouraria no Associados, empréstimos, registro UEB e integrações financeiras.

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

Ajuste de P3 (027, 2026-11-27): quem lê o Financeiro também lê a tabela `associates` (nomes nos lançamentos,
mensalidades e devedores), mesmo sem acesso ao Associados; as demais tabelas do Associados continuam fechadas.

Testes: pgTAP das permissões por papel (finance/associates/inventory), e2e com um usuário de cada perfil da tabela.

## 2. Importação de associados (CSV)

**Feito (2026-11-24, branch `feat/importacao-csv`, migrations 006–010):** contrato único de CSV para todos os módulos
em `apps/gestao/docs/importacao.md` (a conversão das planilhas é feita por fora, à mão ou com IA, seguindo o contrato) e
tela comum `/importar` com pré-visualização e gravação numa transação (`import_batch`). Arquivos: `secoes`,
`itens-controle`, `pessoas`, `funcoes`, `responsaveis`, `controle`, `vida-escoteira`, `inventario-lotes` e
`inventario-pecas`, cada um com "Dados atuais" no mesmo formato. A proposta abaixo foi a base do contrato.

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

**A decidir:** se o Doc 13/14 trazem algo além de nascimento e promessa (devem sair do arquivo de pessoas). Decidir ao
converter as planilhas reais (seção 5).

## 3. Importação do inventário (CSV)

**Feito (2026-11-24, migration 010):** `inventario-lotes.csv` (com colunas `contagem AAAA`) e `inventario-pecas.csv` em
`/importar`, carga com substituição enquanto o inventário só tem movimentos importados. `planilha-para-csv.ts` já
gera o formato do contrato; `importar-planilha.mjs` saiu. Texto original abaixo.

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

Feito em 2026-11-24 (migration `004_vida_escoteira.sql`), depois de ver a planilha de linha do tempo (uma linha por
pessoa, um mês por célula, células pintadas na cor do ramo ou azul para os voluntários, a contagem de anos no
aniversário). Modelo em `apps/gestao/docs/associados/modelo.md` (Vida escoteira).

Decisões:
- A contagem começa na **promessa** (não na entrada). Lacunas pausam a contagem; reingressos depois da promessa abrem
  novos períodos. Tempo em outros grupos conta (campo "outro grupo").
- Contam jovens e adultos **escotistas ou dirigentes**; honoríficos e outras funções não (o cinza da planilha).
- Estrela a cada 12 meses de atividade, no ramo com mais atividade nesses 12 meses, sem janeiro e fevereiro (férias);
  o ramo pode ser corrigido à mão.
- Aviso de entrega 15 dias antes, que fica até marcar "certificado entregue"; a entrega quita as estrelas anteriores.
- Quem controla: Diretoria de Métodos Educativos (Editor do Associados).
- Períodos passados são livres; só o vigente acompanha o cadastro sozinho (passagem, desligamento, reingresso, funções).
- Eventos do histórico com data (Cruzeiro do Sul, Lis de Ouro…) e anotações sem data.
- Linhas muito longas num ramo na planilha são históricos perdidos, a resgatar.

Importação: `vida-escoteira.csv` em `/importar` (migration 009; cores da planilha → linhas `período`, convertidas por
fora seguindo `apps/gestao/docs/importacao.md`). Avisos de estrela aos chefes no Início (026): o chefe sem acesso ao
Associados vê as estrelas a entregar dos jovens das suas seções, como os aniversários e as transições
(`associates_section_star_rows`, só os dados que a conta usa).

## 5. Ir ao ar

Passos e estado em `.azure/deployment-plan.md` (etapa 1 feita; etapas 2 a 5 pendentes, nada criado no Azure).

- **Azure:** ativar o crédito Nonprofit, login, conferir assinatura, políticas e cotas (etapa 2); provisionar (etapa 3);
  homologar com dados fictícios e testar o restore do backup (etapa 4); corte (etapa 5).
- **Google:** publicar a tela de consentimento OAuth (página `/privacidade` pronta).
- **Domínio:** `gestao.escoteirosalbert.com.br`, certificado, CORS do Blob.
- **Carga real:** `npm run associates:csv` e `inventory:csv` nas planilhas do grupo, vida escoteira e lançamentos
  convertidos seguindo `apps/gestao/docs/importacao.md`, conferidos na pré-visualização de `/importar`. Os CSVs nunca
  entram no repositório.
- **Antes do corte:** cobrir com testes os ajustes da etapa 0 (troca de conta no recadastro, renovação do cookie,
  redirects com `appUrl()`), que entraram sem testes.

Perguntas em aberto: quem administra o DNS de `escoteirosalbert.com.br`; quem é o contato principal do crédito
Nonprofit; movimentações de material por ano.
