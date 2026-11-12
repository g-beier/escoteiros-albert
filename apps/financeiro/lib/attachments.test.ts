import { describe, expect, it } from "vitest";
import { ATTACHMENT_MAX_BYTES, attachmentPath, attachmentProblem, attachmentType, cleanFileName, fileSize } from "./attachments";

describe("attachmentType", () => {
  it("aceita os tipos do bucket pelo MIME", () => {
    expect(attachmentType("nota.pdf", "application/pdf")).toBe("application/pdf");
    expect(attachmentType("foto.JPG", "image/jpeg")).toBe("image/jpeg");
    expect(attachmentType("print.png", "IMAGE/PNG")).toBe("image/png");
  });
  it("usa a extensão quando o navegador não informa o tipo (HEIC)", () => {
    expect(attachmentType("IMG_0001.HEIC", "")).toBe("image/heic");
    expect(attachmentType("recibo.jpeg", "application/octet-stream")).toBe("image/jpeg");
  });
  it("recusa outros tipos, mesmo com extensão aceita", () => {
    expect(attachmentType("planilha.xlsx", "")).toBeNull();
    expect(attachmentType("falso.pdf", "text/html")).toBeNull();
    expect(attachmentType("sem-extensao", "")).toBeNull();
  });
});

describe("attachmentProblem", () => {
  it("aceita arquivo válido até 10 MB", () => {
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: ATTACHMENT_MAX_BYTES })).toBeNull();
  });
  it("explica tipo, vazio e tamanho", () => {
    expect(attachmentProblem({ name: "a.doc", type: "application/msword", size: 10 })).toMatch(/não é PDF/);
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: 0 })).toMatch(/vazio/);
    expect(attachmentProblem({ name: "a.pdf", type: "application/pdf", size: ATTACHMENT_MAX_BYTES + 1 })).toMatch(/limite é 10 MB/);
  });
});

describe("attachmentPath", () => {
  it("prefixa grupo e lançamento e usa a extensão do tipo", () => {
    expect(attachmentPath("g", "e", "f", "image/heic")).toBe("g/e/f.heic");
    expect(attachmentPath("g", "e", "f", "image/jpeg")).toBe("g/e/f.jpg");
  });
});

describe("cleanFileName", () => {
  it("tira diretórios, controles e espaços", () => {
    expect(cleanFileName("C:\\fotos\\ nota\u0007.pdf ")).toBe("nota.pdf");
    expect(cleanFileName("../")).toBe("comprovante");
    expect(cleanFileName("x".repeat(300))).toHaveLength(200);
  });
});

describe("fileSize", () => {
  it("formata em pt-BR", () => {
    expect(fileSize(512)).toBe("512 B");
    expect(fileSize(1536)).toBe("1,5 KB");
    expect(fileSize(ATTACHMENT_MAX_BYTES)).toBe("10 MB");
  });
});
