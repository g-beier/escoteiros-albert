# Azure Deployment Plan

> **Status:** Planning

Generated: 2026-11-21, revisado com estimativa de uso. Elaborado **sem login no Azure**, a pedido do usuário.
Escopo atual (usuário, 2026-11-22): **só ajustes do projeto de desenvolvimento, sem testes**. Não existe produção e
todos os dados começam em 2027. Etapas 1 em diante não estão aprovadas. Nada criado no Azure.
Versão para os voluntários: `docs/estimativa-azure.md`.

## 1. Project Overview

**Goal:** colocar `apps/gestao` em produção no Azure (fase 2 de `docs/migracao-saida-supabase.md`).

**Path:** Modernize Existing. Fora do escopo: `apps/institucional` (FTP manual).

**Resumo:** custo de ~US$ 64/mês (~US$ 765/ano, 38% do crédito de US$ 2.000), quase todo fixo. O volume de uso
praticamente não muda a conta. O que consome cota é o tempo com réplica ligada, não o número de requisições.

## 2. Requirements

| Atributo | Valor | Origem |
|---|---|---|
| Classificação | Produção, uso interno, econômica | usuário, 2026-11-21 |
| Escala | Pequena, 0–1 réplica | usuário, 2026-11-21 |
| Região | `brazilsouth` | usuário, 2026-11-21 |
| Rede | Privada (VNet própria, Postgres sem endereço público) | usuário, 2026-11-21 |
| Volume âncora | ~1.000 lançamentos/ano, 80 associados (150 pessoas com responsáveis), 1.300 linhas de inventário, até 20 usuários | usuário, 2026-11-21 e 22 |
| Orçamento | Dentro do crédito Nonprofit (renovação manual anual) | já decidido |
| Início dos dados | 2027, sem histórico nem migração de dados | usuário, 2026-11-22 |
| Dados | Pessoais, inclusive de menores; financeiros do grupo | código |
| Assinatura | A confirmar | depende de login |

### Policy Constraints

Não consultadas (sem login). Reavaliar a arquitetura se houver negação de região, SKU ou tipo de recurso.

## 3. Components Detected

| Componente | Tipo | Tecnologia | Caminho |
|---|---|---|---|
| gestao | SSR Web App | Next.js 16, Node 24 | `apps/gestao` |
| ui | biblioteca interna | React, TS sem build | `packages/ui` |
| banco | relacional | PostgreSQL 17, RLS | `apps/gestao/db` |
| comprovantes | arquivos (toggle desligado) | Blob Storage | `apps/gestao/lib/server/files.ts` |

## 4. Estimativa de uso (revisão 2, 2026-11-22)

Premissas, cenários e tabela por módulo: `docs/estimativa-azure.md`. Aqui, só o que afeta a engenharia.

### 4.1 Medido

Build standalone isolado, Chromium, Postgres 17 em WASM como superusuário, 5 anos sintéticos nos volumes do grupo, Mac M4.

| Métrica | Valor |
|---|--:|
| HTTP por tela, sem rolar | média 49 (27 a 72) |
| **Materiais rolado até o fim (1.300 linhas)** | **1.293 HTTP, 1,89 s de CPU** |
| **Movimentações rolado até o fim (1.000 no ano)** | **1.838 HTTP, 2,66 s de CPU** |
| Idem com `prefetch={false}` nos links de linha (só na cópia de medição) | 19 e 49 HTTP; 0,22 e 0,27 s |
| 20 requisições simultâneas, heap de 512 MB | 460 em 77 s, zero falhas, pico 568 MB |
| Sem limite de heap (medição anterior) | pico 1.046 MB |
| Banco | 14,7 MB + ~4,3 MB/ano (36,3 MB em 5 anos) |

### 4.2 Depois de desligar o prefetch (aplicado em 2026-11-22)

Contado no servidor (as contagens de 4.1 incluíam estáticos vindos do cache do navegador).

