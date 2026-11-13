"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { deleteImportProfile, renameImportProfile, type CatalogFormState } from "@/app/configuracoes/actions";
import { SectionCard, SectionCount, SectionHeader } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateBR } from "@/lib/format";
import type { ProfileAccountUse } from "@/lib/import-flow";
import { useActionToast } from "@/lib/use-action-toast";

export type ProfileItem = {
  id: string;
  name: string;
  format: string;
  summary: string;
  updatedAt: string;
  accounts: ProfileAccountUse[];
};

const initial: CatalogFormState = {};

/** Perfis de leitura do extrato OFX: em que contas foram usados, renomear e excluir. */
export function ProfilesManager({ profiles }: { profiles: ProfileItem[] }) {
  const [renaming, setRenaming] = useState<ProfileItem | null>(null);
  return <SectionCard aria-labelledby="profiles-title">
    <SectionHeader title="Perfis de leitura" titleId="profiles-title"
      description={<>Criados e atualizados ao importar em <Link href="/extrato/importar" className="underline">Extrato › Importar</Link>; ajustes de leitura (separar MEMO, prefixos, linhas a ignorar) se mudam lá.</>}>
      <SectionCount>{profiles.length} {profiles.length === 1 ? "perfil" : "perfis"}</SectionCount>
    </SectionHeader>
    {profiles.length === 0
      ? <p className="m-0 px-4 py-3 text-xs text-muted-foreground">Nenhum perfil ainda. O primeiro é salvo na primeira importação de extrato.</p>
      : <Table>
        <TableCaption className="sr-only">Perfis de leitura do grupo</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className="h-8 px-3">Perfil</TableHead>
          <TableHead className="h-8 px-3">Contas</TableHead>
          <TableHead className="h-8 px-3">Ajustes de leitura</TableHead>
          <TableHead className="h-8 px-3">Atualizado</TableHead>
          <TableHead className="h-8 px-3"><span className="sr-only">Ações</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{profiles.map((profile) => <ProfileRow key={profile.id} profile={profile} onRename={() => setRenaming(profile)} />)}</TableBody>
      </Table>}
    <Dialog open={renaming !== null} onOpenChange={(open) => { if (!open) setRenaming(null); }}>
      <DialogContent className="w-[min(28rem,calc(100%-2rem))]">
        {renaming && <RenameForm key={renaming.id} profile={renaming} onDone={() => setRenaming(null)} />}
      </DialogContent>
    </Dialog>
  </SectionCard>;
}

function ProfileRow({ profile, onRename }: { profile: ProfileItem; onRename: () => void }) {
  const [state, remove, removing] = useActionState(deleteImportProfile, initial);
  useActionToast(state);
  const current = profile.accounts.filter((use) => use.current);
  return <TableRow>
    <TableCell className="px-3 py-1">
      <div className="font-medium">{profile.name}</div>
      {profile.format !== "ofx" && <div className="text-xs text-muted-foreground">Formato {profile.format.toUpperCase()}: não é mais usado na importação</div>}
    </TableCell>
    <TableCell className="px-3 py-1">
      {profile.accounts.length === 0
        ? <span className="text-muted-foreground">Nenhuma importação</span>
        : <div className="flex flex-wrap gap-1.5">{profile.accounts.map((use) => <Badge key={use.accountId} variant={use.current ? "default" : "outline"}
          title={use.current ? "Perfil da última importação desta conta: é aplicado na próxima" : "Usado em importações anteriores desta conta"}>
          {use.accountName} <span className="num">({use.imports})</span>{use.current ? " · atual" : ""}
        </Badge>)}</div>}
    </TableCell>
    <TableCell className="px-3 py-1 text-muted-foreground">{profile.summary}</TableCell>
    <TableCell className="px-3 py-1 num">{dateBR(profile.updatedAt.slice(0, 10))}</TableCell>
    <TableCell className="px-3 py-1">
      <div className="flex items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Renomear ${profile.name}`} onClick={onRename}><IconPencil /></Button>
        <form action={remove} onSubmit={(event) => {
          const warning = current.length
            ? ` É o perfil atual de ${current.map((use) => use.accountName).join(", ")}: a próxima importação começa com sugestões.`
            : "";
          if (!window.confirm(`Excluir o perfil “${profile.name}”?${warning} As importações feitas com ele continuam.`)) event.preventDefault();
        }}>
          <input type="hidden" name="id" value={profile.id} />
          <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Excluir ${profile.name}`} disabled={removing}><IconTrash /></Button>
        </form>
      </div>
    </TableCell>
  </TableRow>;
}

function RenameForm({ profile, onDone }: { profile: ProfileItem; onDone: () => void }) {
  const [state, action, pending] = useActionState(renameImportProfile, initial);
  useActionToast(state);
  useEffect(() => { if (state.success) onDone(); }, [state, onDone]);
  return <form action={action} className="grid gap-3">
    <DialogHeader>
      <DialogTitle>Renomear perfil</DialogTitle>
      <DialogDescription>O nome aparece na importação e nas importações recentes.</DialogDescription>
    </DialogHeader>
    <input type="hidden" name="id" value={profile.id} />
    <div className="grid gap-1.5"><Label htmlFor={`profile-name-${profile.id}`}>Nome do perfil</Label>
      <Input id={`profile-name-${profile.id}`} name="name" defaultValue={profile.name} minLength={2} maxLength={80} required autoFocus placeholder="Ex.: Nubank OFX" /></div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar nome"}</Button>
    </DialogFooter>
  </form>;
}
