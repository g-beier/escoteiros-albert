import { expect } from "@playwright/test";
import { MAILPIT_URL } from "./env";

type MailSummary = { ID: string; Created: string; Subject: string };

async function search(email: string): Promise<MailSummary[]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=20`);
  if (!response.ok) throw new Error(`Mailpit respondeu ${response.status}`);
  return ((await response.json()) as { messages: MailSummary[] }).messages;
}

/** Espera chegar no Mailpit um e-mail para `email` criado depois de `since` e devolve o texto dele. */
export async function waitForMail(email: string, since: Date, subject?: RegExp): Promise<{ subject: string; text: string }> {
  let found: MailSummary | undefined;
  await expect.poll(async () => {
    const messages = await search(email);
    // o Created do Mailpit tem resolução de segundos: tolera 2 s de diferença de relógio
    found = messages.find((m) => new Date(m.Created).getTime() >= since.getTime() - 2000 && (!subject || subject.test(m.Subject)));
    return Boolean(found);
  }, { message: `e-mail para ${email} no Mailpit (${MAILPIT_URL})`, timeout: 20_000 }).toBe(true);
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`);
  const message = (await response.json()) as { Subject: string; Text: string; HTML: string };
  return { subject: message.Subject, text: message.Text || message.HTML.replace(/<[^>]+>/g, " ") };
}

/** Código de acesso (OTP) do último e-mail de login enviado para `email` depois de `since`. */
export async function waitForOtp(email: string, since: Date): Promise<string> {
  const { text } = await waitForMail(email, since, /código de acesso/i);
  const code = text.match(/\b(\d{6,8})\b/)?.[1];
  if (!code) throw new Error(`Código não encontrado no e-mail: ${text.slice(0, 200)}`);
  return code;
}
