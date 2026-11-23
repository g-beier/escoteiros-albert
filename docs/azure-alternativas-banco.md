# Gestão GEAS: alternativas de banco no Azure (Brasil)

Avaliação técnica de 22/11/2026. Se o Postgres B1ms não estiver liberado em São Paulo, duas saídas cabem no crédito:
o Burstable v2 (B2ats_v2) em São Paulo, a cerca de US$ 64/mês, ou o B1ms no Rio (Brazil Southeast), a cerca de
US$ 74/mês. Antes delas, vale pedir à Microsoft a liberação do B1ms em São Paulo. Trocar o Postgres pelo Azure SQL
custaria menos (US$ 44 a 56/mês), mas exige semanas de reescrita: fica como última saída.

## Contexto

O plano A (Postgres Flexible B1ms em São Paulo, US$ 63,76/mês no total, 38% do crédito) depende de a Microsoft liberar
esse plano para a nossa assinatura. Isso só se confirma com login, na etapa 2 de `.azure/deployment-plan.md`.

O plano B atual (D2s v3, General Purpose) custa US$ 206,84/mês e passa do crédito anual de US$ 2.000 em US$ 482. Por
isso levantamos todas as opções de banco do Azure nas regiões do Brasil: São Paulo (`brazilsouth`) e Rio
(`brazilsoutheast`).

Restrições que valem para todas: PostgreSQL (o app depende de RLS, funções plpgsql e do schema `auth`), dados de
menores no Brasil e banco sem endereço público (rede privada).

## Opções no Brasil

Quatro opções ficam abaixo de 45% do crédito; as demais passam de 84%. O total soma o banco (computação + disco de
32 GB) e o resto da estrutura do plano, US$ 31,22/mês (balanceador, 2 IPs, DNS privado, ACR Basic e uso variável).

| # | Opção | Banco (US$/mês) | Total (US$/mês) | Por ano (US$) | Crédito | Situação |
|---|---|--:|--:|--:|--:|---|
| A | Flexible B1ms, São Paulo (1 vCore, 2 GiB) | 32,54 | 63,76 | 765 | 38% | plano A; liberação a confirmar |
| A2 | Flexible B2ats_v2, São Paulo (2 vCPU, 1 GiB) | 33,27 | 64,49 | 774 | 39% | preço publicado; nome do plano deduzido |
| A4 | Postgres em VM B1ms própria, São Paulo | ~29 | ~60 | ~717 | ~36% | viável, operação por nossa conta |
| A3 | Flexible B1ms no Rio, estrutura inteira lá | ~42,78 | ~74 | ~888 | ~44% | balanceador e IPs estimados |
| A5 | Cosmos DB for PostgreSQL, 1 vCore burstable | ~42 | ~73 | ~882 | ~44% | serviço a confirmar para projeto novo |
| C1 | Flexible B2s, São Paulo (2 vCore, 4 GiB) | 109,19 | 140,41 | 1.685 | 84% | cabe, mas consome quase todo o crédito |
| C2 | Flexible B2als_v2, São Paulo (2 vCPU, 4 GiB) | 112,11 | 143,33 | 1.720 | 86% | idem |
| C3 | Flexible D2ds_v5 com reserva de 1 ano | 112,32 | 143,54 | 1.722 | 86% | crédito provavelmente não paga reserva |
| B | Flexible D2s v3 (plano B atual) | 175,62 | 206,84 | 2.482 | 124% | passa do crédito |
| B2 | Flexible D2ds_v5 / D2ads_v5 | 182,19 | 213,41 | 2.561 | 128% | passa do crédito |

Referência fora do Brasil: B1ms em East US 2 sai por US$ 47,31/mês (28%), mas leva dados de menores para fora do país.

## Observações por opção

- **A2, Burstable v2 (B2ats_v2):** a tabela de preços de São Paulo já tem a série Bsv2 do Postgres Flexible (medidor
  "Batsv2", US$ 0,036/h). O nome do plano foi deduzido comparando com os preços das VMs da mesma série; falta
  confirmar no portal que ele existe para o Postgres. Tem 1 GiB de memória, metade do B1ms; o banco previsto tem
  36 MB em 2031, então deve bastar.
- **A3, Rio:** com rede privada, o banco precisa ficar na mesma região do app, então tudo muda para o Rio. O B1ms custa
  cerca de 30% mais (US$ 33,21) e o disco 37% mais (US$ 9,57 por 32 GB). Acima da franquia gratuita, o Container
  Apps custa 2,3 vezes mais, mas o uso previsto fica dentro dela. Os preços do balanceador e dos IPs no Rio não
  vieram da API; usamos os de São Paulo. O B1ms também pode estar bloqueado lá.
