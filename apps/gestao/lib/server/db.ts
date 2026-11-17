// Camada de dados do Gestão (docs/consolidacao-gestao.md, seção 4): só lib/server/** fala com o banco.
// Quem chama recebe um `Db` opaco (o da sessão, sob RLS, ou o de serviço) e usa as funções por caso de uso de
// lib/server/<módulo>/*.ts; nunca monta consulta. Trocar o Supabase é reimplementar lib/server/supabase.

declare const brand: unique symbol;

/** Acesso ao banco como o usuário da sessão (RLS) ou como serviço. Opaco fora de lib/server. */
export type Db = { readonly [brand]: "Db" };

/** Erro do banco ou da plataforma, com a mensagem para o usuário (as funções SQL já falam português). */
export class DataError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "DataError";
  }
}
