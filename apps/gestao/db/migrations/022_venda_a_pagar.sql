-- 022 — Lojinha: venda "a pagar depois". Não entrou dinheiro, então não é lançamento: vira dívida do associado (Devedores)
-- com os itens vendidos, e o estoque baixa na hora. Quando a pessoa paga, "Receber" na dívida cria o lançamento e quita.
--
-- * Itens vendidos e o que saiu de cada lote (`entry_sale_items`, `entry_sale_draws`, 019/021) passam a pertencer a um
--   lançamento **ou** a uma dívida (`debt_id`); `sync_sales(entry, debt)` acerta o estoque dos dois.
-- * `create_sale_debt` (quem lança no Financeiro): dívida com a rubrica da venda (`debts.category_id`) e os itens.
-- * `receive_debt`: cria o lançamento (create_ledger_entry) e aloca o pagamento na dívida (pay_debts), numa transação.
-- * `delete_debt` devolve os itens ao estoque; `save_debt` não muda o valor de dívida com itens (o valor é a soma deles).

alter table public.debts add column category_id uuid references public.categories(id) on delete set null;

alter table public.entry_sale_items
  alter column entry_id drop not null,
  alter column split_id drop not null,
  add column debt_id uuid references public.debts(id) on delete cascade,
  add constraint entry_sale_items_owner check ((entry_id is null) <> (debt_id is null) and (entry_id is null or split_id is not null));
create index entry_sale_items_debt on public.entry_sale_items(debt_id);

alter table public.entry_sale_draws
  alter column entry_id drop not null,
  add column debt_id uuid references public.debts(id) on delete cascade,
  add constraint entry_sale_draws_owner check ((entry_id is null) <> (debt_id is null));
create index entry_sale_draws_debt on public.entry_sale_draws(debt_id);

/**
 * Acerta o estoque com os itens vendidos de um lançamento ou de uma dívida, lote a lote: baixa no lote vendido o que
 * passou a ser vendido e devolve a ele o que deixou de ser. Sem itens, devolve tudo. Sem grant.
 */
create function public.sync_sales(p_entry_id uuid, p_debt_id uuid) returns void
  language plpgsql security definer set search_path to '' as $$
declare
  owner_group uuid;
  label text;
  owner jsonb;
  r record;
  lot public.inventory_lots;
  material_name text;
  previous_channel text := coalesce(current_setting('inventory.channel', true), '');
begin
  if (p_entry_id is null) = (p_debt_id is null) then raise exception 'Informe o lançamento ou a dívida'; end if;
  if p_entry_id is not null then
    select group_id, 'Venda: ' || name into owner_group, label from public.ledger_entries where id = p_entry_id;
    owner := jsonb_build_object('entry_id', p_entry_id);
  else
    select d.group_id, 'Venda a pagar: ' || a.name into owner_group, label
    from public.debts d join public.associates a on a.id = d.associate_id where d.id = p_debt_id;
    owner := jsonb_build_object('debt_id', p_debt_id);
  end if;
  if owner_group is null then return; end if;
  perform set_config('inventory.channel', 'financeiro', true);
  for r in
    with sold as (select lot_id, sum(quantity)::int as q from public.entry_sale_items
                  where entry_id is not distinct from p_entry_id and debt_id is not distinct from p_debt_id group by lot_id),
      drawn as (select lot_id, sum(quantity)::int as q from public.entry_sale_draws
                where entry_id is not distinct from p_entry_id and debt_id is not distinct from p_debt_id group by lot_id)
    select coalesce(so.lot_id, dn.lot_id) as lot_id, coalesce(so.q, 0) as sold, coalesce(dn.q, 0) as drawn
    from sold so full join drawn dn on dn.lot_id = so.lot_id
    order by (coalesce(dn.q, 0) > coalesce(so.q, 0)) desc, 1  -- devoluções antes das baixas
  loop
    continue when r.sold = r.drawn;
    select * into lot from public.inventory_lots where id = r.lot_id for update;
    if r.drawn > r.sold then
      update public.inventory_lots set quantity = quantity + (r.drawn - r.sold), updated_at = now() where id = lot.id;
      perform public.inventory_log(owner_group, 'entrada', lot.material_id, lot.id, null, r.drawn - r.sold, null, lot.location_id, null, null, null,
        'Devolução da ' || lower(substr(label, 1, 1)) || substr(label, 2),
        owner || jsonb_build_object('sale_return', true, 'from', lot.quantity, 'to', lot.quantity + r.drawn - r.sold));
    else
      if lot.quantity < r.sold - r.drawn then
        select name into material_name from public.inventory_materials where id = lot.material_id;
        raise exception 'Estoque insuficiente de %: faltam % (há % no lote)', material_name || coalesce(' · ' || lot.variant, ''),
          r.sold - r.drawn - lot.quantity, lot.quantity;
      end if;
      update public.inventory_lots set quantity = quantity - (r.sold - r.drawn), updated_at = now() where id = lot.id;
      perform public.inventory_log(owner_group, 'baixa', lot.material_id, lot.id, null, r.sold - r.drawn, lot.location_id, null, null, null, 'venda',
        label, owner || jsonb_build_object('from', lot.quantity, 'to', lot.quantity - (r.sold - r.drawn)));
    end if;
    delete from public.entry_sale_draws
    where entry_id is not distinct from p_entry_id and debt_id is not distinct from p_debt_id and lot_id = r.lot_id;
    if r.sold > 0 then
      insert into public.entry_sale_draws(group_id, entry_id, debt_id, material_id, lot_id, quantity)
      values (owner_group, p_entry_id, p_debt_id, lot.material_id, lot.id, r.sold);
    end if;
  end loop;
  perform set_config('inventory.channel', previous_channel, true);
