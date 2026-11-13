"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { reconciliationHref } from "@/lib/reconciliation";

/** Conta e período da conciliação, guardados na URL (`conta`, `de`, `ate`). */
export function ReconciliationFilters({ accounts, accountId, from, to }: { accounts: Option[]; accountId: string; from: string; to: string }) {
  const router = useRouter();
  const [period, setPeriod] = useState({ from, to });
  const go = (conta: string, de: string, ate: string) => router.push(reconciliationHref({ conta, de, ate }));
  const changed = period.from !== from || period.to !== to;

  return <form className="flex flex-wrap items-end gap-2 sm:ml-auto" onSubmit={(event) => { event.preventDefault(); go(accountId, period.from, period.to); }}>
    <div className="grid min-w-44 gap-1">
      <Label htmlFor="rec-account" className="text-xs">Conta</Label>
      <OptionSelect id="rec-account" value={accountId} options={accounts} onValueChange={(conta) => conta && go(conta, from, to)} />
    </div>
    <div className="grid gap-1">
      <Label htmlFor="rec-from" className="text-xs">De</Label>
      <Input id="rec-from" type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="num w-38" required />
    </div>
    <div className="grid gap-1">
      <Label htmlFor="rec-to" className="text-xs">Até</Label>
      <Input id="rec-to" type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="num w-38" required />
    </div>
    <Button type="submit" variant={changed ? "default" : "outline"} size="lg">Aplicar</Button>
  </form>;
}
