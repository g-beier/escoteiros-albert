import type { Icon } from "@tabler/icons-react";

// Ícones repetidos em listas longas: um `<symbol>` por ícone na página e um `<use>` em cada linha, em vez do SVG
// inteiro (com todos os atributos e caminhos) repetido centenas de vezes no HTML e no payload RSC.

/** Os símbolos da página (fica oculto); `icons` = { id: ícone do Tabler }. */
export function IconSprite({ icons }: { icons: Record<string, Icon> }) {
  return <svg aria-hidden width="0" height="0" className="absolute">
    {Object.entries(icons).map(([id, IconComponent]) => <symbol key={id} id={`i-${id}`} viewBox="0 0 24 24"><IconComponent /></symbol>)}
  </svg>;
}

/** Um ícone do sprite; decorativo (o nome vai no botão ou num texto `sr-only`). Tamanho pela classe. */
export function SpriteIcon({ id, className = "size-4" }: { id: string; className?: string }) {
  return <svg aria-hidden className={className}><use href={`#i-${id}`} /></svg>;
}
