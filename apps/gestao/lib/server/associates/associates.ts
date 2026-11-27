import type {
  AssociateMove,
  AssociateMovement,
  AssociateProfile,
  QuarantinedAssociate,
  Registration,
  ScoutBranch,
} from "@/lib/associates/model";
import type { Db } from "@/lib/server/db";
import { count, one, rows, rpc, run } from "@/lib/server/pg/db";

// Cadastro de associados (040): leituras de `associate_profile_rows`, `associate_moves` e `associate_movements`;
// escritas só pelas funções auditadas associates_* (conferem `can_manage_associates`).

const PROFILE_COLUMNS =
  "id, name, branch, active, section_id, section, patrol_id, patrol, birth_date, promise_date, joined_on, notes, left_on, review_status, transition_started_on, registration, nickname";

/** Associados do grupo (ativos e desligados), por nome. */
export async function list(db: Db, groupId: string): Promise<AssociateProfile[]> {
  return rows<AssociateProfile>(
    db,
    (sql) => sql`
    select ${sql.unsafe(PROFILE_COLUMNS)} from public.associate_profile_rows where group_id = ${groupId} order by name limit 10000`,
  );
}

/**
 * Busca de associados ativos pelo nome ou apelido (registro rápido): sem acento nem maiúsculas, todas as palavras
 * precisam aparecer (`terms` já normalizados, como `searchTerms`). Até `limit` + 1 linhas, para saber se há mais.
 */
export async function search(db: Db, groupId: string, terms: string[], limit: number): Promise<AssociateProfile[]> {
  if (!terms.length) return [];
  return rows<AssociateProfile>(
    db,
    (sql) => sql`
    select ${sql.unsafe(PROFILE_COLUMNS)} from public.associate_profile_rows p
    where p.group_id = ${groupId} and p.active
      and not exists (select 1 from unnest(${terms}::text[]) t
        where position(t in public.inventory_search_normalize(p.name || ' ' || coalesce(p.nickname, ''))) = 0)
    order by p.name limit ${limit + 1}`,
  );
}

export async function get(db: Db, groupId: string, id: string): Promise<AssociateProfile | null> {
  return one<AssociateProfile>(
    db,
    (sql) => sql`
    select ${sql.unsafe(PROFILE_COLUMNS)} from public.associate_profile_rows where group_id = ${groupId} and id = ${id}`,
  );
}

/** Passagens e entradas/saídas do associado, da mais recente para a mais antiga. */
export async function history(db: Db, id: string): Promise<{ moves: AssociateMove[]; movements: AssociateMovement[] }> {
  return run(db, async (sql) => {
    const [moves, movements] = await Promise.all([
      sql`select id, move_date, from_branch, to_branch, from_section_id, to_section_id, to_patrol_id, created_at
          from public.associate_moves where associate_id = ${id} order by move_date desc, created_at desc`,
      sql`select id, kind, movement_date, reason, created_at
          from public.associate_movements where associate_id = ${id} order by movement_date desc, created_at desc`,
    ]);
    return {
      moves: [...moves] as unknown as AssociateMove[],
      movements: [...movements] as unknown as AssociateMovement[],
    };
  });
}

export type Dates = { birthDate: string | null; promiseDate: string | null; joinedOn: string | null };
export type CreateInput = Dates & {
  name: string;
  branch: ScoutBranch;
  sectionId: string | null;
  patrolId: string | null;
  notes: string | null;
};
export type UpdateInput = Dates & {
  id: string;
  name: string;
  notes: string | null;
  registration: Registration;
  nickname: string | null;
  /** Correção da divisão, sem passagem no histórico (055); ausente mantém a atual. */
  placement?: { branch: ScoutBranch; sectionId: string | null; patrolId: string | null };
};
export type MoveInput = {
  id: string;
  date: string;
  branch: ScoutBranch;
  sectionId: string | null;
  patrolId: string | null;
};

