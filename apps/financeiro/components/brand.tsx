import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return <Link className={cn("inline-flex items-center gap-3 no-underline max-[760px]:shrink-0", light && "w-fit text-white")} href={href} aria-label="Grupo Escoteiro Albert Schweitzer — Financeiro">
    {/* The original artwork is served directly so its SVG masks and cutouts stay untouched. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="block h-11 w-40 object-contain max-[760px]:h-auto max-[760px]:w-[140px]" src={light ? "/images/logo-dark.svg" : "/images/logo.svg"} alt="" width="210" height="60" />
    <span className={cn("border-l py-1 pl-3 text-[10px] font-bold tracking-[.15em] uppercase max-[760px]:hidden", light ? "border-[#66626a] text-(--green)" : "border-border text-primary")}>Financeiro</span>
  </Link>;
}
