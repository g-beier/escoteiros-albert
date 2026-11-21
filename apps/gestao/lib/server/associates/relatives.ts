import type { Kinship, Relative, RelativeLink } from "@/lib/associates/relatives";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, sb } from "@/lib/server/supabase/db";

// Responsáveis dos jovens (041): leituras de `relatives` e `relative_link_rows`; escritas só pelas funções auditadas
// relatives_* (conferem `can_manage_associates`; só jovem, ramo ≠ adulto, tem responsável).

const LINK_COLUMNS = "id, associate_id, relative_id, relative_name, relative_associate_id, kinship, kinship_note, legal, financial, position, sibling_count";

/** Responsáveis do grupo, por nome (para vincular um existente a outro jovem). */
export async function list(db: Db, groupId: string): Promise<Relative[]> {
  return rowsOf(await sb(db).from("relatives").select("id, name, associate_id, notes").eq("group_id", groupId).order("name").limit(10000));
}

/** Vínculos jovem × responsável do grupo (matriz da aba Jovens). */
export async function links(db: Db, groupId: string): Promise<RelativeLink[]> {
  return rowsOf(await sb(db).from("relative_link_rows").select(LINK_COLUMNS).eq("group_id", groupId).limit(20000)) as RelativeLink[];
}

/** Vínculos de um jovem. */
export async function linksOf(db: Db, associateId: string): Promise<RelativeLink[]> {
  return rowsOf(await sb(db).from("relative_link_rows").select(LINK_COLUMNS).eq("associate_id", associateId)) as RelativeLink[];
}

export type LinkInput = { kinship: Kinship; kinshipNote: string | null; legal: boolean; financial: boolean };

/** Cria o responsável e o vincula ao jovem (com as situações iniciais dos itens de responsável). */
export async function create(db: Db, associateId: string, input: LinkInput & { name: string; relativeAssociateId: string | null }): Promise<string> {
  return rpc(db, "relatives_create", {
    p_associate_id: associateId, p_name: input.name, p_kinship: input.kinship, p_kinship_note: input.kinshipNote,
    p_legal: input.legal, p_financial: input.financial, p_relative_associate_id: input.relativeAssociateId,
  });
}

/** Vincula um responsável já cadastrado (ex.: a mãe do irmão) a outro jovem. */
export async function link(db: Db, associateId: string, relativeId: string, input: LinkInput): Promise<string> {
  return rpc(db, "relatives_link", {
    p_associate_id: associateId, p_relative_id: relativeId, p_kinship: input.kinship, p_kinship_note: input.kinshipNote,
    p_legal: input.legal, p_financial: input.financial,
  });
}

export async function updateLink(db: Db, linkId: string, input: LinkInput): Promise<void> {
  await rpc(db, "relatives_update_link", {
    p_link_id: linkId, p_kinship: input.kinship, p_kinship_note: input.kinshipNote, p_legal: input.legal, p_financial: input.financial,
  });
}

/** Nome, associado e observações do responsável (valem para todos os jovens ligados a ele). */
export async function rename(db: Db, relativeId: string, name: string, relativeAssociateId: string | null, notes: string | null): Promise<void> {
  await rpc(db, "relatives_rename", { p_relative_id: relativeId, p_name: name, p_relative_associate_id: relativeAssociateId, p_notes: notes });
}

/** Desfaz o vínculo; o responsável sem outro vínculo e sem situações é apagado. */
export async function unlink(db: Db, linkId: string): Promise<void> {
  await rpc(db, "relatives_unlink", { p_link_id: linkId });
}
