import path from "node:path";
import type { NextConfig } from "next";

// Cache de 1 ano: logo e ícones são importados (packages/ui/src/assets, assets/images) e saem em /_next/static com o
// hash no nome, `immutable`. Sobra /favicon.ico, que o navegador pede sozinho num caminho fixo: 1 ano, sem `immutable`
// (trocar o ícone = trocar os dois arquivos). Nada de dados do grupo passa por cache.
const FAVICON_CACHE = [{ key: "Cache-Control", value: "public, max-age=31536000" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // imagem de produção (Dockerfile): servidor Node mínimo em .next/standalone. A raiz do monorepo entra no rastreio
  // porque @geas/ui e o node_modules ficam lá; o servidor sai em .next/standalone/apps/gestao/server.js.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // contrato da importação por CSV, servido em /importar/contrato
  outputFileTracingIncludes: { "/importar/contrato": ["./docs/importacao.md"] },
  // vários layouts raiz (um por módulo): o 404 de URL sem rota vem de app/global-not-found.tsx
  // importação por CSV (/importar): os arquivos vão inteiros para a Server Action, que lê e grava no servidor
  experimental: { globalNotFound: true, serverActions: { bodySizeLimit: "4mb" } },
  // rotas de antes da consolidação (app financeiro sem prefixo): favoritos e links antigos continuam valendo
  async redirects() {
    return [
      // o cadastro de associados e seções passou para o módulo Associados (antes do redirect genérico abaixo)
      { source: "/financeiro/configuracoes/associados", destination: "/associados", permanent: true },
      { source: "/configuracoes/associados", destination: "/associados", permanent: true },
      // o registro rápido do inventário passou a ser comum aos módulos (/rapido)
      { source: "/inventario/rapido", destination: "/rapido", permanent: true },
      { source: "/inventario/rapido/:path*", destination: "/rapido/inventario/:path*", permanent: true },
      {
        source: "/:area(lancamentos|extrato|mensalidades|configuracoes|exportar)/:path*",
        destination: "/financeiro/:area/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
      { source: "/favicon.ico", headers: FAVICON_CACHE },
    ];
  },
};

export default nextConfig;
