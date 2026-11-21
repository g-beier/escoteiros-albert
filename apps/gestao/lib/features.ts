// Funções que podem ser ligadas e desligadas por ambiente, sem mexer no código. `NEXT_PUBLIC_*` é lido na
// compilação: vale igual no servidor e no navegador (mudou o valor, reinicie o `next dev` ou refaça o build).

/**
 * Comprovantes anexados aos lançamentos (027): envio, abertura, lista e o clipe nas listas. Desligados por
 * enquanto: nenhum arquivo é enviado nem aberto. Ligar com `NEXT_PUBLIC_FEATURE_ATTACHMENTS=on`.
 */
export const ATTACHMENTS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ATTACHMENTS === "on";

export const ATTACHMENTS_DISABLED_MESSAGE = "Os comprovantes estão desativados por enquanto.";

/**
 * Ramo Filhote (5 a 7 anos, 051): o grupo ainda não tem. Ligado, o ramo aparece nas listas, seções, cadastro e
 * importação, e a transição Filhote → Lobinho entra nos alertas (Lobinho passa a começar aos 7, não aos 6½).
 * Ligar com `NEXT_PUBLIC_FEATURE_FILHOTES=on`.
 */
export const FILHOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILHOTES === "on";
