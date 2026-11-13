-- Estado "isento" registrado à mão: mês que não se cobra (ok sem ser pago). Não é pago, dívida nem alerta, e sai do previsto.
-- Diferente da isenção do ano (fee_exemptions), vale só para o mês marcado.
alter type public.fee_status add value if not exists 'isento';
