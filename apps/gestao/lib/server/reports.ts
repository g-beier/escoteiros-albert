import type { ReactElement } from "react";
import { NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

// Geração dos relatórios em PDF (react-pdf, no servidor) e a resposta HTTP. O layout comum fica em components/reports/.

export async function renderReport(document: ReactElement<DocumentProps>): Promise<Buffer> {
  return renderToBuffer(document);
}

/** PDF para abrir no navegador (`inline`) ou baixar (`attachment`). */
export function pdfResponse(pdf: Buffer, filename: string, download = false) {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
