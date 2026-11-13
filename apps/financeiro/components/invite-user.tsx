"use client";

import { useActionState, useState } from "react";
import { changeRole, inviteUser } from "@/app/usuarios/actions";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { useActionToast } from "@geas/ui/lib/use-action-toast";

const initialState: { error?: string; success?: string } = {};

const roleOptions = [
  { value: "viewer", label: "Consulta" },
  { value: "treasurer", label: "Tesoureiro" },
  { value: "admin", label: "Administrador" },
];

export function InviteUser() {
  const [state, action, pending] = useActionState(inviteUser, initialState);
  const [role, setRole] = useState("viewer");
  useActionToast(state);
  return <form action={action} className="grid gap-3 sm:grid-cols-[minmax(260px,1fr)_190px_auto] sm:items-end">
    <div className="grid gap-1.5"><Label htmlFor="invite-email">E-mail institucional</Label><Input id="invite-email" name="email" type="email" pattern=".+@escoteirosalbert\.com\.br" placeholder="nome@escoteirosalbert.com.br" required /></div>
    <div className="grid gap-1.5"><Label htmlFor="invite-role">Papel</Label><OptionSelect id="invite-role" value={role} onValueChange={setRole} options={roleOptions} /><input type="hidden" name="role" value={role} /></div>
    <Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar convite"}</Button>
  </form>;
}

/** Papel de um usuário na tabela: o cabeçalho "Papel" é o rótulo visível; cada linha tem o seu rótulo sr-only. */
export function UserRoleForm({ userId, email, role: initialRole }: { userId: string; email: string; role: string }) {
  const [role, setRole] = useState(initialRole);
  const id = `role-${userId}`;
  return <form action={changeRole} className="flex items-center gap-2">
    <input type="hidden" name="userId" value={userId} />
    <input type="hidden" name="role" value={role} />
    <Label className="sr-only" htmlFor={id}>Papel de {email}</Label>
    <OptionSelect id={id} value={role} onValueChange={setRole} options={roleOptions} className="w-40" />
    <Button type="submit" variant="outline" size="sm" aria-label={`Salvar papel de ${email}`}>Salvar</Button>
  </form>;
}
