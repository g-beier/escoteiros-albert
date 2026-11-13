import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null };
  const { data } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  return { supabase, user, membership: data ? { groupId: data.group_id as string, role: data.role as string, canEdit: data.role === "admin" || data.role === "treasurer" } : null };
});

export async function pageSession() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  return session;
}
