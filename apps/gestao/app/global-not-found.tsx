import { Link } from "@geas/ui/components/link";
import type { Metadata } from "next";
import { RootHtml } from "@/components/shell/root-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "Página não encontrada · GEAS Gestão",
  robots: { index: false, follow: false },
};

/** 404 de URL sem rota: com vários layouts raiz (um por módulo) não há um layout comum para o not-found. */
export default function GlobalNotFound() {
  return (
    <RootHtml module="gestao">
      <main className="geas-page geas-page--narrow">
        <div className="geas-page-header">
          <div className="geas-page-header__row">
            <h1>Página não encontrada</h1>
          </div>
          <p>
            O endereço não existe ou mudou. <Link href="/">Voltar ao Início</Link>.
          </p>
        </div>
      </main>
    </RootHtml>
  );
}
