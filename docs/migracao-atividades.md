# Migração: construtor-de-atividades → Gestão

Status: **fase 2 em andamento** (editor de cronograma no detalhe). Origem: `BACKUP/construtor-de-atividades` (Azmut, Vite + Convex).

## Decisões

| Tema | Decisão |
|---|---|
| Módulo | `/atividades/...` em `apps/gestao`, `data-app="atividades"` |
| Backend | Postgres + RLS + funções auditadas (padrão inventário); **sem Convex** |
| Auth | Mesmo login/memberships do Gestão (`@escoteirosalbert.com.br`) |
| Papel | `memberships.activities_role`: `manager` \| `chief` \| `viewer` (admin do grupo = manager) |
| Inventário Azmut | **Fora do escopo** — usar o inventário do Gestão quando precisar de materiais |
| Biblioteca/audiolivro | Fase posterior (estático, sem DB) |

## Escopo por fase

### Fase 1 (núcleo) — atual
- Shell do módulo (marca, header, rotas)
- Tabelas: `activity_venues` (locais), `activity_youth` (lobinhos), `activity_base` (base de jogos), `activities` (+ cronograma JSONB, autorização JSONB, presença)
- Calendário + CRUD básico de atividade
- Locais e base de atividades (listas simples)

### Fase 2
- Editor de cronograma (arrastar, duração, encadear horários)
- Autorização + checklist de segurança + impressão/PDF
- Presença ligada a `activity_youth`
- Progressão lobinho (`activity_youth.progress` + variáveis alternativas)

### Fase 3
- Plano de Grupo (conteúdo estático + vínculo nas atividades)
- Biblioteca / audiolivro
- Ligação de materiais do cronograma ao inventário do Gestão

## Estrutura-alvo

```
apps/gestao/
  app/(atividades)/atividades/
    page.tsx                 # Calendário (Resumo)
    [id]/                   # Detalhe / editar
    novo/
    locais/
    base/
    lobinhos/
  components/activities/
  lib/activities/            # domínio puro
  lib/server/activities/     # única leitura/escrita do DB
supabase/migrations/040_activities.sql
```

## Fora de escopo nesta migração
- Copiar `main.js` / `index.html` monólitos
- Manter Google OAuth / Convex Auth
- Duplicar o inventário flat do Azmut
