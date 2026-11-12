import { pageMember } from "@/lib/session";
import type { Catalogs } from "@/components/entries/entry-form";

/** Usuário, papel e cadastros usados pelo formulário de lançamento. */
export async function loadEntryContext() {
  const { supabase, user, groupId, role, canEdit } = await pageMember();
  const [{ data: categories }, { data: paymentMethods }, { data: associates }, { data: accounts }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id").eq("group_id", groupId),
    supabase.from("payment_methods").select("id, name, active, default_account_id").eq("group_id", groupId).order("name"),
    supabase.from("associates").select("id, name, active").eq("group_id", groupId).order("name"),
    supabase.from("accounts").select("id, name, active").eq("group_id", groupId).order("name"),
  ]);
  const catalogs: Catalogs = {
    categories: (categories ?? []) as Catalogs["categories"],
    paymentMethods: paymentMethods ?? [],
    associates: associates ?? [],
    accounts: accounts ?? [],
  };
  return { supabase, user, role, canEdit, catalogs };
}
