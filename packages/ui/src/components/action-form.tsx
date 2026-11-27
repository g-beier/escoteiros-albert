"use client";

import { startTransition, useEffect, useRef, type ComponentProps, type FormEvent } from "react";

type Props = Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  /** Ação de `useActionState` (ou qualquer função que receba o FormData). */
  action: (formData: FormData) => void;
  /**
   * Resultado da ação (o estado de `useActionState`). Quando muda e não traz `error`, o formulário é limpo, como o
   * `<form action>` faz; com erro, os campos ficam como estavam. Sem `result`, nunca limpa.
   */
  result?: { error?: string } | null;
};

/**
 * Formulário de Server Action que não perde o que foi digitado quando a ação devolve erro. O `<form action>` do
 * React 19 limpa os campos não controlados ao fim de toda ação, mesmo com erro; aqui o envio passa por `onSubmit`
 * (sem o reset automático, com o mesmo `pending` de `useActionState`) e só limpa depois de um resultado sem erro.
 * O botão que enviou vai junto no FormData (`name`/`value`).
 */
export function ActionForm({ action, result, ...props }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const previous = useRef(result);
  useEffect(() => {
    if (result === previous.current) return;
    previous.current = result;
    if (result && !result.error) ref.current?.reset();
  }, [result]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(
      event.currentTarget,
      submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : null,
    );
    startTransition(() => action(data));
  };
  return <form ref={ref} {...props} onSubmit={submit} />;
}
