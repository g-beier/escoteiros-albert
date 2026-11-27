"use client";

import * as React from "react";
import { IconPlusMinus } from "@tabler/icons-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@geas/ui/components/input-group";
import { formatInputCents, parseMoneyToCents, popDigit, pushDigits } from "@geas/ui/lib/money";
import { cn } from "@geas/ui/lib/utils";

type MoneyInputProps = Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type"> & {
  /** Controlado: o texto do valor ("1.234,56"; "" = vazio). Qualquer formato que `parseMoneyToCents` leia serve. */
  value?: string;
  /** Não controlado (formulário com `name`): valor inicial; `form.reset()` volta para ele. */
  defaultValue?: string;
  /** Texto já formatado ("1.234,56", "" vazio) e os centavos (null = vazio). */
  onValueChange?: (text: string, cents: number | null) => void;
  /** Aceita valor negativo: tecla "-" ou o botão ± (o teclado numérico do celular não tem "-"). */
  allowNegative?: boolean;
  /** Classe do contorno (largura do campo). */
  groupClassName?: string;
};

/**
 * Campo de dinheiro: "R$" fixo, sempre com centavos, e dígitos que entram pela direita, como numa caixa registradora
 * (3 → 0,03 · 35 → 0,35 · 3500 → 35,00). Backspace tira o último dígito; colar (ou preencher de uma vez) lê o texto
 * como valor ("35" = R$ 35,00, "1.234,56"). O texto enviado no formulário é o formatado, que `parseMoneyToCents` lê.
 * A digitação vem do `beforeinput` nativo (o único evento confiável nos teclados de celular), cancelado sempre: o campo
 * só mostra o que o estado diz.
 */
function MoneyInput({
  value,
  defaultValue,
  onValueChange,
  allowNegative = false,
  className,
  groupClassName,
  placeholder = "0,00",
  readOnly,
  disabled,
  ref,
  ...props
}: MoneyInputProps) {
  const controlled = value !== undefined;
  const [own, setOwn] = React.useState(() => parseMoneyToCents(defaultValue ?? "", { allowNegative }));
  const [pendingMinus, setPendingMinus] = React.useState(false);
  const external = React.useMemo(
    () => (controlled ? parseMoneyToCents(value, { allowNegative }) : null),
    [controlled, value, allowNegative],
  );
  const cents = controlled ? external : own;
  const text = cents == null ? (pendingMinus ? "-" : "") : formatInputCents(cents);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const latest = React.useRef({ cents, pendingMinus, allowNegative, controlled, onValueChange, defaultValue });
  // os ouvintes nativos leem o estado mais recente sem se reinscrever a cada tecla
  React.useLayoutEffect(() => {
    latest.current = { cents, pendingMinus, allowNegative, controlled, onValueChange, defaultValue };
  });

  const commit = React.useCallback((next: number | null) => {
    const state = latest.current;
    if (next !== null && !state.allowNegative) next = Math.abs(next);
    if (next === 0) next = null;
    setPendingMinus(false);
    if (!state.controlled) setOwn(next);
    if (next !== state.cents) state.onValueChange?.(formatInputCents(next), next);
  }, []);

  const toggleSign = React.useCallback(() => {
    const { cents: current } = latest.current;
    if (current == null) setPendingMinus((minus) => !minus);
    else commit(-current);
  }, [commit]);

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onBeforeInput = (event: InputEvent) => {
      event.preventDefault();
      const { cents: current, pendingMinus: minus, allowNegative: negative } = latest.current;
      const everything =
        input.value.length > 0 && input.selectionStart === 0 && input.selectionEnd === input.value.length;
      const type = event.inputType;
      if (type.startsWith("delete")) {
        commit(type === "deleteContentBackward" && !everything ? popDigit(current) : null);
        return;
      }
      const data = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
      if (!data) return;
      if (data === "-" || data === "+") {
        if (negative && (data === "-" || (current ?? 0) < 0)) toggleSign();
        return;
      }
      // vários caracteres de uma vez (colar, autocompletar, preenchimento automático): é um valor, não dígitos
      if (data.length > 1 || type !== "insertText") {
        const parsed = parseMoneyToCents(data.trim(), { allowNegative: negative });
        if (parsed !== null) commit(parsed);
        else if (/^\d+$/.test(data)) commit(pushDigits(everything ? null : current, data));
        return;
      }
      if (!/\d/.test(data)) return;
      const next = pushDigits(everything ? null : current, data);
      commit(minus && next > 0 ? -next : next);
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      const parsed = parseMoneyToCents((event.clipboardData?.getData("text/plain") ?? "").trim(), {
        allowNegative: latest.current.allowNegative,
      });
      if (parsed !== null) commit(parsed);
    };
    // não controlado: limpar o formulário volta ao valor inicial
    const form = input.form;
    const onReset = () => {
      if (!latest.current.controlled) {
        setPendingMinus(false);
        setOwn(parseMoneyToCents(latest.current.defaultValue ?? "", { allowNegative: latest.current.allowNegative }));
      }
    };
    input.addEventListener("beforeinput", onBeforeInput);
    input.addEventListener("paste", onPaste);
    form?.addEventListener("reset", onReset);
    return () => {
      input.removeEventListener("beforeinput", onBeforeInput);
      input.removeEventListener("paste", onPaste);
      form?.removeEventListener("reset", onReset);
    };
  }, [commit, toggleSign]);

  // o cursor fica sempre no fim: é lá que os dígitos entram
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) input.setSelectionRange(input.value.length, input.value.length);
  }, [text]);

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <InputGroup className={groupClassName} data-disabled={disabled || undefined}>
      <InputGroupAddon align="inline-start" aria-hidden>
        R$
      </InputGroupAddon>
      <InputGroupInput
        {...props}
        ref={setRefs}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        readOnly={readOnly}
        disabled={disabled}
        // fallback para navegador sem `beforeinput` cancelável: lê o que ficou no campo
        onChange={(event) => commit(parseMoneyToCents(event.target.value, { allowNegative }))}
        onClick={(event) => {
          const input = event.currentTarget;
          if (input.selectionStart === input.selectionEnd)
            input.setSelectionRange(input.value.length, input.value.length);
        }}
        className={cn("text-right num", className)}
      />
      {allowNegative && !readOnly && !disabled && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Inverter sinal" title="Inverter sinal" onClick={toggleSign}>
            <IconPlusMinus />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

export { MoneyInput };
export type { MoneyInputProps };
