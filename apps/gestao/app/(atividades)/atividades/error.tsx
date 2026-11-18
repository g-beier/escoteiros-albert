"use client";

import { PageBody, PageHeader } from "@geas/ui";
import { Button } from "@geas/ui/components/button";

/** Falha ao ler o banco numa tela de Atividades (DataError de lib/server). */
export default function ActivitiesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageBody width="narrow">
    <PageHeader title="Não foi possível carregar"
      description={process.env.NODE_ENV === "production" ? "Tente de novo em instantes. Se continuar, avise a administração." : error.message}
      actions={<Button onClick={reset}>Tentar de novo</Button>} />
  </PageBody>;
}
