"use client";

import { IconAlertCircle, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import { Toaster as Sonner } from "sonner";

/** Notificações curtas: verde = sucesso, vermelho = falha, cinza = neutro (paleta do Albert). */
export function Toaster() {
  return <Sonner
    position="bottom-right"
    duration={4000}
    closeButton
    icons={{
      success: <IconCircleCheck className="size-4" aria-hidden />,
      error: <IconAlertCircle className="size-4" aria-hidden />,
      info: <IconInfoCircle className="size-4" aria-hidden />,
    }}
    toastOptions={{
      unstyled: true,
      classNames: {
        toast: "group relative flex w-full items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 pr-8 font-sans text-xs font-medium text-foreground shadow-md",
        success: "border-success/30 bg-success-soft text-success",
        error: "border-destructive/30 bg-destructive-soft text-destructive",
        info: "border-border bg-muted text-muted-foreground",
        icon: "flex shrink-0 items-center",
        title: "leading-snug",
        closeButton: "absolute top-1/2 right-1.5 left-auto flex size-5 -translate-y-1/2 items-center justify-center rounded-full opacity-60 hover:opacity-100 [&_svg]:size-3",
      },
    }}
  />;
}
