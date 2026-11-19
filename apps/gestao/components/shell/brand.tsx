import { AppBrand, type GeasApp } from "@geas/ui";

const MODULE_HOME: Record<GeasApp, string> = {
  gestao: "/", financeiro: "/financeiro", inventario: "/inventario", atividades: "/atividades",
};

/** Marca com o seletor de módulo: logo → Início geral; módulos sempre visíveis. */
export function Brand({ module = "gestao", light = false }: { module?: GeasApp; light?: boolean }) {
  return <AppBrand current={module} homeHref="/"
    financeiroHref={MODULE_HOME.financeiro} inventarioHref={MODULE_HOME.inventario}
    atividadesHref={MODULE_HOME.atividades} light={light} />;
}