| Cenário | Antes | Depois |
|---|--:|--:|
| Sessão de 12 telas, navegador com cache | 317 | 15 |
| Sessão de 12 telas, primeira visita | 347 | 47 |
| Materiais rolado | 1.267 | 1 |
| Movimentações rolado | 1.840 | 11 |
| HTTP por mês (base) | ~259 mil | ~3.200 |

### 4.3 Outras medidas (2026-11-22)

Aplicadas e medidas na cópia isolada:
- **Compressão RSC:** `instrumentation.ts` + `lib/server/response-compression.ts` juntam os `flush` em 50 ms. Materiais por clique
  673 → 90 kB; sessão de 12 telas 1.273 → 403 kB; streaming preservado. Reconferir ao atualizar o Next.
- **`router.refresh()` repetido:** 12 removidos (10 conferidos no navegador; 2 são de comprovantes, com toggle desligado).
- **Logo e ícones:** importados, `immutable` por 1 ano; `/favicon.ico` 1 ano.

Não aplicadas: `staleTimes` (dado velho no financeiro), cache de páginas (RLS por pessoa), paginação de Materiais.

Inventário não tem importação em produção (`importar-planilha.mjs` é só local): ~43 h de digitação ou um importador.

### 4.5 Custo fixo

| Item | US$/mês |
|---|--:|
| Postgres B1ms | 25,55 |
| Load balancer do ambiente em VNet | 18,25 |
| 2 IPs públicos do ambiente | 7,30 |
| Disco de 32 GB | 6,99 |
| Container Registry Basic | 5,07 |
| DNS privado | 0,50 |
| **Total** | **63,66** |

Não inclui impostos, câmbio nem plano de suporte (o crédito não paga suporte).

## 5. Recipe e arquitetura

**Selected:** AZD (Bicep). **Stack:** Containers.

| Componente | Serviço | Dimensionamento |
|---|---|---|
| gestao | Container Apps, workload profiles, perfil Consumption | **0,5 vCPU / 1 GiB**, `--max-old-space-size=512`, 0–1 réplica |
| migrations e manutenção | Container Apps Job manual, imagem própria | 0,25 vCPU / 0,5 GiB, por execução |
| banco | PostgreSQL Flexible 17 | B1ms, 32 GB, sem HA, backup 7 dias, pool 5 |
| comprovantes | StorageV2 | Standard LRS, sem chave compartilhada |
| imagem | Container Registry | Basic, sem pull anônimo; versões antigas apagadas à mão (retenção automática só no Premium) |
| segredos | Key Vault | Standard, purge protection |
| observabilidade | Log Analytics (Application Insights quando o app tiver instrumentação) | teto de 0,15 GB/dia, sem dados pessoais |
| identidades | Managed Identity | uma do app e uma do Job: só o Job lê a credencial de administrador do banco |
| rede | VNet `10.20.0.0/24` | `/27` Container Apps, `/28` Postgres, zona DNS privada |

Não usar 0,5 GiB: o processo já passa disso com heap limitado. Réplica máxima 1 limita o custo de computação (não o de tráfego e requisições).

### Consequências da rede privada

- Os passos 2, 3, 4 e 8 de `apps/gestao/db/README.md` (feitos "de uma máquina com acesso") passam a ser Job:
  criar `geas_app`, migrations, primeiro administrador, dump.
- O site não lê o banco no build: exportar em "Exportar para o site" e buildar com `TRANSPARENCY_SKIP=1`.
- Sem carga histórica: dados de 2027 entram pelo próprio app (cadastros, CSV de associados, OFX, saldos em 01/01/2027).

### Riscos

