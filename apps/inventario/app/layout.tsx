import type { Metadata } from "next";
import "@geas/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = { title: "GEAS Inventário", description: "Gestão de patrimônio e materiais do grupo escoteiro", robots: { index: false, follow: false } };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
