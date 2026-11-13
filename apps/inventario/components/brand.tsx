import { AppBrand } from "@geas/ui";

export function Brand({ light = false }: { light?: boolean }) {
  const financeUrl = process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "http://localhost:3000";
  return <AppBrand current="inventario" financeiroHref={financeUrl} inventarioHref="/" light={light} />;
}
