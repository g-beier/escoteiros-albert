# Grupo Escoteiro Albert Schweitzer

Site oficial do Grupo Escoteiro Albert Schweitzer, em Porto Alegre, Brasil.

Acesse em: [escoteirosalbert.com.br](https://escoteirosalbert.com.br)

## Desenvolvimento

```sh
npm install
npm run dev       # servidor local em localhost:4321
npm run build     # build de produção em ./dist/
npm run preview   # visualizar build localmente
```

## Tecnologias

- [Astro](https://astro.build) — framework de geração de site estático
- [Tailwind CSS](https://tailwindcss.com) — estilização
- [MDX](https://mdxjs.com) — posts do blog em Markdown

## Estrutura de Conteúdo

- **Blog:** adicione posts em `src/content/post/` como arquivos Markdown/MDX
- **Navegação:** edite `src/navigation.js`
- **Configurações do site:** edite `src/config.yaml` (SEO, analytics, blog)
- **Voluntários/Depoimentos:** edite os arquivos JSON em `src/content/`
