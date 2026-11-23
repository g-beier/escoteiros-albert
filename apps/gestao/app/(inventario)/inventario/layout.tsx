import { requireModule } from "@/lib/server/session";

/** Só quem tem acesso ao Inventário entra; os demais voltam para o Início. */
export default async function InventarioLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireModule("inventario");
  return children;
}
