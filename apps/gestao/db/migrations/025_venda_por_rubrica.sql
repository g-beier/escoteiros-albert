-- 025 — Lojinha: os itens vendidos fecham por rubrica, não por rateio.
--
-- Em 024 o rateio com itens tinha de somar os itens menos as linhas de dívida da mesma rubrica **e do mesmo associado**;
-- na venda o rateio costuma ficar sem associado (é quem pagou), e a linha de dívida tem o associado que deve: não casavam.
-- Agora, para cada rubrica com itens no lançamento: itens = rateios do caixa nessa rubrica + linhas de dívida nessa
-- rubrica, sem casar associado. A origem "venda" da linha também passa a ser pela rubrica.

/** "1.234,56" (centavos → reais no formato brasileiro), para mensagens; não depende do locale do banco. */
create function public.brl(p_cents bigint) returns text language sql immutable set search_path to '' as $$
  select translate(to_char(p_cents / 100.0, 'FM999,999,990.00'), ',.', '.,');
$$;

create or replace function public.write_entry_splits(p_entry_id uuid, p_group_id uuid, p_splits jsonb, p_previous_splits jsonb default '[]'::jsonb)
  returns void language plpgsql security definer set search_path to '' as $$
declare
  split jsonb;
  item jsonb;
  split_id uuid;
  split_category uuid;
  split_associate uuid;
  split_amount bigint;
  split_debt uuid;
  category_kind public.category_kind;
  item_lot public.inventory_lots;
  item_quantity integer;
  item_price bigint;
  item_position integer;
  has_items boolean;
  entry_date date;
  line public.debts;
  kept uuid[];
  sale record;
  received bigint;
  owed bigint;
