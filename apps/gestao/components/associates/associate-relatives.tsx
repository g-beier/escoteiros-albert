"use client";

import { Link } from "@geas/ui/components/link";
import { useState } from "react";
import { IconLink, IconPencil, IconPlus } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionCombobox, OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { cn } from "@geas/ui/lib/utils";
import { addRelative, unlinkRelative, updateRelative } from "@/app/(associados)/associados/actions";
import { ActionDialog } from "@/components/shell/action-dialog";
import { CELL_CLASS, HEAD_CLASS } from "@/components/shell/table-head";
import {
  KINSHIPS,
  kinshipLabels,
  kinshipText,
  guardianOrder,
  linkableRelatives,
  roleText,
  siblingText,
  type Relative,
  type RelativeLink,
} from "@/lib/associates/relatives";
import { Field } from "./associate-form";

const kinshipOptions = KINSHIPS.map((value) => ({ value, label: kinshipLabels[value] }));

type Open = { kind: "novo" | "vincular" } | { kind: "editar" | "desvincular"; link: RelativeLink } | null;

/**
 * Responsáveis do jovem: mãe, pai ou outro (irmã, avó…), com responsável legal e financeiro. Quem edita adiciona um
 * novo, vincula um já cadastrado (ex.: a mãe do irmão), edita e desvincula. Um responsável compartilhado por irmãos
 * tem as mesmas situações no controle de dados em todos eles.
 */
