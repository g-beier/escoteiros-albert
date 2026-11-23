import { requireModule } from "@/lib/server/session";

/** Só quem tem acesso ao Associados entra; os demais voltam para o Início. */
export default async function AssociadosLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireModule("associados");
  return children;
}
