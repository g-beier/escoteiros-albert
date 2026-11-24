import fs from "node:fs/promises";
import path from "node:path";
import { memberOrError } from "@/lib/server/session";

/**
 * GET /importar/contrato: docs/importacao.md (contrato dos CSVs), para entregar a quem converte as planilhas.
 * O arquivo entra na imagem pelo `outputFileTracingIncludes` do next.config.ts.
 */
export async function GET() {
  const member = await memberOrError();
  if ("error" in member) return new Response(member.error, { status: 403 });
  const text = await fs.readFile(path.join(process.cwd(), "docs", "importacao.md"), "utf8");
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contrato-importacao.md"',
      "Cache-Control": "private, no-store",
    },
  });
}
