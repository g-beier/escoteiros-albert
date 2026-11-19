import { IconInfoCircle } from "@tabler/icons-react";

/** Aviso ao chefe: o que ele registra vale na hora e fica para revisar pelo gestor. */
export function ReviewNotice() {
  return <p className="m-0 flex items-center gap-1.5 text-xs text-muted-foreground">
    <IconInfoCircle className="size-3.5 shrink-0" aria-hidden />
    O que você registrar vale na hora e fica para revisar pelo gestor do inventário.
  </p>;
}