| Risco | Resposta |
|---|---|
| B1ms indisponível em brazilsouth (tabela da Microsoft ambígua) | **maior risco de custo:** conferir na etapa 2. D2s v3 em São Paulo = US$ 206,84/mês (124% do crédito); B1ms em eastus2 = US$ 47,31 (também a confirmar, dados fora do país). Alternativas no Brasil e ordem de decisão: `docs/azure-alternativas-banco.md` (plano por `POSTGRES_SKU`/`POSTGRES_TIER` no azd). Decisão do usuário |
| Robôs impedem escala a zero | alerta de horas ligado; teto já calculado (+US$ 34,52/mês) |
| Partida a frio de vários segundos (não medida no Azure) | medir na etapa 4; réplica mínima 1 é alternativa paga |
| PDF e Início mais lentos em 0,5 vCPU | medir na etapa 4 |
| Crédito vence em 12 meses e cobra no cartão | orçamento de US$ 90/mês com alertas em 80% e 100%; lembrete 30 dias antes |
| Subnet não muda depois | tamanhos acima já comportam 0–1 réplica com folga |
| Um único servidor, sem HA | restore ensaiado antes do corte; indisponibilidade aceita |

## 6. Provisioning Limit Checklist

O template exige esta tabela completa antes da aprovação final. Sem login ela fica pendente e bloqueia a etapa 3.

| Resource Type | Number to Deploy | Total After Deployment | Limit/Quota | Notes |
|---|--:|---|---|---|
| Microsoft.App/managedEnvironments | 1 | pendente | pendente | etapa 2 |
| Microsoft.App/containerApps | 1 | pendente | pendente | etapa 2 |
| Microsoft.App/jobs | 1 | pendente | pendente | etapa 2 |
| Microsoft.DBforPostgreSQL/flexibleServers | 1 | pendente | pendente | etapa 2: B1ms na região |
| Microsoft.Storage/storageAccounts | 1 | pendente | pendente | etapa 2 |
| Microsoft.ContainerRegistry/registries | 1 | pendente | pendente | etapa 2 |
| Microsoft.KeyVault/vaults | 1 | pendente | pendente | etapa 2 |
| Microsoft.ManagedIdentity/userAssignedIdentities | 2 | pendente | pendente | etapa 2 |
| Microsoft.OperationalInsights/workspaces | 1 | pendente | pendente | etapa 2 |
| Microsoft.Insights/components | 1 | pendente | pendente | etapa 2 |
| Microsoft.Network/virtualNetworks | 1 | pendente | pendente | etapa 2 |
| Microsoft.Network/privateDnsZones | 1 | pendente | pendente | etapa 2 |
| Microsoft.Network/loadBalancers | 1 | pendente | pendente | criado pela plataforma |
| Microsoft.Network/publicIPAddresses | 2 | pendente | pendente | criados pela plataforma |

## 7. Execution Checklist

### Planejamento
- [x] Analisar workspace, escanear código, escolher receita
- [x] Confirmar requisitos, região e rede
- [x] Estimar uso e dimensionar
- [x] Instalar `az` e `azd`
- [x] **Usuário aprova etapa 0**
- [ ] **Usuário aprova etapa 1**
- [ ] **Usuário aprova o plano final (após etapa 2)**

### Etapa 0: ajustes de desenvolvimento (aprovada em 2026-11-22, sem testes)
- [x] Validação do destino depois do login
- [x] Troca de conta Google no recadastro (`001_schema.sql`)
- [x] Renovar o cookie de sessão
- [x] `.env.example`, BACKLOG, `db/README.md` para rede privada
- [x] Commit e push da branch
- [ ] PR e CI (quando o usuário pedir); combinar o rebase do PR #4

Nenhum teste foi escrito nem executado para estes ajustes, por decisão do usuário.

### Ajustes de desenvolvimento propostos (aguardam o usuário)
- [x] `Link` sem prefetch em todo o app (`packages/ui/src/components/link.tsx`) e cache de `public/`
- [x] Compressão RSC, `router.refresh()` duplicado, cache de 1 ano de logo e ícones
- [ ] Paginação de Materiais (só se ficar lento)
- [ ] Importador da planilha de inventário que sirva para produção

