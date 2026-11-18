import type { Metadata } from "next";
import { baseMetadata, RootHtml } from "@/components/shell/root-layout";
import "../globals.css";

export const metadata: Metadata = {
  ...baseMetadata,
  title: "GEAS Atividades",
  description: "Calendário, locais e programação de atividades do grupo escoteiro",
};

export default function ActivitiesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml module="atividades">{children}</RootHtml>;
}
