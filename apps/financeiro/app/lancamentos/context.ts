import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries } from "@/lib/auth";
import type { Catalogs } from "@/components/entries/entry-form";

/** Usuário, papel e cadastros usados pelo formulário de lançamento. */
export async function loadEntryContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!membership) redirect("/");
  const groupId = membership.group_id as string;
  const [{ data: categories }, { data: paymentMethods }, { data: associates }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id").eq("group_id", groupId),
    supabase.from("payment_methods").select("id, name, active").eq("group_id", groupId).order("name"),
    supabase.from("associates").select("id, name, active").eq("group_id", groupId).order("name"),
  ]);
  const catalogs: Catalogs = { categories: (categories ?? []) as Catalogs["categories"], paymentMethods: paymentMethods ?? [], associates: associates ?? [] };
  return { supabase, user, role: membership.role as string, canEdit: canManageEntries(membership.role), catalogs };
}
