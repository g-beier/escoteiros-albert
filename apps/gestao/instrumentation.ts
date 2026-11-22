/** Roda uma vez, antes da primeira requisição, no servidor do Next. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { coalesceResponseFlush } = await import("./lib/server/response-compression");
    coalesceResponseFlush();
  }
}
