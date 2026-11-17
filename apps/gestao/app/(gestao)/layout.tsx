import { baseMetadata, RootHtml } from "@/components/shell/root-layout";
import "../globals.css";

export const metadata = baseMetadata;

/** Início, login, usuários: o que é comum aos módulos. */
export default function GestaoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml module="gestao">{children}</RootHtml>;
}