- **A4, VM própria:** VM B1ms (US$ 24,53) com disco Standard SSD de 32 GB (US$ 4,48); dispensa o DNS privado. Fica
  alguns dólares mais barato, mas o grupo passa a cuidar de atualizações do sistema, backup, TLS e troca de versão do
  Postgres. Para voluntários, desaconselhado.
- **A5, Cosmos DB for PostgreSQL:** nó único burstable de 1 vCore (US$ 27,96) com 32 GiB (US$ 7,01), mais um private
  endpoint (cerca de US$ 7,30). A Microsoft não indica esse serviço para projetos novos, até onde sabemos; confirmar.
- **C1 a C3:** cabem no crédito, mas comem a maior parte dele. A reserva de 1 ano do C3 custa US$ 1.264 adiantados;
  créditos de patrocínio costumam não pagar reservas, e a de 3 anos (cerca de 65% do crédito) prenderia o grupo além
  da renovação anual do crédito.

## Descartadas

| Opção | Por que não |
|---|---|
| Azure SQL Database ou MySQL | sem reescrita, não servem (avaliadas na seção seguinte): exigem reescrever a RLS, as funções SQL e o schema `auth` |
| Postgres dentro do Container Apps com Azure Files | não suportado, risco de corromper o banco, não escala a zero |
| Azure HorizonDB | serviço novo, US$ 0,35 por vCore-hora em São Paulo: mais de US$ 250/mês com 1 vCore |
| Single Server | aposentado, embora ainda apareça na tabela de preços |
| Franquia grátis do Flexible (750 h de B1ms) | só para contas gratuitas novas; a assinatura Nonprofit provavelmente não tem direito |

## Alternativa: abrir mão da rede privada

Sem rede privada, o ambiente do Container Apps deixa de ter balanceador e IPs gerenciados, e o DNS privado sai:
economia de cerca de US$ 26/mês. O banco ficaria acessível pela internet, protegido por firewall, TLS e senha.

- C1 (B2s) cairia para cerca de US$ 114/mês (69% do crédito).
- O D2s v3 cairia para cerca de US$ 181/mês, ainda acima do crédito.

É uma troca de segurança: a decisão atual é manter o banco sem endereço público.

## Trocar o Postgres por outro banco do Azure

A única troca que faz sentido é para o Azure SQL Database: custa de US$ 44 a US$ 56/mês no total (27% a 34% do crédito)
e não depende da liberação da série B. A economia sobre o plano A, de US$ 7 a US$ 19/mês, não paga semanas de
reescrita; vale como saída se nenhuma opção Postgres no Brasil for liberada.

| Opção | Banco (US$/mês) | Total (US$/mês) | Por ano (US$) | Crédito | Reescrita |
|---|--:|--:|--:|--:|---|
| Azure SQL Basic (5 DTU, até 2 GB) | 13,23 | 44,45 | 533 | 27% | grande (T-SQL) |
| Azure SQL S0 (10 DTU, até 250 GB) | 25,11 | 56,33 | 676 | 34% | grande (T-SQL) |
| Azure SQL S1 (20 DTU) | 42,92 | 74,14 | 890 | 44% | grande (T-SQL) |
| Azure SQL serverless com oferta gratuita | ~7 a ~22 | ~39 a ~54 | ~460 a ~640 | 23% a 32% | grande (T-SQL) |
| Azure SQL serverless sem oferta (0,5 vCore, ~86 h ativas) | ~51 | ~82 | ~985 | ~49% | grande (T-SQL) |
| MySQL Flexible B1s (1 vCore, 1 GiB, 20 GB) | 17,15 | 48,37 | 580 | 29% | grande + modelo de segurança novo |
| MySQL Flexible B1ms | 29,92 | 61,14 | 734 | 37% | idem |
| Cosmos DB NoSQL serverless | ~9 | ~40 | ~485 | ~24% | total (modelo de documentos) |

O Azure SQL entra na rede privada por private endpoint (cerca de US$ 7,30/mês, já somado); o MySQL, como o Postgres,
pela sub-rede delegada.

### O que teria de ser reescrito

