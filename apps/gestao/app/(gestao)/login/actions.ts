"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/lib/server/auth";

export async function logout() {
  await signOut();
  redirect("/login");
}
