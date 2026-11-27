-- 020 — Lojinha no Inventário: marcar "à venda" em lote e mostrar a marca na lista.
--
-- * inventory_bulk ganha a ação `venda` (`p_args.value` boolean), por material, como `familia`/`consumivel`: só
--   material por quantidade (os por peça são pulados), mantém o preço de venda e passa por inventory_set_material_sale
--   (019; exige Editor e registra o movimento de edição).
-- * inventory_material_rows passa a trazer `for_sale` e `sale_price_cents` (ícone e filtro "Só à venda" na lista).

do $$
declare
  def text := pg_get_viewdef('public.inventory_material_rows'::regclass);
  marker constant text := 'AS search_text';
begin
  if position(marker in def) = 0 then raise exception 'inventory_material_rows mudou: revisar 020'; end if;
  def := regexp_replace(def, ';\s*$', '');
  execute 'create or replace view public.inventory_material_rows with (security_invoker = true) as '
    || replace(def, marker, marker || ', m.for_sale, m.sale_price_cents');
end;
$$;

do $$
declare
  def text := pg_get_functiondef('public.inventory_bulk(uuid,text,jsonb,jsonb,text)'::regprocedure);
  actions constant text := 'if p_action not in (''transferir'', ''condicao'', ''baixa'', ''familia'', ''consumivel'')';
  per_material constant text := 'if p_action in (''familia'', ''consumivel'') then';
  check_value constant text := 'if p_action = ''consumivel'' and jsonb_typeof(p_args->''value'') <> ''boolean'' then raise exception ''Informe se é consumível''; end if;';
  family_branch constant text := 'if p_action = ''familia'' then
        if material.family_id';
begin
  if position(actions in def) = 0 or position(per_material in def) = 0 or position(check_value in def) = 0 or position(family_branch in def) = 0 then
    raise exception 'inventory_bulk mudou: revisar 020';
  end if;
  def := replace(def, actions, 'if p_action not in (''transferir'', ''condicao'', ''baixa'', ''familia'', ''consumivel'', ''venda'')');
  def := replace(def, per_material, 'if p_action in (''familia'', ''consumivel'', ''venda'') then');
  def := replace(def, check_value, check_value || '
  if p_action = ''venda'' and jsonb_typeof(p_args->''value'') <> ''boolean'' then raise exception ''Informe se fica à venda''; end if;');
  def := replace(def, family_branch, 'if p_action = ''venda'' then
        -- Lojinha (020): só por quantidade; o preço de venda continua o do cadastro
        if material.tracking <> ''lot'' or material.for_sale = (p_args->>''value'')::boolean then continue; end if;
        perform public.inventory_set_material_sale(material.id, (p_args->>''value'')::boolean, material.sale_price_cents);
      elsif ' || substr(family_branch, 4));
  execute def;
end;
$$;
