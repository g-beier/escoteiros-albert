import { AppBrand, type GeasApp } from "@geas/ui";

const MODULE_HOME: Record<GeasApp, string> = { gestao: "/", financeiro: "/financeiro", inventario: "/inventario", associados: "/associados" };

/** Marca com o seletor de módulo do Gestão: o logo leva ao Início geral; o rótulo, ao resumo do módulo. */
export function Brand({ module = "gestao", light = false }: { module?: GeasApp; light?: boolean }) {
  return <AppBrand current={module} currentHref={MODULE_HOME[module]} homeHref="/"
    financeiroHref={MODULE_HOME.financeiro} inventarioHref={MODULE_HOME.inventario}
    associadosHref={MODULE_HOME.associados} light={light} />;
}
