"use client";

import Link from "next/link";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { cn } from "@geas/ui/lib/utils";

type Tab = { href: string; label: string; active: boolean };

/**
 * Abas de uma área em telas pequenas: a aba atual vira um botão (mesmo visual da aba ativa) que abre um menu de links.
 * É navegação, não campo de formulário: o nome da área vai no rótulo acessível do botão.
 */
export function SectionTabsMenu({ tabs, label, className }: { tabs: Tab[]; label: string; className?: string }) {
  const current = tabs.find((tab) => tab.active);
  return <div className={className}>
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" aria-label={`${label}: ${current?.label ?? "escolher"}`}
        className="inline-flex max-w-full items-center gap-1 rounded-full bg-foreground py-1 pr-2 pl-3 text-xs font-semibold text-background" />}>
        <span className="truncate">{current?.label ?? label}</span><IconChevronDown className="size-3.5 shrink-0" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {tabs.map((tab) => <DropdownMenuItem key={tab.href} render={<Link href={tab.href} aria-current={tab.active ? "page" : undefined} />}
          className={cn(tab.active && "font-semibold")}>
          <IconCheck className={cn(!tab.active && "invisible")} aria-hidden />{tab.label}
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
