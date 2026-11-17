import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // vários layouts raiz (um por módulo): o 404 de URL sem rota vem de app/global-not-found.tsx
  experimental: { globalNotFound: true },
  // rotas de antes da consolidação (app financeiro sem prefixo): favoritos e links antigos continuam valendo
  async redirects() {
    return [{ source: "/:area(lancamentos|extrato|mensalidades|configuracoes|exportar)/:path*", destination: "/financeiro/:area/:path*", permanent: true }];
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ],
    }];
  },
};

export default nextConfig;
