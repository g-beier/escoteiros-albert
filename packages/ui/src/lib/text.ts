// Texto para exibição: nomes cadastrados em maiúsculas (como nas planilhas do grupo) aparecem capitalizados, com as
// partículas dos nomes em português em minúsculas ("JOSÉ DA SILVA" → "José da Silva").

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

/** Tudo em maiúsculas, com pelo menos duas palavras (nomes; siglas soltas como "PDF" ficam como estão). */
export function isShouting(text: string) {
  return /\s/.test(text.trim()) && /\p{Lu}/u.test(text) && text === text.toLocaleUpperCase("pt-BR") && text !== text.toLocaleLowerCase("pt-BR");
}

/** "JOSÉ AUGUSTO DA SILVA" → "José Augusto da Silva"; hífens também ("ANA-CLARA" → "Ana-Clara"). */
export function titleCasePt(text: string) {
  return text.toLocaleLowerCase("pt-BR").split(/(\s+)/).map((word, index) => {
    if (/^\s+$/.test(word) || (index > 0 && PARTICLES.has(word))) return word;
    return word.split("-").map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1)).join("-");
  }).join("");
}

/** Capitaliza só o que está todo em maiúsculas; o resto fica como veio. */
export const displayCase = (text: string) => (isShouting(text) ? titleCasePt(text) : text);
