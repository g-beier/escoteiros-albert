"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import { accountBalanceBefore } from "@/app/importacao/actions";
import { dateBR, money } from "@/lib/format";
import { fileOpeningBalance, openingDifference } from "@/lib/import-flow";
import type { AccountBalance } from "@/lib/import-schema";
import type { ParsedStatement } from "@/lib/statement-import";

const brl = (cents: number) => money(cents / 100);

/**
 * Conferência do saldo inicial do OFX com o saldo da conta calculado no sistema na primeira data do
 * arquivo (saldo inicial da conta + lançamentos da conta antes dessa data). Só informa: não bloqueia.
 */
export function OpeningBalanceCheck({ accountId, date, statement }: { accountId: string; date: string; statement: ParsedStatement }) {
  const key = `${accountId}|${date}`;
  const [result, setResult] = useState<{ key: string; data?: AccountBalance; error?: string } | null>(null);
  useEffect(() => {
    let current = true;
    accountBalanceBefore({ accountId, date }).then((response) => {
      if (current) setResult({ key: `${accountId}|${date}`, data: response.data, error: response.error });
    });
    return () => { current = false; };
  }, [accountId, date]);

  const file = fileOpeningBalance(statement);
  const loaded = result?.key === key ? result : null;
  const system = loaded?.data;
  const fileText = file
    ? <>Saldo inicial do arquivo em {dateBR(date)}: <strong className="num">{brl(file.cents)}</strong> {file.source === "saldo-anterior" ? "(linha SALDO ANTERIOR)" : "(saldo final menos os movimentos do arquivo)"}</>
    : null;

  if (!loaded) return <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground"><IconInfoCircle className="size-4 shrink-0" />Calculando o saldo da conta no sistema…</p>;
  if (loaded.error || !system) return <p role="alert" className="m-0 text-xs text-destructive">Não foi possível calcular o saldo da conta: {loaded.error ?? "resposta inválida"}.</p>;

  if (!file) {
    return <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground"><IconInfoCircle className="size-4 shrink-0" />
      O arquivo não traz saldo para conferir com o saldo da conta{system.balanceCents !== null ? ` (${brl(system.balanceCents)} no sistema em ${dateBR(date)})` : ""}.</p>;
  }
  if (system.beforeOpening || system.balanceCents === null) {
    return <p className="m-0 flex items-start gap-2 text-xs text-muted-foreground"><IconInfoCircle className="mt-0.5 size-4 shrink-0" />
      <span>{fileText}. O arquivo começa antes da data do saldo inicial da conta ({system.openingDate ? dateBR(system.openingDate) : "—"}), então não há saldo no sistema para comparar.
        {" "}<Link href="/cadastros?aba=contas" className="underline">Ajustar a conta</Link></span></p>;
  }

  const difference = openingDifference(file.cents, system.balanceCents)!;
  const systemText = <>saldo no sistema <strong className="num">{brl(system.balanceCents)}</strong> (saldo inicial da conta {brl(system.openingBalanceCents)}
    {system.openingDate ? ` em ${dateBR(system.openingDate)}` : ""} + {system.entryCount} {system.entryCount === 1 ? "lançamento" : "lançamentos"} antes de {dateBR(date)}: {brl(system.movementsCents ?? 0)})</>;
  if (difference === 0) {
    return <p className="m-0 flex items-start gap-2 text-xs text-success"><IconCircleCheck className="mt-0.5 size-4 shrink-0" />
      <span>{fileText} confere com o {systemText}.</span></p>;
  }
  return <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
    <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
    <span>{fileText}; {systemText}. <strong>Divergência de <span className="num">{brl(difference)}</span></strong> (arquivo − sistema).
      {" "}<span className="text-foreground">Pode faltar importar um extrato anterior, conciliar ou lançar movimentos antes desta data, ou o saldo inicial da conta estar errado. A importação continua possível.</span></span>
  </div>;
}
