"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { IconMenu2, IconX } from "@tabler/icons-react";

type Item = { href: string; label: string; active: boolean };

/**
 * Navegação do cabeçalho em telas menores (o CSS só mostra o botão abaixo de 1024px): um botão abre o painel com
 * as áreas do app e os utilitários por extenso. Fecha ao navegar, ao clicar fora ou com Esc.
 */
export function AppNavMenu({ items, utilities }: { items: Item[]; utilities: Item[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) { setShownFor(pathname); setOpen(false); }
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointer = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onPointer); };
  }, [open]);

  const link = (item: Item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} onClick={() => setOpen(false)}>{item.label}</Link>;
  return <div ref={ref} className="geas-header__menu">
    <button type="button" className="geas-header__menu-button" aria-expanded={open} aria-controls={panelId}
      aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen((value) => !value)}>
      {open ? <IconX size={20} aria-hidden /> : <IconMenu2 size={20} aria-hidden />}
    </button>
    {open && <nav id={panelId} aria-label="Menu" className="geas-header__panel">
      {items.map(link)}
      {utilities.length > 0 && <><hr />{utilities.map(link)}</>}
    </nav>}
  </div>;
}
