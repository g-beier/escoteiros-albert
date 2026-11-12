"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatLedgerCode, isLedgerCode, LEDGER_CODE_MASK } from "@/lib/ledger-code";
import { cn } from "@/lib/utils";

/** Campo de conta contábil: aplica a máscara ao digitar e marca como inválido enquanto incompleto. */
export function LedgerCodeInput({ name = "ledgerCode", defaultValue, className, ...props }: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue"> & { defaultValue?: string | null }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const invalid = value !== "" && !isLedgerCode(value);
  return <Input
    {...props}
    name={name}
    value={value}
    onChange={(event) => setValue(formatLedgerCode(event.target.value))}
    inputMode="numeric"
    placeholder={LEDGER_CODE_MASK}
    pattern={"\\d\\.\\d\\.\\d\\.\\d\\.\\d{4}"}
    title={`Conta contábil no formato ${LEDGER_CODE_MASK}`}
    aria-invalid={invalid || undefined}
    className={cn("num", className)}
  />;
}
