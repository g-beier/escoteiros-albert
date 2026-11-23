import { requireModule } from "@/lib/server/session";

/** Só quem tem acesso ao Financeiro entra; os demais voltam para o Início. */
export default async function FinanceiroLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireModule("financeiro");
  return children;
}
