-- Papéis do cluster (existem fora do banco, por isso ficam à parte e são idempotentes). Ver db/README.md.
--   authenticated  usuário logado: RLS e funções auditadas (`auth.uid()` lê `request.jwt.claims`).
--   anon           sem sessão: nenhum acesso.
--   geas_auth      login e sessões: só as tabelas de `auth`.
-- O papel de login do app (`geas_app`, NOINHERIT) é criado por ambiente e recebe estes papéis no `migrate`.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'geas_auth') then create role geas_auth nologin; end if;
end $$;
