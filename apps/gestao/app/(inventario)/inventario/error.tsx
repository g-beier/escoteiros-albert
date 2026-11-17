"use client";

import { PageBody, PageHeader } from "@geas/ui";
import { Button } from "@geas/ui/components/button";

/** Falha ao ler o banco numa tela do Inventário (DataError de lib/server): mensagem e tentar de novo. */
export default function InventoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageBody width="narrow">
    <PageHeader title="Não foi possível carregar" crumbs={[{ label: "Inventário", href: "/inventario" }, { label: "Erro" }]}
      description={process.env.NODE_ENV === "production" ? "Tente de novo em instantes. Se continuar, avise a administração." : error.message}
      actions={<Button onClick={reset}>Tentar de novo</Button>} />
  </PageBody>;
}
