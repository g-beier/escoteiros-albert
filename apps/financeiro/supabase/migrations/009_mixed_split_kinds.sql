-- Um mesmo lançamento pode misturar rubricas de receita e de despesa
-- (ex.: recebimento de mensalidades com desconto de um ressarcimento na mesma transferência).
-- O sinal de cada rateio vem da rubrica (receita +, despesa −, validado em write_entry_splits);
-- o total da linha do extrato é a soma dos rateios e não pode ser zero.
create or replace function public.validate_entry_totals(p_total_cents bigint, p_splits jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare split_total bigint;
begin
  if p_total_cents = 0 then raise exception 'O total não pode ser zero'; end if;
  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then raise exception 'Informe ao menos uma rubrica'; end if;
  if exists (select 1 from jsonb_array_elements(p_splits) where coalesce((value->>'amount_cents')::bigint, 0) = 0) then
    raise exception 'O valor de cada rubrica não pode ser zero';
  end if;
  select coalesce(sum((value->>'amount_cents')::bigint), 0) into split_total from jsonb_array_elements(p_splits);
  if split_total <> p_total_cents then raise exception 'A soma das rubricas deve ser igual ao total'; end if;
end;
$$;
