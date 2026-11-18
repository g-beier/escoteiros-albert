import { redirect } from "next/navigation";

/** A lista por Estado/Dono ficou no Início do módulo (`/inventario`). */
export default async function Materials({ searchParams }: {
  searchParams: Promise<{ status?: string; dono?: string; ord?: string; dir?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams();
  for (const key of ["status", "dono", "ord", "dir", "pagina"] as const) {
    if (params[key]) q.set(key, params[key]!);
  }
  const s = q.toString();
  redirect(s ? `/inventario?${s}` : "/inventario");
}
