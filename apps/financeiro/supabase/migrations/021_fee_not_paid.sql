-- Estado "não pago" registrado à mão (com observação), além do "atrasado" calculado pelo vencimento.
alter type public.fee_status add value if not exists 'nao_pago';
