"use client";

export function ConfirmRemove({ email }: { email: string }) {
  return <button className="button danger" aria-label={`Remover acesso de ${email}`} onClick={(event) => {
    if (!window.confirm(`Remover o acesso de ${email}? A conta será bloqueada imediatamente.`)) event.preventDefault();
  }}>Remover</button>;
}
