-- Associados: tipos de função Honorífico e Comissão fiscal (sem seção: o check de 052 só aceita seção no escotista).
-- Cores nos relatórios: laranja (lib/associates/reports.ts).

alter type public.associate_function_kind add value if not exists 'honorifico';
alter type public.associate_function_kind add value if not exists 'comissao_fiscal';
