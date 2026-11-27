// Links úteis do Início: sites externos que a diretoria usa (os do rodapé do site, apps/institucional/src/navigation.js).
// Para mudar a lista, edite aqui.

export type UsefulLink = { label: string; description: string; href: string };

export const USEFUL_LINKS: UsefulLink[] = [
  {
    label: "Paxtu",
    description: "Registro, dados individuais e mensalidades na UEB",
    href: "https://paxtu.escoteiros.org.br/",
  },
  { label: "Site do grupo", description: "escoteirosalbert.com.br", href: "https://escoteirosalbert.com.br/" },
  {
    label: "Escoteiros do Brasil",
    description: "Documentos, normas e notícias nacionais",
    href: "https://www.escoteiros.org.br/",
  },
  { label: "EscoteirosRS", description: "Região do Rio Grande do Sul", href: "https://www.escoteirosrs.org.br/" },
  {
    label: "Campo Escola Virtual",
    description: "Cursos de formação a distância",
    href: "https://ead.escoteiros.org.br/",
  },
  {
    label: "Loja Escoteira",
    description: "Uniformes, distintivos e materiais",
    href: "https://loja.escoteiros.org.br/",
  },
];
