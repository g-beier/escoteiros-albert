// Registro rápido (telas de celular, /rapido › Inventário): ações, rótulos e mensagens. Tudo fica para revisar.

export type QuickKind = "retirar" | "entrada" | "condicao" | "transferir" | "ajustar" | "novo";

/** Ações sobre um material existente, na ordem dos botões. */
export const QUICK_ACTIONS: {
  kind: Exclude<QuickKind, "novo">;
  label: string;
  description: string;
  lotOnly?: boolean;
}[] = [
  {
    kind: "retirar",
    label: "Retirar / consumir",
    description: "Saiu do estoque: consumo, perda, extravio ou descarte.",
  },
  { kind: "entrada", label: "Entrada", description: "Chegou mais deste material." },
  { kind: "condicao", label: "Mudar condição", description: "Estragou, foi para manutenção ou voltou bom." },
  { kind: "transferir", label: "Transferir", description: "Mudou de divisão." },
  { kind: "ajustar", label: "Ajustar contagem", description: "A contagem é diferente do registrado.", lotOnly: true },
];

/** Confirmação depois de gravar (`?feito=<kind>`). */
export const QUICK_DONE: Record<QuickKind, string> = {
  retirar: "Retirada registrada",
  entrada: "Entrada registrada",
  condicao: "Condição registrada",
  transferir: "Transferência registrada",
  ajustar: "Ajuste registrado",
  novo: "Material cadastrado",
};

export const isQuickKind = (value: string | undefined): value is QuickKind => !!value && value in QUICK_DONE;
