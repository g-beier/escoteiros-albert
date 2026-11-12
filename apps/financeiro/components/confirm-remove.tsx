"use client";

import { Button } from "@/components/ui/button";

export function ConfirmRemove({ email }: { email: string }) {
  return <Button type="submit" variant="destructive" size="sm" aria-label={`Remover acesso de ${email}`} onClick={(event) => {
    if (!window.confirm(`Remover o acesso de ${email}? A conta será bloqueada imediatamente.`)) event.preventDefault();
  }}>Remover</Button>;
}
