import { ServerResponse } from "node:http";

// O Next chama `res.flush()` depois de cada pedaço da resposta (server/pipe-readable.js). Com o gzip do próprio Next
// isso fecha um bloco a cada linha do payload RSC e a compressão quase some: Materiais por clique saía com 673 kB em
// vez de ~90. Aqui os flushes de uma mesma resposta são juntados numa janela curta; streaming continua funcionando,
// com no máximo FLUSH_WINDOW_MS de atraso por pedaço, e o fim da resposta não espera a janela.
// Depende de o middleware de compressão atribuir `res.flush`: conferir o tamanho das navegações ao atualizar o Next.

const FLUSH_WINDOW_MS = 50;
const coalesced = Symbol("coalesced flush");

type Response = ServerResponse & { [coalesced]?: () => void };

export function coalesceResponseFlush() {
  if (Object.hasOwn(ServerResponse.prototype, "flush")) return;
  Object.defineProperty(ServerResponse.prototype, "flush", {
    configurable: true,
    get(this: Response) {
      return this[coalesced];
    },
    set(this: Response, flush: () => void) {
      let timer: NodeJS.Timeout | undefined;
      this[coalesced] = () => {
        timer ??= setTimeout(() => {
          timer = undefined;
          if (!this.writableEnded && !this.destroyed) flush.call(this);
        }, FLUSH_WINDOW_MS);
      };
    },
  });
}