/** Cadastra (com a entrada na data de entrada, ou hoje) e devolve o id. */
export async function create(db: Db, groupId: string, input: CreateInput): Promise<string> {
  return rpc(db, "associates_create", {
    p_group_id: groupId,
    p_name: input.name,
    p_branch: input.branch,
    p_section_id: input.sectionId,
    p_patrol_id: input.patrolId,
    p_birth_date: input.birthDate,
    p_promise_date: input.promiseDate,
    p_joined_on: input.joinedOn,
    p_notes: input.notes,
  });
}

/** Cadastro pelo registro rápido (049): o mesmo de `create`, para a Diretoria revisar. */
export async function createQuick(db: Db, groupId: string, input: CreateInput): Promise<string> {
  return rpc(db, "associates_create_quick", {
    p_group_id: groupId,
    p_name: input.name,
    p_branch: input.branch,
    p_section_id: input.sectionId,
    p_patrol_id: input.patrolId,
    p_birth_date: input.birthDate,
    p_promise_date: input.promiseDate,
    p_joined_on: input.joinedOn,
    p_notes: input.notes,
  });
}

/** Marca cadastros do registro rápido como revisados; devolve quantos estavam para revisar. */
export async function review(db: Db, groupId: string, ids: string[]): Promise<number> {
  return rpc(db, "associates_review", { p_group_id: groupId, p_associate_ids: ids });
}

/** Marca o início da transição de ramo (ou a partida programada, no Pioneiro); `null` desmarca (050). */
export async function setTransition(db: Db, id: string, date: string | null): Promise<void> {
  await rpc(db, "associates_set_transition", { p_associate_id: id, p_date: date as string });
}

/** Cadastros do registro rápido ainda não revisados. */
export async function countToReview(db: Db, groupId: string): Promise<number> {
  return count(
    db,
    (sql) => sql`select count(*) from public.associates where group_id = ${groupId} and review_status = 'para_revisar'`,
  );
}

/** Nome, datas, observações, registro, apelido e a correção de ramo, seção e equipe (sem histórico, 055). */
export async function update(db: Db, input: UpdateInput): Promise<void> {
  await rpc(db, "associates_update", {
    p_associate_id: input.id,
    p_name: input.name,
    p_birth_date: input.birthDate,
    p_promise_date: input.promiseDate,
    p_joined_on: input.joinedOn,
    p_notes: input.notes,
    p_registration: input.registration,
    p_nickname: input.nickname as string,
    ...(input.placement && {
      p_branch: input.placement.branch,
      p_section_id: input.placement.sectionId as string,
      p_patrol_id: input.placement.patrolId as string,
    }),
  });
}

/** Passagem: cerimônia que leva o jovem ao ramo seguinte (e à seção e equipe dele) numa data. */
export async function move(db: Db, input: MoveInput): Promise<void> {
  await rpc(db, "associates_move", {
    p_associate_id: input.id,
    p_date: input.date,
    p_branch: input.branch,
    p_section_id: input.sectionId,
    p_patrol_id: input.patrolId,
  });
}

export async function leave(db: Db, id: string, date: string, reason: string | null): Promise<void> {
  await rpc(db, "associates_leave", { p_associate_id: id, p_date: date, p_reason: reason });
}

/** Pede a exclusão (018): some das telas na hora e é apagado de vez depois da quarentena. Devolve a data da exclusão. */
export async function requestDeletion(db: Db, id: string, reason: string): Promise<string> {
  return rpc(db, "associates_request_deletion", { p_associate_id: id, p_reason: reason });
}

/** Restaura um associado em quarentena. */
export async function cancelDeletion(db: Db, id: string): Promise<void> {
  await rpc(db, "associates_cancel_deletion", { p_associate_id: id });
}

/** Associados em quarentena do grupo, do que sai antes ao que sai depois. Só Editor. */
export async function quarantine(db: Db, groupId: string): Promise<QuarantinedAssociate[]> {
  return rows<QuarantinedAssociate>(
    db,
    (sql) => sql`
    select id, name, branch, active, deletion_due_on::text, deletion_requested_at::text, requested_by, deletion_reason
    from public.associates_quarantine(${groupId})`,
  );
}

export async function rejoin(db: Db, id: string, date: string, reason: string | null): Promise<void> {
  await rpc(db, "associates_rejoin", { p_associate_id: id, p_date: date, p_reason: reason });
}
