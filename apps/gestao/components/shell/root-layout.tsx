import type { Metadata } from "next";
import type { ReactNode } from "react";
import favicon from "@/assets/images/favicon.png";
import { Toaster } from "@geas/ui/components/sonner";

/** Módulo do Gestão: cada um tem o próprio layout raiz, que marca o <html> com a cor de destaque (`theme.css`). */
export type GestaoModule = "gestao" | "financeiro" | "inventario" | "associados";

export const baseMetadata: Metadata = {
  title: "GEAS Gestão",
  description: "Gestão financeira, de materiais e de associados do grupo escoteiro",
  icons: {
    // arquivo importado: a URL leva o hash do conteúdo, então o cache de 1 ano nunca mostra ícone velho
    icon: [{ url: favicon.src, type: "image/png", sizes: "128x128" }],
    shortcut: favicon.src,
    apple: [{ url: favicon.src, type: "image/png", sizes: "128x128" }],
  },
  robots: { index: false, follow: false },
};

/**
 * <html> de um layout raiz. Trocar de módulo cruza layouts raiz e recarrega a página inteira (Next), o que
 * mantém `data-app` no <html> e, com ele, a cor certa também nos portais (diálogos, menus, toasts).
 */
export function RootHtml({ module, children }: { module: GestaoModule; children: ReactNode }) {
  return (
    <html lang="pt-BR" data-app={module}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
