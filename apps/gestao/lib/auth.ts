// Papéis vêm de @geas/ui/lib/roles (comuns à tela de Usuários); o que cada papel permite, em lib/server/session.ts.
export { isValidEmail } from "@geas/ui/lib/roles";

/** Dias sem uso até a sessão vencer (banco em lib/server/auth.ts, cookie em proxy.ts). */
export const SESSION_DAYS = 30;
