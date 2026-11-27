"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCamera } from "@tabler/icons-react";
import { Button } from "@geas/ui/components/button";
import {
  Field as ChoiceField,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@geas/ui/components/field";
import { Input } from "@geas/ui/components/input";
import { MoneyInput } from "@geas/ui/components/money-input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { RadioGroup, RadioGroupItem } from "@geas/ui/components/radio-group";
import { Textarea } from "@geas/ui/components/textarea";
import { quickEntry } from "@/app/(gestao)/rapido/actions";
import { upload } from "@/components/finance/entries/entry-attachments";
import { ATTACHMENT_ACCEPT, attachmentProblem } from "@/lib/finance/attachments";
import { ATTACHMENTS_ENABLED } from "@/lib/features";
import { parseMoneyToCents } from "@/lib/money";
import { quickDoneHref } from "@/lib/quick";

// Lançamento pelo registro rápido (celular): só o essencial, receita ou despesa (sem rubrica: entra em "1 Receitas" ou
// "2 Despesas") e o comprovante (se ligado, `lib/features.ts`). A conta é a padrão da forma de pagamento (ou "A definir");
// rubrica, documento, rateio e conciliação quem revisa completa.

type Direction = "saida" | "entrada";
const BIG = "h-11 text-sm";
const Field = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

export function QuickEntryForm({
  paymentMethods,
  today,
}: {
  paymentMethods: { id: string; name: string; active: boolean }[];
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [direction, setDirection] = useState<Direction>("saida");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<string | null>(null);
  const methods = paymentMethods.filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }));

  function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])];
    const problem = picked.map(attachmentProblem).find(Boolean);
    if (problem) {
      toast.error(problem);
      event.target.value = "";
      return;
    }
    setFiles(picked);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const cents = Math.abs(parseMoneyToCents(String(data.get("total") ?? "")) ?? 0);
    if (!cents) {
      toast.error("Informe o valor.");
      return;
    }
    if (!paymentMethodId) {
      toast.error("Escolha a forma de pagamento.");
      return;
    }
    startTransition(async () => {
      setStep("Salvando…");
      const result = await quickEntry({
        date: data.get("date"),
        name: data.get("name"),
        paymentMethodId,
        totalCents: direction === "saida" ? -cents : cents,
        description: String(data.get("description") ?? "") || null,
        notes: String(data.get("notes") ?? "") || null,
      });
      if (result.error || !result.id) {
        setStep(null);
        toast.error(result.error ?? "Não foi possível salvar.");
        return;
      }
      for (const file of files) {
        setStep(`Enviando “${file.name}”…`);
        const error = await upload(result.id, file);
        if (error) toast.error(`${error} O lançamento foi salvo: anexe o comprovante depois, no lançamento.`);
      }
      router.push(quickDoneHref("lancamento", result.id));
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-1.5 text-xs font-medium">Tipo</legend>
        <p className="m-0 -mt-1 text-xs text-muted-foreground">A rubrica quem revisa escolhe depois.</p>
        <RadioGroup
          value={direction}
          onValueChange={(value) => setDirection(value as Direction)}
          className="grid gap-2 sm:grid-cols-2"
          aria-label="Tipo"
        >
          {(
            [
              ["saida", "Despesa", "Pagamento, compra, reembolso"],
              ["entrada", "Receita", "Recebimento, doação, venda"],
            ] as const
          ).map(([value, title, examples]) => (
            <FieldLabel key={value} htmlFor={`quick-direction-${value}`} className="has-data-checked:border-primary">
              <ChoiceField orientation="horizontal">
                <FieldContent>
                  <FieldTitle>{title}</FieldTitle>
                  <FieldDescription className="italic">Ex.: {examples}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={value} id={`quick-direction-${value}`} />
              </ChoiceField>
            </FieldLabel>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Field id="quick-total" label="Valor">
          <MoneyInput id="quick-total" name="total" required groupClassName="h-11" className="text-sm" />
        </Field>
        <Field id="quick-date" label="Data">
          <Input
            id="quick-date"
            name="date"
            type="date"
            defaultValue={today}
            max={today}
            required
            className={`${BIG} num`}
          />
        </Field>
      </div>
      <Field id="quick-name" label="Histórico">
        <Input
          id="quick-name"
          name="name"
          required
          minLength={2}
          maxLength={200}
          placeholder="Ex.: Mercado Bom Preço"
          autoComplete="off"
          className={BIG}
        />
      </Field>
      <Field id="quick-payment" label="Forma de pagamento">
        <OptionSelect
          id="quick-payment"
          value={paymentMethodId}
          onValueChange={setPaymentMethodId}
          options={methods}
          className={BIG}
        />
      </Field>
      <Field id="quick-description" label="Descrição (opcional)">
        <Input
          id="quick-description"
          name="description"
          maxLength={200}
          placeholder="Ex.: lanche do acampamento"
          autoComplete="off"
          className={BIG}
        />
      </Field>
      {ATTACHMENTS_ENABLED && (
        <div className="grid gap-1.5">
          <Label htmlFor="quick-receipt">Comprovante (opcional)</Label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-card px-3 text-sm focus-within:ring-2 focus-within:ring-ring/30 hover:bg-muted/50">
            <IconCamera className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate">
              {files.length ? files.map((f) => f.name).join(", ") : "Foto ou PDF da nota ou recibo…"}
            </span>
            <input
              id="quick-receipt"
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              onChange={onFiles}
              disabled={pending}
            />
          </label>
        </div>
      )}
      <Field id="quick-notes" label="Observações (opcional)">
        <Textarea id="quick-notes" name="notes" maxLength={2000} rows={2} />
      </Field>
      <Button type="submit" size="lg" className={BIG} disabled={pending}>
        {step ?? "Registrar"}
      </Button>
    </form>
  );
}
