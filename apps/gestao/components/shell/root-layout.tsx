import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@geas/ui/components/sonner";

/** Módulo do Gestão: cada um tem o próprio layout raiz, que marca o <html> com a cor de destaque (`theme.css`). */
export type GestaoModule = "gestao" | "financeiro" | "inventario" | "atividades";

export const baseMetadata: Metadata = {
  title: "GEAS Gestão",
  description: "Gestão financeira, materiais e atividades do grupo escoteiro",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/png", sizes: "128x128" },
      { url: "/favicon.png", type: "image/png", sizes: "128x128" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/favicon.png", type: "image/png", sizes: "128x128" }],
  },
  robots: { index: false, follow: false },
};

/**
 * <html> de um layout raiz. Trocar de módulo cruza layouts raiz e recarrega a página inteira (Next), o que
 * mantém `data-app` no <html> e, com ele, a cor certa também nos portais (diálogos, menus, toasts).
 */
export function RootHtml({ module, children }: { module: GestaoModule; children: ReactNode }) {
  return <html lang="pt-BR" data-app={module}><body>{children}<Toaster /></body></html>;
}
