-- Mover vários lançamentos de uma vez para outra conta (ex.: os que ficaram em "A definir").
-- Mesmas regras de set_ledger_entry_account (013): conta ativa do grupo, tesouraria ou administração,
-- um evento 'ledger_entry.account_changed' por lançamento movido (motivo "em lote"). Trocar a conta de
-- um lançamento conciliado desfaz o conjunto de vínculos inteiro pelo gatilho
-- ledger_entry_reconciliation_on_update (as linhas do extrato voltam a ficar abertas e o desfazer é auditado).
-- Lançamentos já na conta de destino são ignorados. Tudo numa transação: ou move todos, ou nenhum.

create or replace function public.move_ledger_entries_account(p_entry_ids uuid[], p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  entry_ids uuid[];
  entry_count int;
  target_group uuid;
  moved record;
  moved_count int := 0;
  unlinked_count int;
begin
  select coalesce(array_agg(distinct x), '{}') into entry_ids from unnest(p_entry_ids) x where x is not null;
  entry_count := cardinality(entry_ids);
  if entry_count = 0 then raise exception 'Selecione ao menos um lançamento'; end if;
  if entry_count > 500 then raise exception 'Seleção grande demais: no máximo 500 lançamentos por vez'; end if;

  select group_id into target_group from public.accounts where id = p_account_id and active;
  if target_group is null or not public.can_edit_group(target_group) then raise exception 'Conta inválida ou sem permissão'; end if;

  perform 1 from public.ledger_entries where id = any(entry_ids) order by id for update;
  if (select count(*) from public.ledger_entries where id = any(entry_ids) and group_id = target_group) <> entry_count then
    raise exception 'Lançamento não encontrado ou sem permissão';
  end if;

  select count(distinct rl.link_set_id) into unlinked_count
  from public.reconciliation_links rl
  join public.ledger_entries e on e.id = rl.ledger_entry_id
  where e.id = any(entry_ids) and e.account_id <> p_account_id;

  for moved in
    update public.ledger_entries e set account_id = p_account_id, updated_at = now()
    from (select id, account_id from public.ledger_entries where id = any(entry_ids) and account_id <> p_account_id) old
    where e.id = old.id
    returning e.id, old.account_id as from_account
  loop
    insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
    values (target_group, auth.uid(), 'ledger_entry.account_changed', 'ledger_entry', moved.id::text,
      jsonb_build_object('from', moved.from_account, 'to', p_account_id, 'reason', 'em lote'));
    moved_count := moved_count + 1;
  end loop;

  return jsonb_build_object('moved', moved_count, 'unchanged', entry_count - moved_count, 'unlinked', unlinked_count);
end;
$$;

revoke all on function public.move_ledger_entries_account(uuid[], uuid) from public, anon;
grant execute on function public.move_ledger_entries_account(uuid[], uuid) to authenticated;