O banco atual concentra a regra de negócio: `001_schema.sql` tem 6.623 linhas, 42 tabelas, 188 funções (170
`security definer`), 41 políticas de RLS, 13 views, 24 enums e 379 usos de `jsonb`. Somam-se 2.776 linhas de testes
SQL (pgTAP) e 3.497 linhas da camada `lib/server`.

- **Azure SQL:** tem RLS (security policies com `SESSION_CONTEXT` para o usuário), procedures, CTE recursiva e JSON.
  Seria traduzir as 188 funções para T-SQL, trocar enums por tabelas ou checks, trocar o driver (`postgres` → `mssql`),
  refazer os testes (pgTAP → tSQLt) e a infra local (imagem SQL Server só amd64, emulada no Mac). Semanas de
  trabalho, com risco de regressão no financeiro.
- **MySQL:** não tem RLS. A autorização sairia do banco para o app, quebrando a regra "nenhum caminho ignora a RLS".
  Não recomendado.
- **Cosmos DB NoSQL:** banco de documentos, sem junções nem transações entre partições. Lançamentos, conciliação e
  relatórios são relacionais: seria reescrever o modelo inteiro. Não recomendado.

### Pontos de atenção do Azure SQL

- **Basic (5 DTU)** é o mais barato, mas fraco: telas como Início e os PDFs precisariam de medição. O S0 dá folga com
  custo ainda abaixo do plano A.
- **Oferta gratuita** (serverless, 100 mil vCore-segundos e 32 GB por mês): cobre cerca de 56 h com 0,5 vCore. Com a
  pausa automática de no mínimo 15 min, o uso previsto passa disso (~86 h); o excedente custa US$ 0,99 por vCore-hora
  em São Paulo. Falta confirmar se a assinatura Nonprofit tem direito.
- **Serverless pausado** leva cerca de 1 min para voltar, somado à partida a frio do app. Os planos DTU (Basic, S0)
  ficam sempre ligados.
- O Azure SQL também pode exigir pedido de acesso à região para assinaturas novas; confirmar na etapa 2.

## Ordem de decisão na etapa 2 (com login)

Cada passo só entra se o anterior não resolver.

1. Listar os planos do Postgres liberados para a assinatura: `az postgres flexible-server list-skus --location brazilsouth`.
2. Se o B1ms estiver bloqueado, pedir a liberação no portal, em Cotas › Acesso à região (gratuito).
3. Ver se o B2ats_v2 (A2) aparece na mesma lista; se sim, usá-lo.
4. Repetir os passos 1 a 3 para `brazilsoutheast`; se o B1ms estiver liberado lá, mudar a estrutura inteira para o Rio (A3).
5. Só então levar à diretoria: C1 (B2s, 84% do crédito, sem reescrita), a reserva C3 (se o crédito pagar reservas) ou o
   Azure SQL S0 (34%, com reescrita). Dá para começar com C1 e migrar para o Azure SQL depois, se a reescrita for aprovada.

Trocar o plano não mexe no código: são as variáveis `POSTGRES_SKU` e `POSTGRES_TIER` do azd (padrão `Standard_B1ms` /
`Burstable`, em `infra/main.parameters.json`). Trocar a região é `AZURE_LOCATION`.

## Base de cálculo

- Preços de varejo em dólar, pagamento por uso, consultados em 22/11/2026 na API pública de preços do Azure
  (`https://prices.azure.com/api/retail/prices`) para `brazilsouth`, `brazilsoutheast` e `eastus2`; mês de 730 h.
  Sem impostos, IOF nem câmbio.
- Disco do banco: 32 GB a US$ 0,2185/GB em São Paulo e US$ 0,299/GB no Rio. Backup de 7 dias incluído até o tamanho
  do disco.
- Azure SQL em São Paulo: Basic US$ 0,1948/dia, S0 US$ 0,5855/dia, S1 US$ 1,171/dia, serverless US$ 0,99134 por
  vCore-hora; private endpoint estimado em US$ 0,01/h. MySQL B1s US$ 0,0175/h (mínimo de 20 GB de disco). Cosmos DB
  serverless US$ 0,375 por milhão de RU e por GB.
- Reservas do Postgres (General Purpose) em São Paulo: US$ 632 por vCore por ano (1 ano) e US$ 1.263 por vCore (3 anos).
- "Liberado" significa disponível para a nossa assinatura. A tabela de preços só mostra que o plano existe na região,
  não que ele está liberado para nós.
- Estrutura e custo do plano A: `.azure/deployment-plan.md`, `docs/estimativa-azure.md` e
  `docs/azure-estrutura-e-custos.pdf`.
