"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconDownload, IconFileText, IconFileUpload, IconPhoto, IconTrash } from "@tabler/icons-react";
import { prepareAttachmentUpload, registerAttachment, removeAttachment } from "@/app/lancamentos/actions";
import { SectionCard, SectionHeader } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ATTACHMENT_ACCEPT, attachmentProblem, fileSize, type Attachment } from "@/lib/attachments";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Envia um arquivo: URL assinada (servidor) → PUT direto no Storage → registro auditado. */
async function upload(entryId: string, file: File): Promise<string | null> {
  const ticket = await prepareAttachmentUpload(entryId, { name: file.name, type: file.type, size: file.size });
  if ("error" in ticket) return ticket.error;
  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "content-type": ticket.contentType, "x-upsert": "false", "cache-control": "max-age=3600" },
  }).catch(() => null);
  if (!response?.ok) {
    const body = await response?.json().catch(() => null) as { message?: string; error?: string } | null;
    console.error("envio do anexo", response?.status, body);
    return `Não foi possível enviar “${file.name}”.`;
  }
  const result = await registerAttachment(entryId, ticket.path, file.name);
  return result.error ?? null;
}

export function EntryAttachments({ entryId, attachments, canEdit }: { entryId: string; attachments: Attachment[]; canEdit: boolean }) {
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<Attachment | null>(null);
  const [removing, startRemove] = useTransition();
  const base = `/lancamentos/${entryId}/anexos`;

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    let sent = 0;
    for (const file of files) {
      const problem = attachmentProblem(file);
      if (problem) { toast.error(problem); continue; }
      setUploading(file.name);
      const error = await upload(entryId, file);
      if (error) toast.error(error); else sent++;
    }
    setUploading(null);
    if (sent) { toast.success(sent === 1 ? "Comprovante anexado." : `${sent} comprovantes anexados.`); router.refresh(); }
  }

  function remove() {
    if (!toRemove) return;
    startRemove(async () => {
      const result = await removeAttachment(toRemove.id);
      setToRemove(null);
      if (result.error) { toast.error(result.error); return; }
      toast.info("Comprovante excluído.");
      router.refresh();
    });
  }

  return <SectionCard aria-labelledby="attachments-title">
    <SectionHeader title="Comprovantes" titleId="attachments-title"
      description="Cópia digital de notas e recibos (PDF, JPG, PNG ou HEIC, até 10 MB cada). A situação Pendente/Arquivado continua indicando a pasta física." />
    <div className="grid gap-3 p-5">
      {attachments.length > 0
        ? <ul className="m-0 grid list-none gap-1 p-0">{attachments.map((attachment) => {
            const Icon = attachment.content_type === "application/pdf" ? IconFileText : IconPhoto;
            return <li key={attachment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 py-1 hover:bg-muted/50">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`${base}/${attachment.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
                title={`Abrir ${attachment.file_name}`}>{attachment.file_name}</a>
              <span className="text-xs text-muted-foreground num">{fileSize(attachment.size_bytes)} · {dateTime.format(new Date(attachment.created_at))}</span>
              <a href={`${base}/${attachment.id}?baixar=1`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                aria-label={`Baixar ${attachment.file_name}`}><IconDownload className="size-3.5" aria-hidden /> Baixar</a>
              {canEdit && <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${attachment.file_name}`} title="Excluir comprovante" onClick={() => setToRemove(attachment)}><IconTrash /></Button>}
            </li>;
          })}</ul>
        : <p className="m-0 text-xs text-muted-foreground">Nenhum comprovante anexado.</p>}

      {canEdit && <div className="grid max-w-md gap-1.5">
        <Label htmlFor="attachment-file">Anexar comprovante</Label>
        <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-card px-2 text-xs hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring/30 has-disabled:cursor-wait has-disabled:opacity-60">
          <IconFileUpload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate" aria-live="polite">{uploading ? `Enviando “${uploading}”…` : "Escolher arquivos…"}</span>
          <input id="attachment-file" type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={onFiles} disabled={uploading !== null} />
        </label>
      </div>}
    </div>

    <Dialog open={toRemove !== null} onOpenChange={(open) => { if (!open) setToRemove(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir comprovante?</DialogTitle>
          <DialogDescription>“{toRemove?.file_name}” será apagado do armazenamento. A exclusão fica registrada na auditoria; a situação da pasta física não muda.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setToRemove(null)}>Cancelar</Button>
          <Button variant="destructive" onClick={remove} disabled={removing}>{removing ? "Excluindo…" : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SectionCard>;
}