begin
  select e.entry_date into entry_date from public.ledger_entries e where e.id = p_entry_id;

  -- 1. Linhas de dívida do lançamento (fora do caixa): as que saíram do formulário somem (sem pagamento); as outras são
  --    atualizadas ou criadas. Vêm antes dos rateios para a conferência dos itens vendidos.
  select coalesce(array_agg(nullif(value->>'debt_id', '')::uuid) filter (where nullif(value->>'debt_id', '') is not null), '{}') into kept
  from jsonb_array_elements(p_splits) where value->>'kind' = 'divida';
  for line in select * from public.debts where origin_entry_id = p_entry_id and not (id = any(kept)) loop
    if exists (select 1 from public.entry_splits where debt_id = line.id) then
      raise exception 'A dívida “%” deste lançamento já tem pagamento: não sai', line.description;
    end if;
    delete from public.debts where id = line.id;
  end loop;
  for split in select value from jsonb_array_elements(p_splits) where value->>'kind' = 'divida' loop
    split_category := nullif(split->>'category_id', '')::uuid;
    split_associate := nullif(split->>'associate_id', '')::uuid;
    split_amount := coalesce(nullif(split->>'amount_cents', '')::bigint, 0);
    split_debt := nullif(split->>'debt_id', '')::uuid;
    if not exists (select 1 from public.categories c where c.id = split_category and c.group_id = p_group_id and c.kind = 'receita') then
      raise exception 'A linha de dívida precisa de uma rubrica de receita';
    end if;
    if split_associate is null or not exists (select 1 from public.associates a where a.id = split_associate and a.group_id = p_group_id) then
      raise exception 'A linha de dívida precisa do associado que fica devendo';
    end if;
    if split_amount <= 0 then raise exception 'Informe o valor de cada linha de dívida'; end if;
    if char_length(trim(coalesce(split->>'description', ''))) not between 2 and 200 then raise exception 'Descreva cada linha de dívida'; end if;
    if split_debt is null then
      insert into public.debts(group_id, associate_id, debt_date, amount_cents, description, category_id, origin, origin_entry_id, created_by, updated_by)
      values (p_group_id, split_associate, entry_date, split_amount, trim(split->>'description'), split_category, 'lancamento', p_entry_id, auth.uid(), auth.uid());
    else
      select * into line from public.debts where id = split_debt and origin_entry_id = p_entry_id for update;
      if line.id is null then raise exception 'Linha de dívida não encontrada neste lançamento'; end if;
      if (line.category_id <> split_category or line.associate_id <> split_associate) and exists (select 1 from public.entry_splits where debt_id = line.id) then
        raise exception 'A dívida “%” já tem pagamento: rubrica e associado não mudam', line.description;
      end if;
      if split_amount < public.debt_paid_cents(line.id) then raise exception 'A dívida “%” não pode ficar abaixo do que já foi pago', line.description; end if;
      update public.debts set category_id = split_category, associate_id = split_associate, amount_cents = split_amount,
        description = trim(split->>'description'), debt_date = entry_date, updated_by = auth.uid(), updated_at = now()
      where id = line.id;
    end if;
  end loop;

  -- 2. Rateios do caixa.
  for split in select value from jsonb_array_elements(p_splits) where coalesce(value->>'kind', 'rateio') <> 'divida'
  loop
    split_category := (split->>'category_id')::uuid;
    split_amount := (split->>'amount_cents')::bigint;
    select c.kind into category_kind from public.categories c
    where c.id = split_category and c.group_id = p_group_id
      and (c.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where (prev->>'category_id')::uuid = split_category));
    if not found then raise exception 'Rubrica inválida'; end if;
    if category_kind = 'receita' and split_amount < 0 then raise exception 'Rubrica de receita exige valor de entrada'; end if;
    if category_kind = 'despesa' and split_amount > 0 then raise exception 'Rubrica de despesa exige valor de saída'; end if;

    split_associate := nullif(split->>'associate_id', '')::uuid;
    if split_associate is not null and not exists (
      select 1 from public.associates a where a.id = split_associate and a.group_id = p_group_id
        and (a.active or exists (select 1 from jsonb_array_elements(p_previous_splits) prev where nullif(prev->>'associate_id', '')::uuid = split_associate))
    ) then raise exception 'Associado inválido'; end if;

    split_debt := nullif(split->>'debt_id', '')::uuid;
    has_items := jsonb_typeof(split->'items') = 'array' and jsonb_array_length(split->'items') > 0;
    if split_debt is not null and has_items then raise exception 'Rateio que paga dívida não tem itens vendidos (já saíram na venda)'; end if;

    insert into public.entry_splits (entry_id, category_id, amount_cents, description, associate_id, debt_id)
    values (p_entry_id, split_category, split_amount, trim(split->>'description'), split_associate, split_debt)
    returning id into split_id;

    if has_items then
      if not public.category_sells_items(split_category) then
        raise exception 'A rubrica do rateio “%” não vende itens do inventário', trim(split->>'description');
      end if;
      item_position := 0;
      for item in select value from jsonb_array_elements(split->'items') loop
        item_lot := null;
        select * into item_lot from public.inventory_lots l
        where l.id = nullif(item->>'lot_id', '')::uuid and l.group_id = p_group_id
          and (l.for_sale or exists (select 1 from public.entry_sale_draws d where d.entry_id = p_entry_id and d.lot_id = l.id));
        if item_lot.id is null then raise exception 'Lote à venda inválido'; end if;
        item_quantity := (item->>'quantity')::integer;
        item_price := (item->>'unit_price_cents')::bigint;
        if item_quantity is null or item_quantity <= 0 then raise exception 'Informe a quantidade de cada item vendido'; end if;
        if item_price is null or item_price < 0 then raise exception 'Informe o preço de cada item vendido'; end if;
        insert into public.entry_sale_items(group_id, entry_id, split_id, material_id, lot_id, quantity, unit_price_cents, position)
        values (p_group_id, p_entry_id, split_id, item_lot.material_id, item_lot.id, item_quantity, item_price, item_position);
        item_position := item_position + 1;
      end loop;
    end if;
  end loop;

  -- 3. Venda por rubrica (025): os itens vendidos de cada rubrica = rateios do caixa nela + linhas de dívida nela
  --    (o associado da linha é quem deve; o rateio pode não ter associado).
  for sale in
    select s.category_id, c.name as category_name, sum(i.quantity * i.unit_price_cents)::bigint as items_cents
    from public.entry_sale_items i join public.entry_splits s on s.id = i.split_id join public.categories c on c.id = s.category_id
    where i.entry_id = p_entry_id group by s.category_id, c.name
  loop
    received := coalesce((select sum(amount_cents) from public.entry_splits where entry_id = p_entry_id and category_id = sale.category_id), 0);
    owed := coalesce((select sum(amount_cents) from public.debts where origin_entry_id = p_entry_id and category_id = sale.category_id), 0);
    if sale.items_cents <> received + owed then
      raise exception 'Os itens vendidos de % somam R$ %; recebido R$ % + a pagar R$ %', sale.category_name,
        public.brl(sale.items_cents), public.brl(received), public.brl(owed);
    end if;
  end loop;

  -- 4. Origem das linhas: venda quando a rubrica da linha tem itens vendidos no lançamento.
  update public.debts d set origin = case when exists (
      select 1 from public.entry_sale_items i join public.entry_splits s on s.id = i.split_id
      where i.entry_id = p_entry_id and s.category_id = d.category_id)
    then 'venda'::public.debt_origin else 'lancamento' end
  where d.origin_entry_id = p_entry_id;
end;
$$;