end;
$$;
revoke all on function public.sync_sales(uuid, uuid) from public;

create or replace function public.sync_entry_sales(p_entry_id uuid) returns void
  language sql security definer set search_path to '' as $$
  select public.sync_sales(p_entry_id, null);
$$;

-- O lote de item já vendido continua aceito ao editar, mesmo fora da venda: a regra de write_entry_splits (021) olha as
-- tiragens deste lançamento; continua igual.

/**
 * Venda a pagar depois: dívida do associado com a rubrica da venda e os itens (lotes à venda); o estoque baixa na hora.
 * Quem lança no Financeiro (Colaborador+). Valor = soma dos itens.
 */
create function public.create_sale_debt(p_group_id uuid, p_associate_id uuid, p_debt_date date, p_category_id uuid, p_description text,
  p_agreement text, p_items jsonb) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare
  result uuid;
  item jsonb;
  item_lot public.inventory_lots;
  total bigint := 0;
  position_ integer := 0;
  clean_description text := nullif(trim(p_description), '');
  clean_agreement text := nullif(trim(p_agreement), '');
begin
  if not public.can_write_finance(p_group_id) then raise exception 'Sem permissão para lançar no Financeiro'; end if;
  if not exists (select 1 from public.associates where id = p_associate_id and group_id = p_group_id and active) then
    raise exception 'Escolha o associado que fica devendo';
  end if;
  if p_debt_date is null then raise exception 'Informe a data da venda'; end if;
  if not exists (select 1 from public.categories where id = p_category_id and group_id = p_group_id and active and kind = 'receita')
    or not public.category_sells_items(p_category_id) then
    raise exception 'Escolha uma rubrica de venda de itens';
  end if;
  if clean_description is null or char_length(clean_description) not between 2 and 200 then raise exception 'Descrição: de 2 a 200 caracteres'; end if;
  if char_length(clean_agreement) > 300 then raise exception 'Acordo: no máximo 300 caracteres'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Informe os itens vendidos'; end if;

  perform 1 from public.debts where associate_id = p_associate_id for update;
  insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, agreement, category_id, created_by, updated_by)
  values (p_group_id, p_associate_id, p_debt_date, 1, clean_description, clean_agreement, p_category_id, auth.uid(), auth.uid())
  returning id into result;
  for item in select value from jsonb_array_elements(p_items) loop
    item_lot := null;
    select * into item_lot from public.inventory_lots where id = nullif(item->>'lot_id', '')::uuid and group_id = p_group_id and for_sale;
    if item_lot.id is null then raise exception 'Lote à venda inválido'; end if;
    if coalesce((item->>'quantity')::integer, 0) <= 0 then raise exception 'Informe a quantidade de cada item vendido'; end if;
    if (item->>'unit_price_cents')::bigint is null or (item->>'unit_price_cents')::bigint < 0 then raise exception 'Informe o preço de cada item vendido'; end if;
    insert into public.entry_sale_items(group_id, debt_id, material_id, lot_id, quantity, unit_price_cents, position)
    values (p_group_id, result, item_lot.material_id, item_lot.id, (item->>'quantity')::integer, (item->>'unit_price_cents')::bigint, position_);
    total := total + (item->>'quantity')::integer * (item->>'unit_price_cents')::bigint;
    position_ := position_ + 1;
  end loop;
  if total <= 0 then raise exception 'A venda precisa de valor maior que zero'; end if;
  update public.debts set amount_cents = total where id = result;
  perform public.sync_sales(null, result);
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'debt.created', 'debt', result::text,
    jsonb_build_object('after', public.debt_snapshot(result), 'sale', true));
  return result;
