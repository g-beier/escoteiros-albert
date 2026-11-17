import type { Metadata } from "next";
import { baseMetadata, RootHtml } from "@/components/shell/root-layout";
import "../globals.css";

export const metadata: Metadata = { ...baseMetadata, title: "GEAS Inventário", description: "Gestão de patrimônio e materiais do grupo escoteiro" };

export default function InventoryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootHtml module="inventario">{children}</RootHtml>;
}
