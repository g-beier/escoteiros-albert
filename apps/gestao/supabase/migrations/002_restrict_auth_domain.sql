-- Configure esta função em Authentication > Hooks > Before User Created.
-- URI: pg-functions://postgres/public/restrict_auth_domain
create or replace function public.restrict_auth_domain(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  user_email text := lower(event->'user'->>'email');
begin
  if user_email is null or user_email !~ '^[^@]+@escoteirosalbert\.com\.br$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Acesso permitido somente para e-mails @escoteirosalbert.com.br.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.restrict_auth_domain(jsonb) to supabase_auth_admin;
revoke execute on function public.restrict_auth_domain(jsonb) from authenticated, anon, public;
