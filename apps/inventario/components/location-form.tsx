"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { Textarea } from "@geas/ui/components/textarea";
import { useActionToast, type ActionResult } from "@geas/ui/lib/use-action-toast";
import { createLocation } from "@/app/actions";

const initialState: ActionResult = {};

export function LocationForm() {
  const [state, action, pending] = useActionState(createLocation, initialState);
  const form = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => { if (state.success) form.current?.reset(); }, [state]);

  return <form ref={form} action={action} className="grid gap-3">
    <div className="grid gap-1.5"><Label htmlFor="location-name">Nome</Label><Input id="location-name" name="name" placeholder="Ex.: Almoxarifado" required minLength={2} maxLength={100} /></div>
    <div className="grid gap-1.5"><Label htmlFor="location-description">Descrição</Label><Textarea id="location-description" name="description" placeholder="Ex.: Armário da sede, sala 2" maxLength={300} rows={3} /></div>
    <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar local"}</Button></div>
  </form>;
}
