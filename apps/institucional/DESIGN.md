# Design System — Grupo Escoteiro Albert Schweitzer

Stack: Astro 6 + Tailwind CSS v4 (CSS-first config via `@theme`).

---

## Paleta de Cores

Definida em `src/assets/styles/global.css` via `@theme`.

### Escalas cromáticas

| Token | Matiz | Uso |
|---|---|---|
| `gray` | 39–248 | Neutros quentes (fundo, texto, bordas) |
| `green` | hsl(150, …) | Cor de suporte; accent |
| `orange` | hsl(15, …) | Links, destaques quentes |
| `purple` | hsl(252, …) | Cor primária |
| `yellow` | hsl(36, …) | Hover states, seleção |

Cada escala vai de `50` (mais claro) a `950` (mais escuro). Dois pontos documentados:
- `/* MIV */` — valor de identidade visual máxima (sem garantia de contraste)
- `/* ACESSÍVEL */` — nível acessível contra fundo branco

### Aliases semânticos

```css
--color-white:     hsl(39, 80%, 99%)   /* branco quente */
--color-offwhite:  var(--color-gray-50)
--color-black:     var(--color-gray-950)

--color-primary:   var(--color-purple-400)  /* #7c6fcd aprox. */
--color-secondary: var(--color-green-700)   /* verde acessível */
--color-muted:     var(--color-gray-600)
```

### Uso de cor por elemento

| Elemento | Cor |
|---|---|
| Fundo de página | `white` (quente) |
| Texto corrido | `gray-700` (`text-page`) |
| Texto default/títulos | `gray-800` (`text-default`) |
| Taglines | `secondary` (green-700) |
| Links de navegação hover | `orange-400` (`text-link`) |
| Ícones primários | `primary` (purple-400) |
| Texto desativado/subtítulos | `muted` (gray-600) |
| Seleção de texto | `yellow/30` |
| SocialLink hover | `purple-100` bg / `purple-600` texto |
| Dropdown hover | `orange-50` bg |

---

## Tipografia

```css
--font-sans:    'Poppins', ui-sans-serif, system-ui, …
--font-heading: 'Agency', var(--font-sans)
```

`Agency` é fonte customizada para headings. Poppins para todo o resto.

### Hierarquia textual

| Nível | Classes Tailwind | Notas |
|---|---|---|
| H1 (Hero) | `font-heading text-3xl md:text-6xl font-bold leading-tighter` | |
| H2 (Seção) | `font-heading text-3xl md:text-4xl font-bold leading-tighter` | via `Headline` |
| Tagline | `text-secondary text-base font-bold tracking-wide uppercase` | acima do h2 |
| Subtítulo | `text-muted text-xl mt-4` | abaixo do h2 |
| Corpo | `text-page` (gray-700) | |
| Muted/caption | `text-muted text-xs` | ex: cargo em depoimentos |

---

## Botões

Componente: `src/components/ui/Button.astro`  
Renderiza `<a>` ou `<button>` conforme prop `type`.

### Variantes

| Variant | Classes base | Aparência |
|---|---|---|
| `primary` | `btn btn-primary` | Fundo purple-400, hover fundo green-700, texto branco |
| `secondary` *(default)* | `btn` | Transparente, borda gray-400, hover yellow-50/border-yellow-300 |
| `tertiary` | `btn btn-tertiary` | Texto muted, sem borda, hover neutral-900 |
| `link` | `cursor-pointer hover:text-primary` | Texto simples, sem moldura |

### Tamanhos

| Size | Padding | Fonte |
|---|---|---|
| `small` | `px-3 py-1` | `text-sm` |
| `medium` *(default)* | `px-8 py-3.5` | `text-base` |

Todos: `rounded-full`, `font-medium`, `transition duration-200 ease-in`.  
Foco: `ring-2 ring-yellow-500 ring-offset-2`.

---

## Layout

### Container padrão

```
max-w-7xl  mx-auto  px-4 sm:px-6 md:px-6
```

Seções usam `WidgetWrapper` (`src/components/ui/WidgetWrapper.astro`):
- Padding vertical: `py-12 md:py-16 lg:py-20`
- Scroll offset: `scroll-mt-[72px]` (compensa header fixo)
- Suporte a fundo escuro via prop `isDark`

### Hero

