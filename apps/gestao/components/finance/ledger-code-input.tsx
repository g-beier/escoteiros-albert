"use client";

import { useState } from "react";
import { Input } from "@geas/ui/components/input";
import { formatLedgerCode, isLedgerCode, LEDGER_CODE_MASK } from "@/lib/finance/ledger-code";
import { cn } from "@geas/ui/lib/utils";

/** Campo de conta contábil: aplica a máscara ao digitar e marca como inválido enquanto incompleto. */
export function LedgerCodeInput({
  name = "ledgerCode",
  defaultValue,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue"> & {
  defaultValue?: string | null;
  /** Valor já com a máscara, a cada tecla (para formulários controlados pelo cliente). */
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const invalid = value !== "" && !isLedgerCode(value);
  return (
    <Input
      {...props}
      name={name}
      value={value}
      onChange={(event) => {
        const next = formatLedgerCode(event.target.value);
        setValue(next);
        onValueChange?.(next);
      }}
      inputMode="numeric"
      placeholder={LEDGER_CODE_MASK}
      pattern={"\\d\\.\\d\\.\\d\\.\\d\\.\\d{4}"}
      title={`Conta contábil no formato ${LEDGER_CODE_MASK}`}
      aria-invalid={invalid || undefined}
      className={cn("num", className)}
    />
  );
}
