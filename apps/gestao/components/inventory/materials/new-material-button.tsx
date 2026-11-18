"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconPlus } from "@tabler/icons-react";
import { buttonVariants } from "@geas/ui/components/button";
import { SectionCount } from "@geas/ui/components/section-card";
import type { Option } from "@geas/ui/components/option-controls";
import { cn } from "@geas/ui/lib/utils";
import { MaterialForm } from "@/components/inventory/materials/material-form";
import { ReviewNotice } from "@/components/inventory/materials/review-notice";

/** Seção Materiais: o painel de cadastro cobre a altura e a borda direita do card da lista. */
export function MaterialsSection({
  title,
  description,
  countLabel,
  families,
  locations,
  showReviewNotice,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  countLabel: ReactNode;
  families: Option[];
  locations: Option[];
  showReviewNotice?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (shellRef.current?.contains(el)) return;
      if (el.closest("[data-new-material-trigger]")) return;
      // Select/Combobox (Base UI) renderizam o popup em portal fora do painel.
      if (el.closest("[data-slot=select-content], [data-slot=combobox-content], [data-base-ui-portal]")) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return <section className="grid gap-2">
    <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-1">
      <div className="min-w-0">
        <h2 className="m-0 text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="m-0 text-xs text-balance text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SectionCount>{countLabel}</SectionCount>
        <button
          type="button"
          data-new-material-trigger
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            buttonVariants({ size: "sm", variant: "ghost" }),
            "rounded-md border-transparent bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            open && "bg-[#8b73e3] text-white hover:bg-[#8b73e3] hover:text-white",
          )}>
          <IconPlus data-icon="inline-start" /> Novo material
        </button>
      </div>
    </header>

    <div ref={shellRef} className="relative">
      {children}
      {open && <aside
        className="absolute inset-y-0 right-0 z-20 flex w-[min(28rem,100%)] flex-col overflow-hidden rounded-2xl bg-card shadow-[0_8px_24px_rgba(37,35,40,0.14)]"
        aria-label="Novo material">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="grid gap-1">
            <h3 className="m-0 text-sm font-medium text-foreground">Novo material</h3>
            <p className="m-0 text-xs text-muted-foreground">Cadastre um novo material.</p>
          </div>
          {showReviewNotice && <ReviewNotice />}
          <MaterialForm families={families} locations={locations} />
        </div>
      </aside>}
    </div>
  </section>;
}