- Offset negativo no desktop: `-mt-[76px]` + padding compensatório `pt-[76px]`
- Conteúdo: `max-w-5xl` centralizado, ações em coluna mobile / linha desktop

### Grid de itens

Dois componentes disponíveis:

**`ItemGrid`** — ícone inline à esquerda do texto:
- 2 col: `sm:grid-cols-2`
- 3 col: `sm:grid-cols-2 lg:grid-cols-3`
- 4 col: `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`

**`ItemGrid2`** — ícone acima, layout empilhado (mesmo breakpoints).

---

## Componentes de UI

### `Headline`
Bloco tagline + h2 + subtítulo, sempre centralizado.  
Customizável via prop `classes` (container, title, subtitle).

### `Timeline`
Lista vertical com ícone circular (borda 2px `primary`) e linha conectora `bg-black/10`.  
Último item omite a linha.

### `DListItem`
Simula `<dl>`: `<h6>` com ícone opcional + conteúdo identado (`ml-8`).

### `SocialLink`
Ícone 20×20, padding `p-2.5`, hover `bg-purple-100 text-purple-600`, `rounded-md`.

### `Background`
Wrapper posicional `absolute inset-0`. Com `isDark`: adiciona `bg-dark`.  
Seções recebem elementos decorativos via slot `bg`.

---

## Cartões / Depoimentos

```
rounded-xl  border border-gray-500/30
bg-[#fff]/80  backdrop-blur-xs
shadow-xl  p-4 md:p-6
```

Efeito glassmorphism leve sobre fundos texturizados.

---

## Header

- Sticky, `z-40`, `border-b border-gray-50`
- Scroll: `bg-white/90 backdrop-blur-md` + sombra suave
- Mobile: menu expandido `position: fixed`, cobre viewport exceto header/footer (70px cada)
- Dropdown: visível em `:hover` e `:focus-within`; `bg-white/90 backdrop-blur-md` no desktop

---

## Footer

- `border-t border-gray-100`
- Grid 12 colunas; logo ocupa `col-span-12 lg:col-span-4`

---

## Animações

Definidas em `@theme`, aplicadas via classe Tailwind.

| Token | Duração | Efeito |
|---|---|---|
| `animate-fade-up` | 0.6s | `opacity 0→1` + `translateY(4rem→0)` |
| `animate-scroll-left` | 75s linear ∞ | `translateX(0→-50%)` — carrossel |
| `animate-scroll-right` | 75s linear ∞ | `translateX(-50%→0)` — carrossel reverso |

Pausar animação: classe `animation-paused`.  
Carrossel pausa em hover do elemento pai.

---

## Efeitos decorativos

### Texto gradiente
```css
.text-gradient {
  background: linear-gradient(to bottom right, purple, orange, yellow);
  background-clip: text;
  color: transparent;
}
```

### Blobs SVG orgânicos
Formas irregulares em `orange` e `green` usadas como fundo decorativo (ex: seção Contato).  
Posicionadas com `absolute`, `z-index: -10`, tamanho `h-1/4`.

### Ícones de Features
```
bg-primary  rounded-full  w-10 h-10 p-2  text-white
md:w-12 md:h-12 md:p-3
```

---

## Ícones

Biblioteca: **Tabler Icons** via `astro-icon`.  
Referenciados como `tabler:nome-do-icone`.

Modificadores de espessura (via classe no elemento pai):
- `.icon-light` → `stroke-width: 1.2`
- `.icon-bold` → `stroke-width: 2.4`

---

## Modo Escuro

Variante customizada via `.dark` no elemento pai:
```css
@custom-variant dark (&:where(.dark, .dark *));
```
Componente `ToggleTheme` disponível no header.

---

## Responsividade

Breakpoints padrão do Tailwind (sm: 640px, md: 768px, lg: 1024px).  
Padrão mobile-first. Grids colapsam para 1 coluna em mobile.

---

## Logo

Duas versões SVG inline:
- **Completa** (header hero/footer): `h-16`, inclui ícone + nome completo "Grupo Escoteiro / Albert Schweitzer"
- **Compacta** (footer): `h-10`, apenas logotipo com sigla "GRUPO ESCOTEIRO / Albert Schweitzer"

Cor do logotipo: `#63626B` (equivale a gray-500 no sistema).
