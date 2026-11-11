import { isBlogEnabled, isBlogPostRouteEnabled } from './utils/blog';
import { isStoreEnabled, isStoreListRouteEnabled } from './utils/store';
import { getPermalink, getBlogPermalink, getStorePermalink, getAsset, getPostPermalink } from './utils/permalinks';

export const WHATSAPP_URL = 'https://wa.me/555195794880';
export const FACEBOOK_URL = 'https://www.facebook.com/Geas38rs';
export const INSTAGRAM_URL = 'https://www.instagram.com/escoteirosalbert/';

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
          text: 'Transparência',
          href: getPermalink('/transparencia'),
        },
        ...(isBlogEnabled && isBlogPostRouteEnabled
          ? [
              {
                text: 'História',
                href: getPostPermalink('historia-geas'),
              },
            ]
          : []),
      ],
    },
    ...(isBlogEnabled
      ? [
          {
            text: 'Blog',
            href: getBlogPermalink(),
          },
        ]
      : []),
    ...(isStoreEnabled && isStoreListRouteEnabled ? [{ text: 'Lojinha', href: getStorePermalink() }] : []),
  ],
  socialLinks: [
    { label: 'WhatsApp', icon: 'tabler:brand-whatsapp', href: WHATSAPP_URL },
    { label: 'Facebook', icon: 'tabler:brand-facebook', href: FACEBOOK_URL },
    { label: 'Instagram', icon: 'tabler:brand-instagram', href: INSTAGRAM_URL },
  ],
  // actions: [{ text: 'Download', href: 'https://github.com/onwidget/astrowind', target: '_blank' }],
};

export const footerData = {
  links: [
    {
      title: 'Redes Sociais',
      links: [
        { text: 'WhatsApp', href: WHATSAPP_URL },
        { text: 'Facebook do GEAS', href: FACEBOOK_URL },
        { text: 'Instagram do GEAS', href: INSTAGRAM_URL },
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
    { text: 'Calendário', href: getAsset('documents/geas03-calendario.pdf') },
    { text: 'Estatuto', href: getAsset('documents/geas-estatuto.pdf') },
    { text: 'Regulamento', href: getAsset('documents/geas05-regulamento.pdf') },
  ],
  socialLinks: [
    { ariaLabel: 'WhatsApp', icon: 'tabler:brand-whatsapp', href: WHATSAPP_URL },
    { ariaLabel: 'Facebook', icon: 'tabler:brand-facebook', href: FACEBOOK_URL },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: INSTAGRAM_URL },
  ],
  footNote: `Última atualização: ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' })}`,
};
