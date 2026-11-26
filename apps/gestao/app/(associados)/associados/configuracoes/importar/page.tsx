import { redirect } from "next/navigation";

/** A importação passou a ser comum aos módulos: /importar (docs/importacao.md). */
export default function ImportPage() {
  redirect("/importar");
}
