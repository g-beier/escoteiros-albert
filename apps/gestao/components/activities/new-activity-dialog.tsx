"use client";

import { Button } from "@geas/ui/components/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@geas/ui/components/dialog";
import { ActivityForm } from "@/components/activities/activity-form";

/** Modal de criação — mesmo fluxo do clique no dia do calendário. */
export function NewActivityDialog({
  date, open, onOpenChange,
}: {
  /** Data só quando veio do clique no calendário. */
  date: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[min(26rem,calc(100%-2rem))] gap-3 p-4">
      <DialogHeader className="gap-1 pr-8">
        <DialogTitle className="text-sm font-semibold tracking-tight">Nova atividade</DialogTitle>
      </DialogHeader>

      {open && (
        <ActivityForm
          key={date ?? "sem-data"}
          requireAll
          stacked
          activity={{
            id: "",
            kind: "normal",
            title: null,
            // Clique no dia: início e fim no mesmo dia. Nova atividade: só horários padrão.
            starts_on: date ?? "",
            ends_on: date ?? null,
            start_time: "13:30",
            end_time: "18:00",
            branches: [],
            venue_name: null,
          }}
          actions={({ pending, canSubmit }) => (
            <DialogFooter className="justify-center gap-2 pt-1 sm:justify-center">
              <Button type="button" size="sm" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={pending || !canSubmit} className="cursor-pointer">
                {pending ? "Criando…" : "Criar atividade"}
              </Button>
            </DialogFooter>
          )}
        />
      )}
    </DialogContent>
  </Dialog>;
}
