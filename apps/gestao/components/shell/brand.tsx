import { AppBrand, type GeasApp } from "@geas/ui";
import { getSession, moduleAccess } from "@/lib/server/session";

const MODULE_HOME: Record<GeasApp, string> = { gestao: "/", financeiro: "/financeiro", inventario: "/inventario", associados: "/associados" };

/**
 * Marca com o seletor de módulo do Gestão: o logo leva ao Início geral; o rótulo, ao resumo do módulo. Só lista os
 * módulos que a pessoa vê (papel "Sem acesso" tira o módulo).
 */
export async function Brand({ module = "gestao", light = false }: { module?: GeasApp; light?: boolean }) {
  const access = moduleAccess((await getSession()).member);
  return <AppBrand current={module} currentHref={MODULE_HOME[module]} homeHref="/"
    financeiroHref={access.financeiro ? MODULE_HOME.financeiro : undefined} inventarioHref={access.inventario ? MODULE_HOME.inventario : undefined}
    associadosHref={access.associados ? MODULE_HOME.associados : undefined} light={light} />;
}
