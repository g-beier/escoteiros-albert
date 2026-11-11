# Backlog

## Lançamentos e rubricas

- Remover o card/indicador de quantidade de lançamentos; essa contagem não é relevante para a operação.
- Rever o modelo e a experiência de cadastro das rubricas.
- Tratar a descrição como informação do rateio/rubrica, e não como uma única descrição da linha do extrato.
- Manter explícita a relação entre uma linha do extrato e seus vários rateios por rubrica.

## Tabelas e filtros

- Preservar nas visualizações as colunas operacionais:
  - Data
  - Forma pgto
  - Pasta
  - Valor
  - Nome do Associado
  - Descrição
  - Rubrica
- Tornar as tabelas compactas, priorizando densidade de informação e leitura rápida.
- Adicionar filtros adequados às colunas, considerando pelo menos data, forma de pagamento, pasta, associado, descrição e rubrica.
- Definir o comportamento responsivo sem eliminar as informações essenciais dessas colunas.

## Visões

- A visão **Por extrato** deve exibir as linhas do extrato preservando o vínculo com seus rateios.
- A visão **Por rubrica** não deve ser consolidada por total.
- A visão **Por rubrica** deve ser “explodida”: cada rateio ocupa uma linha própria, repetindo os dados necessários da linha de extrato de origem.
- Como uma linha de extrato pode possuir várias rubricas, a visão explodida normalmente terá mais linhas que a visão por extrato.
- Os rateios explodidos devem continuar ligados à mesma linha de extrato para navegação, edição e rastreabilidade.

## Componentes e interação

- Melhorar os componentes de `select` e `input`, incluindo estados de foco, erro, preenchimento, busca e teclado.
- Adotar shadcn/ui como base para os componentes do produto, usando o preset `b1D0eVNQ` como ponto de partida.
- Usar do preset a estrutura dos componentes, espaçamentos, raios, ícones e comportamentos acessíveis; não considerar sua paleta atual como identidade final.
- Mapear os tokens semânticos do shadcn (`background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` e gráficos) para a paleta do Grupo Escoteiro Albert Schweitzer.
- Antes de aplicar o preset, revisar o `dry-run`/`diff` do CLI para evitar sobrescrever o CSS, a tipografia e os componentes já adaptados.
- Priorizar inicialmente `Button`, `Input`, `Select`/`Combobox`, `Dialog`, `Dropdown Menu` e componentes auxiliares de tabela e filtros.
- Tornar os botões redondos, mantendo hierarquia visual, área de toque e estados acessíveis.
