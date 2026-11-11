"use client";

import { useActionState } from "react";
import { inviteUser } from "@/app/usuarios/actions";

const initialState: { error?: string; success?: string } = {};

export function InviteUser() {
  const [state, action, pending] = useActionState(inviteUser, initialState);
  return <form action={action} className="invite-form">
    <div className="field"><label htmlFor="invite-email">E-mail institucional</label><input className="input" id="invite-email" name="email" type="email" pattern=".+@escoteirosalbert\.com\.br" placeholder="nome@escoteirosalbert.com.br" required /></div>
    <div className="field"><label htmlFor="invite-role">Papel</label><select className="input" id="invite-role" name="role" defaultValue="viewer"><option value="viewer">Consulta</option><option value="treasurer">Tesoureiro</option><option value="admin">Administrador</option></select></div>
    <button className="button" disabled={pending}>{pending ? "Enviando…" : "Enviar convite"}</button>
    {state.error && <div className="error full-row">{state.error}</div>}
    {state.success && <div className="success full-row">{state.success}</div>}
  </form>;
}
