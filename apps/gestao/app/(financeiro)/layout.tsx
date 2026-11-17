import type { Metadata } from "next";
import { baseMetadata, RootHtml } from "@/components/shell/root-layout";
import "../globals.css";

export const metadata: Metadata = { ...baseMetadata, title: "GEAS Financeiro", description: "Gestão financeira do grupo escoteiro" };

export default function FinanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml module="financeiro">{children}</RootHtml>;
}
