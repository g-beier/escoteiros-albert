import { AppBrand } from "@geas/ui";

export function Brand({ href = "/", light = false }: { href?: string; light?: boolean }) {
  const inventoryUrl = process.env.NEXT_PUBLIC_INVENTARIO_URL ?? "http://localhost:3002";
  return <AppBrand current="financeiro" currentHref={href} financeiroHref={href} inventarioHref={inventoryUrl} light={light} />;
}
