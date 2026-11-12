"use client";

import Link from "next/link";
import { IconLogout, IconUser, IconUsers } from "@tabler/icons-react";
import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = { admin: "Administração", treasurer: "Tesouraria", viewer: "Consulta" };

/** Iniciais do email ("gustav.beier@…" → "GB"). */
export function initials(email: string) {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Menu da pessoa logada: email, papel, Usuários (administração) e Sair. */
export function UserMenu({ email, role, active }: { email: string; role: string; active: boolean }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Conta de ${email}`} title={email}
      className={cn("rounded-full", active && "bg-accent")} />}>
      <span className="grid size-7 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{initials(email) || <IconUser className="size-4" />}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="grid gap-0.5">
          <span className="truncate font-semibold text-foreground">{email}</span>
          <span className="text-xs font-normal text-muted-foreground">{ROLE_LABELS[role] ?? role}</span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      {role === "admin" && <DropdownMenuItem render={<Link href="/usuarios" />}><IconUsers /> Usuários</DropdownMenuItem>}
      <DropdownMenuItem onClick={() => { void logout(); }}><IconLogout /> Sair</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
