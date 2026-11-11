import Link from "next/link";

export function Brand({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return <Link className={`brand ${light ? "brand-light" : ""}`} href={href} aria-label="Grupo Escoteiro Albert Schweitzer — Financeiro">
    {/* The original artwork is served directly so its SVG masks and cutouts stay untouched. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="brand-logo" src={light ? "/images/logo-dark.svg" : "/images/logo.svg"} alt="" width="210" height="60" />
    <span className="brand-product">Financeiro</span>
  </Link>;
}
