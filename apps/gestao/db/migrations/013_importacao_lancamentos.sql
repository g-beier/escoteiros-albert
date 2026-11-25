-- 013 — Importação por CSV: lancamentos.csv (contrato em apps/gestao/docs/importacao.md; plano em lib/import/plan.ts).
--
-- Cada linha do payload é um lançamento já montado pelo plano (os rateios juntos, valores com sinal, rubricas por
-- id). Contas e formas de pagamento que faltam são criadas pelas funções de sempre; o lançamento entra por
-- create_ledger_entry (auditado como qualquer lançamento). Só cria: o plano já deixou de fora os que existem.

create function public.import_ledger_entries(p_group_id uuid, p_rows jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  r jsonb;
  split jsonb;
  account_id uuid;
  method_id uuid;
  associate_id uuid;
  splits jsonb;
  created integer := 0;
  new_accounts integer := 0;
  new_methods integer := 0;
begin
  if not public.can_edit_group(p_group_id) then raise exception 'Sem permissão para lançar no Financeiro'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      select id into account_id from public.accounts where group_id = p_group_id and lower(name) = lower(trim(r->>'account'));
      if account_id is null then
        account_id := public.create_account(p_group_id, trim(r->>'account'), 'corrente', null, null, null, 0, null, null);
        new_accounts := new_accounts + 1;
      end if;
      select id into method_id from public.payment_methods where group_id = p_group_id and lower(name) = lower(trim(r->>'payment_method'));
      if method_id is null then
        method_id := public.create_payment_method(p_group_id, trim(r->>'payment_method'));
        new_methods := new_methods + 1;
      end if;
      splits := '[]'::jsonb;
      for split in select value from jsonb_array_elements(r->'splits') loop
        associate_id := null;
        if nullif(split->>'associate', '') is not null then
          select min(a.id::text)::uuid into associate_id from public.associates a
          where a.group_id = p_group_id and lower(a.name) = lower(trim(split->>'associate'))
          having count(*) = 1;
        end if;
        splits := splits || jsonb_build_array(jsonb_build_object(
          'category_id', split->>'category_id', 'amount_cents', (split->>'amount_cents')::bigint,
          'description', split->>'description', 'associate_id', associate_id));
      end loop;
      perform public.create_ledger_entry(p_group_id, (r->>'date')::date, r->>'name', method_id, nullif(r->>'document', ''),
        coalesce((r->>'filed')::boolean, false), (r->>'total_cents')::bigint, splits, account_id, nullif(r->>'notes', ''));
      created := created + 1;
    exception when others then
      raise exception 'lancamentos.csv, linha %: %', r->>'line', sqlerrm;
    end;
  end loop;
  return jsonb_build_object('lançamentos', created, 'contas', new_accounts, 'formas', new_methods);
end;
$$;

create or replace function public.import_batch(p_group_id uuid, p_files jsonb) returns jsonb
  language plpgsql security definer set search_path to '' as $$
declare
  f jsonb;
  kind text;
  rows jsonb;
  result jsonb := '{}'::jsonb;
  done jsonb;
begin
  if p_files is null or jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) = 0 then raise exception 'Nada para importar'; end if;
  for f in select value from jsonb_array_elements(p_files) loop
    kind := f->>'kind';
    rows := coalesce(f->'rows', '[]'::jsonb);
    if jsonb_typeof(rows) <> 'array' then raise exception '%: linhas inválidas', kind; end if;
    if jsonb_array_length(rows) > 5000 then raise exception '%.csv: no máximo 5.000 linhas', kind; end if;
    if jsonb_array_length(rows) = 0 then continue; end if;
    done := case kind
      when 'secoes' then public.import_sections(p_group_id, rows)
      when 'itens-controle' then public.import_control_items(p_group_id, rows)
      when 'pessoas' then public.import_people(p_group_id, rows)
      when 'funcoes' then public.import_functions(p_group_id, rows)
      when 'responsaveis' then public.import_relatives(p_group_id, rows)
      when 'controle' then public.import_controls(p_group_id, rows)
      when 'vida-escoteira' then public.import_life(p_group_id, rows)
      when 'inventario-lotes' then public.import_inventory_lots(p_group_id, rows)
      when 'inventario-pecas' then public.import_inventory_units(p_group_id, rows)
      when 'lancamentos' then public.import_ledger_entries(p_group_id, rows)
      else null end;
    if done is null then raise exception 'A importação de %.csv não está disponível', kind; end if;
    result := result || jsonb_build_object(kind, done);
  end loop;
  insert into public.audit_events(group_id, actor_id, action, entity_type, entity_id, details)
  values (p_group_id, auth.uid(), 'import.batch', 'group', p_group_id::text, result);
  return result;
end;
$$;

revoke all on function public.import_ledger_entries(uuid, jsonb) from public;
