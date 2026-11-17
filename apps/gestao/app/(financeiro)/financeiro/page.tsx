import { redirect } from "next/navigation";

/** Raiz do módulo: vai para a primeira área (como as raízes das áreas vão para a primeira aba). */
export default function FinanceHome() {
  redirect("/financeiro/lancamentos/movimentacoes");
}
