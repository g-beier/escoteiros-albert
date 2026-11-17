import { AppBrand, type GeasApp } from "@geas/ui";

/** Marca com o seletor de módulo do Gestão. O logo leva ao início do módulo (o do Financeiro é o Início geral). */
export function Brand({ module = "financeiro", light = false }: { module?: GeasApp; light?: boolean }) {
  return <AppBrand current={module} currentHref={module === "inventario" ? "/inventario" : "/"}
    financeiroHref="/financeiro" inventarioHref="/inventario" light={light} />;
}
