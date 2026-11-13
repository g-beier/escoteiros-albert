import { IconInfoCircle } from "@tabler/icons-react";

/** Aviso ao chefe: o que ele registra vale na hora e fica pendente de revisão do gestor. */
export function ReviewNotice() {
  return <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">
    <IconInfoCircle className="size-3.5 shrink-0" aria-hidden />
    O que você registrar vale na hora e fica pendente de revisão do gestor do inventário.
  </p>;
}
