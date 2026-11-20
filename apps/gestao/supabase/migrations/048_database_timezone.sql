-- Fuso do banco = São Paulo, para `current_date`/`now()::date` serem a data do grupo e não a de UTC.
-- Antes, entre 21h e meia-noite o banco já estava no dia seguinte: o cadastro gravava a entrada com a data de
-- amanhã e o desligamento com a data de hoje (padrão da tela) era recusado ("não pode ser antes da última entrada");
-- as checagens "não pode ser futura" também deixavam passar o dia seguinte. Vale para todas as funções que usam
-- `current_date` (associados, controle, funções de adultos, mensalidades…), sem reescrever cada uma.
-- Os `timestamptz` não mudam (instantes absolutos); só a exibição em texto passa a vir com -03:00.
-- Conexões já abertas mantêm o fuso antigo até reconectar. Produção: aplicar à mão, como as outras migrações.
do $$ begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Sao_Paulo');
end $$;