end;
$$;
revoke all on function public.create_sale_debt(uuid, uuid, date, uuid, text, text, jsonb) from public;
grant execute on function public.create_sale_debt(uuid, uuid, date, uuid, text, text, jsonb) to authenticated;

/**
 * "Receber" na dívida: cria o lançamento (mesmos argumentos de create_ledger_entry) e aloca nele o que falta da dívida,
 * até o que o lançamento tem de receita do associado. Editor do Financeiro (como pagar dívidas).
 */
create function public.receive_debt(p_debt_id uuid, p_entry_date date, p_name text, p_payment_method_id uuid, p_document text,
  p_document_filed boolean, p_total_cents bigint, p_splits jsonb, p_account_id uuid default null, p_notes text default null) returns uuid
  language plpgsql security definer set search_path to '' as $$
declare debt public.debts; new_entry uuid; open_cents bigint; amount bigint;
begin
  select * into debt from public.debts where id = p_debt_id;
  if debt.id is null or not public.can_edit_group(debt.group_id) then raise exception 'Dívida não encontrada ou sem permissão'; end if;
  new_entry := public.create_ledger_entry(debt.group_id, p_entry_date, p_name, p_payment_method_id, p_document, p_document_filed, p_total_cents,
    p_splits, p_account_id, p_notes);
  open_cents := debt.amount_cents - coalesce((select sum(amount_cents) from public.debt_payments where debt_id = debt.id), 0);
  amount := least(greatest(open_cents, 0), public.debt_payment_cents(new_entry, debt.associate_id));
  if amount <= 0 then
    raise exception 'O lançamento precisa de um rateio de receita de % para quitar a dívida',
      (select name from public.associates where id = debt.associate_id);
  end if;
  perform public.pay_debts(debt.group_id, debt.associate_id, new_entry,
    (select coalesce(jsonb_agg(jsonb_build_object('debtId', p.debt_id, 'amountCents', p.amount_cents)), '[]'::jsonb)
     from public.debt_payments p join public.debts d on d.id = p.debt_id where p.entry_id = new_entry and d.associate_id = debt.associate_id)
    || jsonb_build_array(jsonb_build_object('debtId', debt.id, 'amountCents', amount)));
  return new_entry;
end;
$$;
revoke all on function public.receive_debt(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid, text) from public;
grant execute on function public.receive_debt(uuid, date, text, uuid, text, boolean, bigint, jsonb, uuid, text) to authenticated;

-- Excluir a dívida devolve os itens ao estoque; dívida com itens tem o valor dos itens.
do $$
declare
  def text := pg_get_functiondef('public.delete_debt(uuid)'::regprocedure);
  marker constant text := 'delete from public.debts where id = p_id;';
  save_def text := pg_get_functiondef('public.save_debt(uuid,uuid,uuid,date,bigint,text,text,jsonb)'::regprocedure);
  save_marker constant text := 'before_state := public.debt_snapshot(p_id);';
begin
  if position(marker in def) = 0 or position(save_marker in save_def) = 0 then raise exception 'delete_debt/save_debt mudaram: revisar 022'; end if;
  execute replace(def, marker, '-- itens vendidos voltam ao estoque (022)
  delete from public.entry_sale_items where debt_id = p_id;
  perform public.sync_sales(null, p_id);
  ' || marker);
  execute replace(save_def, save_marker, save_marker || '
    if exists (select 1 from public.entry_sale_items where debt_id = p_id)
      and p_amount_cents <> (select sum(quantity * unit_price_cents) from public.entry_sale_items where debt_id = p_id) then
      raise exception ''Dívida de venda: o valor é a soma dos itens. Para mudar os itens, exclua a dívida (o estoque volta) e lance a venda de novo'';
    end if;');
end;
$$;

create function public.debt_sale_delete_guard() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if exists (select 1 from public.entry_sale_draws where debt_id = old.id) then
    raise exception 'A dívida tem itens vendidos: exclua em Devedores, que devolve os itens ao estoque';
  end if;
  return old;
end;
$$;
create trigger debts_sale_guard before delete on public.debts for each row execute function public.debt_sale_delete_guard();
