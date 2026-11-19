import type { MatrixPerson } from "./controls";

// Responsáveis dos jovens (041): mãe, pai ou outro (irmã, avó…), com os papéis de responsável legal e financeiro.
// Um responsável pode estar ligado a vários jovens (irmãos) e pode ser também associado. Puro.

export const KINSHIPS = ["mae", "pai", "outro"] as const;
export type Kinship = (typeof KINSHIPS)[number];
export const kinshipLabels: Record<Kinship, string> = { mae: "Mãe", pai: "Pai", outro: "Outro" };
export const isKinship = (value: string): value is Kinship => (KINSHIPS as readonly string[]).includes(value);

/** Linha de `relatives` (responsáveis do grupo). */
export type Relative = { id: string; name: string; associate_id: string | null; notes: string | null };

/** Linha de `relative_link_rows`: o vínculo jovem × responsável. `sibling_count` = outros jovens ligados ao mesmo responsável. */
export type RelativeLink = {
  id: string; associate_id: string; relative_id: string; relative_name: string; relative_associate_id: string | null;
  kinship: Kinship; kinship_note: string | null; legal: boolean; financial: boolean; position: number; sibling_count: number;
};

/** Parentesco em texto: "Mãe", "Pai" ou a descrição do "outro" (ex.: "Irmã"). */
export const kinshipText = (link: Pick<RelativeLink, "kinship" | "kinship_note">) =>
  link.kinship === "outro" ? link.kinship_note?.trim() || kinshipLabels.outro : kinshipLabels[link.kinship];

/** Papéis do vínculo: "responsável legal", "financeiro". */
export function roleText(link: Pick<RelativeLink, "legal" | "financial">): string {
  return [link.legal && "responsável legal", link.financial && "financeiro"].filter(Boolean).join(" · ");
}

export const siblingText = (count: number) => (count === 1 ? "compartilhado com 1 irmão" : `compartilhado com ${count} irmãos`);

/** Ordem dos vínculos de um jovem: posição, depois mãe, pai, outro, e nome. */
export function orderedLinks<T extends Pick<RelativeLink, "position" | "kinship" | "relative_name">>(links: T[]): T[] {
  return [...links].sort((a, b) => a.position - b.position || KINSHIPS.indexOf(a.kinship) - KINSHIPS.indexOf(b.kinship)
    || a.relative_name.localeCompare(b.relative_name, "pt-BR", { sensitivity: "base" }));
}

/** Vínculos por jovem (id → vínculos em ordem). */
export function linksByAssociate<T extends RelativeLink>(links: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const link of links) map.set(link.associate_id, [...(map.get(link.associate_id) ?? []), link]);
  for (const [key, list] of map) map.set(key, orderedLinks(list));
  return map;
}

/**
 * Linhas dos responsáveis sob um jovem na matriz: público "responsavel", parentesco no detalhe. Ativo se algum
 * jovem ligado a ele estiver ativo (desligados sem registro não são cobrados). O responsável que também é associado
 * ativo (`activeAssociates`) fica de fora: os itens dele já são controlados na linha de adulto; se o associado
 * estiver desligado, a linha volta, com as situações próprias do responsável.
 */
export function relativeRows(links: RelativeLink[], activeRelatives: ReadonlySet<string>, activeAssociates: ReadonlySet<string> = new Set()): MatrixPerson[] {
  return orderedLinks(links).filter((link) => !link.relative_associate_id || !activeAssociates.has(link.relative_associate_id)).map((link) => ({
    id: link.relative_id, name: link.relative_name, relative: true, audiences: ["responsavel"],
    active: activeRelatives.has(link.relative_id), detail: kinshipText(link),
  }));
}

/** Responsáveis ligados a pelo menos um jovem ativo. */
export function activeRelativeIds(links: Pick<RelativeLink, "associate_id" | "relative_id">[], activeAssociates: ReadonlySet<string>): Set<string> {
  return new Set(links.filter((link) => activeAssociates.has(link.associate_id)).map((link) => link.relative_id));
}

/** Responsáveis do grupo que ainda não estão ligados ao jovem (para "vincular existente"), por nome. */
export function linkableRelatives(relatives: Relative[], links: Pick<RelativeLink, "relative_id">[]): Relative[] {
  const linked = new Set(links.map((link) => link.relative_id));
  return relatives.filter((r) => !linked.has(r.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

/** Descrição do parentesco: obrigatória quando "outro" (até 40 caracteres); ignorada nos outros casos. Devolve a mensagem de erro, ou null. */
export function kinshipNoteError(kinship: Kinship, note: string | null): string | null {
  if (kinship !== "outro") return null;
  if (!note) return "Descreva o parentesco (ex.: irmã, avó).";
  return note.length > 40 ? "Parentesco: no máximo 40 caracteres." : null;
}
