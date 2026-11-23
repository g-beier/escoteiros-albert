# syntax=docker/dockerfile:1.7
# Imagens do Gestão para o Azure (linux/amd64). Contexto = raiz do monorepo (lockfile e packages/ui):
#   docker build --platform linux/amd64 -f apps/gestao/Dockerfile --target app -t gestao .
#   docker build --platform linux/amd64 -f apps/gestao/Dockerfile --target job -t gestao-job .
# `app`: servidor Next (output standalone), usuário não root, porta 3000.
# `job`: manutenção do banco (scripts/maintenance.mjs: papel do app, migrations, primeiro administrador, dump).
# NEXT_PUBLIC_* entram no build (são lidas no navegador): mudar um toggle exige nova imagem.

ARG NODE_IMAGE=node:24-bookworm-slim

# Dependências de produção e de build do Gestão (e do @geas/ui), a partir do lockfile.
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/gestao/package.json apps/gestao/
COPY apps/institucional/package.json apps/institucional/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspace=@geas/gestao --include-workspace-root=false --ignore-scripts --no-audit --no-fund

FROM deps AS build
COPY packages/ui packages/ui
COPY apps/gestao apps/gestao
ARG NEXT_PUBLIC_SITE_URL=https://escoteirosalbert.com.br
ARG NEXT_PUBLIC_FEATURE_ATTACHMENTS=
ARG NEXT_PUBLIC_FEATURE_FILHOTES=
ENV NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
  NEXT_PUBLIC_FEATURE_ATTACHMENTS=${NEXT_PUBLIC_FEATURE_ATTACHMENTS} \
  NEXT_PUBLIC_FEATURE_FILHOTES=${NEXT_PUBLIC_FEATURE_FILHOTES}
RUN npm run build --workspace=@geas/gestao

FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000 \
  NODE_OPTIONS=--max-old-space-size=512
WORKDIR /app
# o servidor muda para apps/gestao (process.cwd()): public/ e assets/fonts (PDFs) ficam ao lado dele
COPY --from=build --chown=node:node /repo/apps/gestao/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/gestao/.next/static ./apps/gestao/.next/static
COPY --from=build --chown=node:node /repo/apps/gestao/public ./apps/gestao/public
COPY --from=build --chown=node:node /repo/apps/gestao/assets/fonts ./apps/gestao/assets/fonts
USER node
EXPOSE 3000
CMD ["node", "apps/gestao/server.js"]

# Só as dependências de produção, para o Job (postgres e @azure/*).
FROM deps AS job-deps
RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspace=@geas/gestao --include-workspace-root=false --ignore-scripts --no-audit --no-fund --omit=dev

FROM ${NODE_IMAGE} AS job
# pg_dump da mesma versão do servidor (17), do repositório oficial do PostgreSQL
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates postgresql-common \
  && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /job
COPY --from=job-deps /repo/node_modules ./node_modules
COPY apps/gestao/scripts/db.mjs apps/gestao/scripts/maintenance.mjs ./scripts/
COPY apps/gestao/db/migrations ./db/migrations
USER node
ENTRYPOINT ["node", "scripts/maintenance.mjs"]
CMD ["status"]