### Etapa 1: preparar artefatos (feita em 2026-11-22, sem login)
- [x] `output: "standalone"` e Dockerfile linux/amd64 com estáticos, `public` e fontes, usuário não root (`apps/gestao/Dockerfile`, alvo `app`, 99,5 MB)
- [x] Imagem do Job: `db.mjs`, migrations, criação do papel, bootstrap e dump (alvo `job`, `scripts/maintenance.mjs`, hook `infra/hooks/job-image.sh`)
- [x] Redirects com `appUrl()` no lugar de `request.url` (atrás do proxy a origem muda; feito em 2026-11-22)
- [x] Identidade gerenciada do Blob com `AZURE_CLIENT_ID` (lido pelo `DefaultAzureCredential`; definido no Bicep)
- [x] `azure.yaml` e Bicep (`infra/`), `az bicep build` e `lint` sem avisos
- [x] Testar a imagem com 1 GiB e 0,5 CPU no Docker, como `geas_app`: 20 telas e os 3 PDFs, 460 requisições com 20 simultâneas em 28 s, todas 200, pico de 394 MiB, sem OOM. Job: `status`, `migrate`, `setup` (criar e trocar senha), `bootstrap` e `pg_dump` num banco descartável

**Pronto quando:** imagem roda sob os limites sem OOM e o Bicep compila.

Desvios: sem Application Insights (o app não tem instrumentação; logs só no Log Analytics). "Guardar 5 versões" no ACR
não existe no Basic (política de retenção é Premium): limpar à mão ou por script. Placeholder de imagem até o primeiro
`azd deploy` (porta 80; a do Gestão é 3000).

### Etapa 2: conferir a assinatura (exige login, ~1 h + esperas da Microsoft)
- [ ] Ativar o crédito; login; confirmar assinatura com o usuário
- [ ] Políticas, cotas (azure-quotas), capacidade do B1ms; completar a seção 6
- [ ] Aprovação final do plano

### Etapa 3: validar e provisionar (~meio dia)
- [ ] Status "Ready for Validation", depois azure-validate e `azd provision --preview`
- [ ] azure-deploy: orçamento e alertas, recursos, Job de banco, app

### Etapa 4: homologar com dados fictícios (~meio dia + 1 semana de observação)
- [ ] Login, um fluxo por módulo, os 3 PDFs
- [ ] Partida a frio, memória, horas ligado e requisições reais contra a seção 4
- [ ] Restore do backup em servidor temporário (custo pontual; pedir confirmação para criar e apagar)

### Etapa 5: corte (~1 dia)
- [ ] Domínio e certificado, OAuth publicado, CORS do Blob
- [ ] Banco vazio (apagar fictícios com confirmação), primeiro administrador, cadastros de 2027
- [ ] Conferir saldos de abertura em 01/01/2027; lembrete de renovação do crédito
- [ ] Revisar custo após 30 dias

Esforços são estimativas de trabalho, não prazos. Deploy pelo GitHub Actions fica fora: `CLAUDE.md` proíbe até haver autorização.

## 8. Files to Generate

| Arquivo | Etapa | Para quê |
|---|--:|---|
| `apps/gestao/Dockerfile`, `.dockerignore` | 1 | app e alvo do Job |
| `apps/gestao/next.config.ts` | 1 | standalone |
| `apps/gestao/scripts/` (manutenção) | 1 | papel, bootstrap, dump |
| `azure.yaml`, `infra/main.bicep` e módulos | 1 | azd e infraestrutura |

## 9. Next Steps

> Current: Planning, etapa 0 feita sem testes; etapa 1 em diante aguarda decisão do usuário.

Perguntas em aberto:
1. Movimentações de material por ano e frequência de acesso (hoje suposições).
2. Quem administra o DNS de `escoteirosalbert.com.br`.
3. Quem é o contato principal do crédito Nonprofit.
