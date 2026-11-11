import type { Encoding } from "./types";

/** Lowercase, accents removed, whitespace collapsed. Used for every case/accent-insensitive comparison. */
export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function latin1Fallback(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return text;
}

function decodeLatin1(bytes: Uint8Array) {
  try {
    // windows-1252 is a superset of latin1 for the printable range and is what Brazilian banks export.
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return latin1Fallback(bytes);
  }
}

/**
 * Decode a statement file. Without `encoding`, tries strict UTF-8 and falls back to latin1 (windows-1252).
 * Any BOM is removed. Strings pass through unchanged (minus the BOM).
 */
export function decodeBytes(
  input: Uint8Array | ArrayBuffer | string,
  encoding?: Encoding,
): { text: string; encoding: Encoding } {
  if (typeof input === "string") return { text: input.replace(/^\uFEFF/, ""), encoding: encoding ?? "utf-8" };
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let text: string;
  let used: Encoding;
  if (encoding === "latin1") {
    text = decodeLatin1(bytes);
    used = "latin1";
  } else if (encoding === "utf-8") {
    text = new TextDecoder("utf-8").decode(bytes);
    used = "utf-8";
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      used = "utf-8";
    } catch {
      text = decodeLatin1(bytes);
      used = "latin1";
    }
  }
  return { text: text.replace(/^\uFEFF/, ""), encoding: used };
}
