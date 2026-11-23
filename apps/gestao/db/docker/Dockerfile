# Postgres local (dev, testes e CI): a mesma versão do Azure Database for PostgreSQL, com pgTAP e pg_prove.
FROM postgres:17-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-17-pgtap libtap-parser-sourcehandler-pgtap-perl \
  && rm -rf /var/lib/apt/lists/*
