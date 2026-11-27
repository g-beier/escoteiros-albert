import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * Link dos apps internos: `next/link` sem prefetch. As páginas são dinâmicas e sem `loading.tsx`, então o prefetch
 * não adianta os dados da tela, só faz uma requisição por link visível (mais de 1.000 ao rolar uma lista longa).
 * Passe `prefetch` só onde houver ganho medido.
 */
export function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
