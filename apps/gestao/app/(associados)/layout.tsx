import type { Metadata } from "next";
import { baseMetadata, RootHtml } from "@/components/shell/root-layout";
import "../globals.css";

export const metadata: Metadata = {
  ...baseMetadata,
  title: "GEAS Associados",
  description: "Cadastro de associados do grupo escoteiro",
};

export default function AssociatesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml module="associados">{children}</RootHtml>;
}