export function AssociateRelatives({
  associate,
  links,
  relatives,
  associates,
  canEdit,
}: {
  associate: { id: string; name: string };
  links: RelativeLink[];
  relatives: Relative[];
  /** Associados que podem ser também o responsável (ex.: mãe escotista). */
  associates: Option[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState<Open>(null);
  const close = (value: boolean) => {
    if (!value) setOpen(null);
  };
  const ordered = guardianOrder(links);
  const linkable = linkableRelatives(relatives, links);

  return (
    <SectionCard aria-labelledby="relatives-title">
      <SectionHeader
        title="Responsáveis"
        titleId="relatives-title"
        description="Mãe, pai ou outra pessoa que acompanha o jovem. Irmãos compartilham o mesmo responsável: vincule o já cadastrado."
      >
        <SectionCount>
          {links.length} {links.length === 1 ? "responsável" : "responsáveis"}
        </SectionCount>
        {canEdit && (
          <>
            {linkable.length > 0 && (
              <Button variant="outline" onClick={() => setOpen({ kind: "vincular" })}>
                <IconLink data-icon="inline-start" /> Vincular existente
              </Button>
            )}
            <Button onClick={() => setOpen({ kind: "novo" })}>
              <IconPlus data-icon="inline-start" /> Adicionar responsável
            </Button>
          </>
        )}
      </SectionHeader>
      {ordered.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum responsável cadastrado.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[620px]">
            <TableCaption className="sr-only">Responsáveis do jovem</TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD_CLASS}>Nome</TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-28")}>Parentesco</TableHead>
                <TableHead className={HEAD_CLASS}>Papel</TableHead>
                {canEdit && (
                  <TableHead className={cn(HEAD_CLASS, "w-48")}>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className={cn(CELL_CLASS, "whitespace-normal")}>
                    <span className="font-medium">{link.relative_name}</span>
                    {(link.relative_associate_id || link.sibling_count > 0) && (
                      <span className="block text-[11px] text-muted-foreground">
                        {link.relative_associate_id && (
                          <Link
                            href={`/associados/${link.relative_associate_id}`}
                            className="text-primary hover:underline"
                          >
                            também é associado
                          </Link>
                        )}
                        {link.relative_associate_id && link.sibling_count > 0 && " · "}
                        {link.sibling_count > 0 && siblingText(link.sibling_count)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={CELL_CLASS}>{kinshipText(link)}</TableCell>
                  <TableCell className={cn(CELL_CLASS, "whitespace-normal text-muted-foreground")}>
                    {roleText(link) || "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell className={CELL_CLASS}>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpen({ kind: "editar", link })}
                          aria-label={`Editar ${link.relative_name}`}
                        >
                          <IconPencil data-icon="inline-start" /> Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setOpen({ kind: "desvincular", link })}
                          aria-label={`Desvincular ${link.relative_name}`}
                        >
                          Desvincular
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {canEdit && open?.kind === "novo" && (
        <RelativeDialog mode="novo" associate={associate} associates={associates} onOpenChange={close} />
      )}
      {canEdit && open?.kind === "vincular" && (
        <RelativeDialog
          mode="vincular"
          associate={associate}
          associates={associates}
          onOpenChange={close}
          relatives={linkable.map((r) => ({ value: r.id, label: r.associate_id ? `${r.name} (associado)` : r.name }))}
        />
      )}
      {canEdit && open?.kind === "editar" && (
        <RelativeDialog
          mode="editar"
          associate={associate}
          associates={associates}
          onOpenChange={close}
          link={open.link}
          relative={relatives.find((r) => r.id === open.link.relative_id)}
        />
      )}
      {canEdit && open?.kind === "desvincular" && (
        <ActionDialog
          open
          onOpenChange={close}
          title={`Desvincular ${open.link.relative_name}?`}
          action={unlinkRelative}
          submitLabel="Desvincular"
          destructive
          hidden={{ linkId: open.link.id }}
          description={
            open.link.sibling_count > 0
              ? `Continua como responsável dos outros jovens ligados a ele (${siblingText(open.link.sibling_count)}).`
              : "Sem outro jovem ligado, o responsável é apagado, a não ser que já tenha situações no controle de dados."
          }
        >
          <span className="sr-only">Confirme para desvincular.</span>
        </ActionDialog>
      )}
    </SectionCard>
  );
}

/** Adicionar novo, vincular existente ou editar: parentesco (descrição quando "outro"), legal e financeiro. */
function RelativeDialog({
  mode,
  associate,
  associates,
  relatives = [],
  link,
  relative,
  onOpenChange,
}: {
  mode: "novo" | "vincular" | "editar";
  associate: { id: string; name: string };
  associates: Option[];
  relatives?: Option[];
  link?: RelativeLink;
  relative?: Relative;
  onOpenChange: (open: boolean) => void;
}) {
  const [relativeId, setRelativeId] = useState("");
  const [name, setName] = useState(link?.relative_name ?? "");
  const [relativeAssociateId, setRelativeAssociateId] = useState(link?.relative_associate_id ?? "");
  const [kinship, setKinship] = useState<string>(link?.kinship ?? "mae");
  const [legal, setLegal] = useState(link?.legal ?? true);
  const [financial, setFinancial] = useState(link?.financial ?? false);
  const others = associates.filter((a) => a.value !== associate.id);
  const hidden: Record<string, string> = { kinship, legal: legal ? "on" : "", financial: financial ? "on" : "" };
  if (mode === "editar")
    Object.assign(hidden, { linkId: link!.id, relativeId: link!.relative_id, relativeAssociateId });
  else
    Object.assign(
      hidden,
      { associateId: associate.id },
      mode === "vincular" ? { relativeId } : { relativeAssociateId },
    );

  const chooseAssociate = (value: string) => {
    setRelativeAssociateId(value);
    if (value && !name.trim()) setName(others.find((a) => a.value === value)?.label.replace(/ \(.*\)$/, "") ?? "");
  };

  const titles = {
    novo: `Novo responsável de ${associate.name}`,
    vincular: `Vincular responsável a ${associate.name}`,
    editar: `Editar ${link?.relative_name ?? ""}`,
  };
  const descriptions = {
    novo: "Os itens de controle de responsável já começam com o valor inicial configurado.",
    vincular: "Para irmãos: o mesmo responsável, com as mesmas situações no controle de dados.",
    editar:
      link && link.sibling_count > 0
        ? `Nome, associado e observações valem também para os irmãos (${siblingText(link.sibling_count)}).`
        : undefined,
  };
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title={titles[mode]}
      description={descriptions[mode]}
      action={mode === "editar" ? updateRelative : addRelative}
      submitLabel={
        mode === "novo" ? "Adicionar responsável" : mode === "vincular" ? "Vincular responsável" : "Salvar responsável"
      }
      hidden={hidden}
    >
      {mode === "vincular" ? (
        <Field id="relative-existing" label="Responsável" className="sm:col-span-2">
          <OptionCombobox
            id="relative-existing"
            value={relativeId}
            onValueChange={setRelativeId}
            options={relatives}
            placeholder="Buscar responsável"
            emptyText="Nenhum responsável."
          />
        </Field>
      ) : (
        <Field id="relative-name" label="Nome" className="sm:col-span-2">
          <Input
            id="relative-name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </Field>
      )}
      <Field id="relative-kinship" label="Parentesco">
        <OptionSelect id="relative-kinship" value={kinship} onValueChange={setKinship} options={kinshipOptions} />
      </Field>
      {kinship === "outro" ? (
        <Field id="relative-kinship-note" label="Qual parentesco">
          <Input
            id="relative-kinship-note"
            name="kinshipNote"
            required
            maxLength={40}
            defaultValue={link?.kinship_note ?? ""}
            placeholder="Ex.: irmã, avó"
          />
        </Field>
      ) : (
        <span aria-hidden className="hidden sm:block" />
      )}
      <div className="flex items-center gap-2">
        <Checkbox id="relative-legal" checked={legal} onCheckedChange={(checked) => setLegal(checked === true)} />
        <Label htmlFor="relative-legal">Responsável legal</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="relative-financial"
          checked={financial}
          onCheckedChange={(checked) => setFinancial(checked === true)}
        />
        <Label htmlFor="relative-financial">Responsável financeiro</Label>
      </div>
      {mode !== "vincular" && (
        <Field
          id="relative-associate"
          label="Também é associado (opcional)"
          className="sm:col-span-2"
          hint="Ex.: a mãe que é escotista no grupo."
        >
          <OptionCombobox
            id="relative-associate"
            value={relativeAssociateId}
            onValueChange={chooseAssociate}
            options={others}
            placeholder="Buscar associado"
            emptyText="Nenhum associado."
          />
        </Field>
      )}
      {mode === "editar" && (
        <Field id="relative-notes" label="Observações (opcional)" className="sm:col-span-2">
          <Input id="relative-notes" name="notes" maxLength={200} defaultValue={relative?.notes ?? ""} />
        </Field>
      )}
    </ActionDialog>
  );
}
