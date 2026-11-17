import * as registry from "@/lib/server/finance/registry";
import { pageMember } from "@/lib/server/session";

/** Usuário, papel e cadastros usados pelo formulário de lançamento. */
export async function loadEntryContext() {
  const member = await pageMember();
  const catalogs = await registry.entryCatalogs(member.db, member.groupId);
  return { member, db: member.db, user: member.user, role: member.finance.role, canEdit: member.finance.canEdit, catalogs };
}
