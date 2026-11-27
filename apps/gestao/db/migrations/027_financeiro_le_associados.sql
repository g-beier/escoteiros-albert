-- 027 — Qualquer papel do Financeiro lê `associates`.
--
-- O Financeiro lê o cadastro direto (seletor de associado, Detalhamento, Mensalidades, Devedores). Desde 002/003 só lia
-- quem tinha acesso ao Associados ou era Editor do Financeiro ("finance editors read associates", 026): a Consulta e o
-- Colaborador do Financeiro sem Associados ficavam com o seletor vazio e os nomes em branco. Decidido em 2026-11-27:
-- quem lê o Financeiro lê a tabela `associates` (as tabelas filhas do Associados continuam fechadas), com a mesma regra
-- da quarentena (018).

drop policy "finance editors read associates" on public.associates;
create policy "finance readers read associates" on public.associates for select
  using (public.can_read_finance(group_id) and deletion_due_on is null);
