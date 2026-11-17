-- Histórico de alterações de um lançamento, para a página de detalhes.
-- audit_events continua legível só por administradores (003); esta função entrega a qualquer membro
-- do grupo apenas os eventos daquele lançamento: criação, edições (com antes/depois, inclusive rateios),
-- documentos, conta, fora do extrato e vínculos de conciliação que o incluem.
-- O e-mail de quem fez vem de auth.users (o grupo já vê os colegas em Usuários).

create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id);

create or replace function public.ledger_entry_history(p_entry_id uuid)
returns table (id bigint, created_at timestamptz, action text, actor_email text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare entry_group uuid;
begin
  select e.group_id into entry_group from public.ledger_entries e where e.id = p_entry_id;
  if entry_group is null or not public.is_group_member(entry_group) then return; end if;
  return query
  select ev.id, ev.created_at, ev.action, u.email::text, ev.details
  from public.audit_events ev
  left join auth.users u on u.id = ev.actor_id
  where ev.group_id = entry_group
    and (
      (ev.entity_type = 'ledger_entry' and ev.entity_id = p_entry_id::text)
      or (ev.entity_type = 'reconciliation' and ev.details->'ledger_entry_ids' ? p_entry_id::text)
      or (ev.action = 'reconciliation.suggestion_rejected' and ev.details->>'ledger_entry_id' = p_entry_id::text)
    )
  order by ev.created_at desc, ev.id desc
  limit 500;
end;
$$;

revoke all on function public.ledger_entry_history(uuid) from public, anon;
grant execute on function public.ledger_entry_history(uuid) to authenticated;
