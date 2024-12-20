import { getPermalink, getBlogPermalink, getAsset } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Sobre Nós',
      links: [
        {
          text: 'Escotismo',
          href: getPermalink('/escotismo'),
        },
        {
          text: 'Adultos',
          href: getPermalink('/adultos'),
        },
        {
          text: 'História',
          href: getPermalink('historia-geas', 'post'),
        },
        { text: 'Clube da Flor-de-Lis', href: getPermalink('/clube-flor-de-lis') },
      ],
    },
    {
      text: 'Blog',
      href: getBlogPermalink(),
    },
  ],
  // socialLinks: [
  //   { label: 'WhatsApp', icon: 'tabler:brand-whatsapp', href: 'https://wa.me/555195794880' },
  //   { label: 'Facebook', icon: 'tabler:brand-facebook', href: 'https://www.facebook.com/Geas38rs' },
  //   { label: 'Instagram', icon: 'tabler:brand-instagram', href: 'https://www.instagram.com/escoteirosalbert/' },
  // ],
  // actions: [{ text: 'Download', href: 'https://github.com/onwidget/astrowind', target: '_blank' }],
};

export const footerData = {
  links: [
    {
      title: 'Redes Sociais',
      links: [
        { text: 'WhatsApp', href: 'https://wa.me/555195794880' },
        { text: 'Facebook do GEAS', href: 'https://www.facebook.com/Geas38rs' },
        { text: 'Instagram do GEAS', href: 'https://www.instagram.com/escoteirosalbert/' },
      ],
    },
    {
      title: 'Links úteis',
      links: [
        { text: 'Escoteiros do Brasil', href: 'https://www.escoteiros.org.br/' },
        { text: 'Loja Escoteira', href: 'https://loja.escoteiros.org.br/' },
        { text: 'EscoteirosRS', href: 'https://www.escoteirosrs.org.br/' },
        { text: 'Campo Escola Virtual', href: 'https://ead.escoteiros.org.br/' },
        { text: 'Paxtu', href: 'https://paxtu.escoteiros.org.br/' },
      ],
    },
    {
      title: 'Comunidade Martin Luther',
      links: [
        { text: 'Site da CML', href: 'http://www.mluther.org.br/' },
        { text: 'Facebook da CML', href: 'https://www.facebook.com/mluther.org.br' },
        { text: 'Instagram da CML', href: 'https://www.instagram.com/mluther.org.br/' },
      ],
    },
  ],
  secondaryLinks: [
    { text: 'Regulamento', href: getAsset('documents/geas05-regulamento.pdf') },
    { text: 'Calendário', href: getAsset('documents/geas03-calendario.pdf') },
  ],
  socialLinks: [
    { ariaLabel: 'WhatsApp', icon: 'tabler:brand-whatsapp', href: 'https://wa.me/555195794880' },
    { ariaLabel: 'Facebook', icon: 'tabler:brand-facebook', href: 'https://www.facebook.com/Geas38rs' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: 'https://www.instagram.com/escoteirosalbert/' },
  ],
  footNote: `
    Produzido por <a class="text-blue-600 underline dark:text-muted" href="https://onwidget.com/"> onWidget</a> · Todos direitos reservados.
  `,
};
