import { redirect } from "next/navigation";

/** A entrada do Inventário é a lista de Materiais (o painel com o que pede atenção fica no Início do Gestão). */
export default function InventoryHome() {
  redirect("/inventario/materiais");
}
