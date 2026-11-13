# Modelo e vocabulário do Inventário

Decisões sobre o funcionamento do Inventário, tomadas antes da implementação. Termos usados na interface, no código e na documentação; quando um termo aparecer em outro lugar com outro sentido, corrija lá. Nomes de tabela marcados com *(proposto)* ainda não existem.

O regulamento patrimonial do grupo está para ser aprovado em assembleia. Até lá, regras que dependem dele (prazos, quem pode dar baixa, valores mínimos para registro) não ficam fixas no banco; depois da aprovação, conferir este documento contra o regulamento.

## Termos

| Termo | O que é | No banco |
|---|---|---|
| **Material** | Tipo de coisa que o grupo tem: "Barraca iglu 4 pessoas", "Caneca de alumínio", "Botijão de gás P13". É o que aparece no cadastro e nas listas. Controlado por **peça** (com etiqueta) ou por **quantidade**, nunca os dois. | `inventory_items` (a reformular) |
| **Peça** | Unidade individual de um material controlado por peça (barraca, fogareiro, lampião), com etiqueta, divisão, condição e histórico próprios. | `inventory_units` *(proposto)* |
| **Lote** | Quantidade de um material sem etiqueta (pratos, canecas, estacas, remédios) numa divisão, com condição, valor estimado e validade próprios. O mesmo material pode ter vários lotes, na mesma divisão ou em outras: "3 fogareiros bons a R$ 80" e "1 com a caixa quebrada a R$ 40" são dois lotes. | `inventory_stock` *(proposto)* |
| **Consumível** | Material que acaba com o uso (gás, fita, pilhas, primeiros socorros). Sempre por lote, com **estoque mínimo**; sai por **consumo**. | marcação no material |
| **Validade** | Data de vencimento do lote, quando houver (remédios, repelente, protetor solar, gás). O app avisa dos lotes vencidos e perto de vencer. | `inventory_stock.expires_on` *(proposto)* |
| **Família** | Agrupamento de materiais com o mesmo código de etiqueta (3 dígitos): todas as barracas = `001`, independentemente do modelo. | *(proposto)* |
| **Etiqueta** | Código da peça no formato `GEAS-000-0000`: código da **família** e contagem dentro da família (4 dígitos). Opcional por enquanto: as etiquetas físicas ainda não existem, e o número é preenchido quando a etiqueta for colocada na peça (o app pode sugerir o próximo livre da família). Única no grupo, nunca reaproveitada; não muda quando a peça troca de divisão. | `inventory_units.tag` *(proposto)* |
| **Divisão** | Onde o material fica guardado na sede, em árvore e com quantos níveis forem precisos: Diretoria › Estante, Diretoria › Armário de ferro, Cozinha › Estante de canecas › 2º nível, Tropa Escoteira › Patrulha Lobo, Distintivos e certificados. A ordem das divisões (e das subdivisões dentro de cada uma) é escolhida pelo gestor, não alfabética; as raízes são os locais macro, as abas da lista de materiais. É o "onde está", não o "de quem é": legalmente, tudo é do grupo, e as patrulhas também são lugar, não dono. Praticamente tudo fica na sede. | `inventory_locations` (`parent_id`, `position`) |
| **Condição** | Estado da peça ou do lote: novo, bom, regular, ruim, em manutenção, inservível ("ruim" é usado pelo grupo e falta no tipo atual). Num lote, todas as unidades têm a mesma condição: "2 ruins, 1 razoável, 1 ok" são três lotes. Também é conferida na conferência anual. | `inventory_condition` (acrescentar `ruim`) |
| **Entrada** | Chegada do material ao grupo. Obrigatórios: data, origem (compra, doação, fabricação própria, não informada) e valor estimado. Opcionais: observação, fornecedor e nota fiscal. | colunas da peça / movimento *(proposto)* |
| **Valor estimado** | Quanto vale cada unidade da peça ou do lote para o patrimônio; lotes do mesmo material podem ter valores diferentes. Diferente do **preço de venda** dos produtos da Lojinha. | *(proposto)* |
| **Baixa** | Saída definitiva do patrimônio, com motivo: perda, extravio, descarte, doação ou consumo. Sem anexos (no máximo poucos, se o regulamento exigir). | movimento do tipo baixa *(proposto)* |
| **Movimento** | Registro de toda mudança: entrada, troca de divisão, mudança de condição, ajuste de quantidade, baixa, venda e entrega da Lojinha. É o histórico e a base da revisão. | `inventory_movements` (a ampliar) |
| **Revisão** | Todo movimento registrado por um chefe vale na hora e fica **pendente de revisão** até o gestor (ou administrador) revisar. Quem revisa aprova (**revisado**) ou recusa: o movimento recusado continua valendo e vai para o relatório **Para revisar**, para ser questionado depois com quem registrou. | *(proposto)* |
| **Contagem anual** | Quantidade contada de um material numa divisão num ano (uma por ano). A planilha trouxe 2024 a 2026; a conferência registra as próximas. A lista de materiais mostra a do ano anterior. Só o gestor registra. | `inventory_counts` |
| **Conferência** | Processo anual (no mínimo), aberto pelo diretor no começo do ano ("Conferência 2027"): os chefes, com as seções, conferem as divisões e lançam as **divergências** de quantidade e de condição; as divergências viram ajustes. | `inventory_audits` *(proposto)* |
| **Produto (Lojinha)** | Cadastro à parte do patrimônio, de itens vendidos ou entregues (lenço, camiseta, distintivo), com **variações** (tamanho, tipo de lenço), preço de venda e estoque numa divisão (ex.: Diretoria › Armário de ferro). Cadastrado no Inventário pelo gestor ou pela tesouraria. | *(proposto)* |
| **Venda (Lojinha)** | Lançada no Financeiro, na rubrica Lojinha, escolhendo os produtos e variações vendidos na lista de produtos à venda; gera a saída do tipo **venda** no Inventário. A compra de reposição também é lançada no Financeiro e gera a entrada. | *(proposto)* |
| **Entrega (Lojinha)** | Saída sem venda, como o lenço da Acolhida do jovem novo. Registrada no Inventário; o associado que recebeu é opcional. | *(proposto)* |
| **Distintivos e certificados** | Divisão própria com distintivos, insígnias, cordões e certificados, agrupados por família (promessa, especialidades, progressão…). Nunca são vendidos: saem sempre por **entrega**, como o lenço da Acolhida. | *(proposto)* |

## Papéis

**Administrador** é um papel do grupo e vale nos dois apps: administra o Financeiro e o Inventário (e os usuários). Os demais papéis são **por app**: o papel no Financeiro (tesoureiro, consulta) não vale para o Inventário, e vice-versa. Hoje o papel é um só por pessoa (`memberships.role`), e por isso o Inventário só trata administrador e tesoureiro como editores; uma conta da diretoria que é Consulta no Financeiro aparece como Consulta também no Inventário, quando deveria ser Gestor.

| Papel no Inventário | Pode |
|---|---|
| **Administrador** (do grupo) | Tudo o que o gestor pode, mais gerenciar usuários e acessos. Vale também no Financeiro. |
| **Gestor** (ex.: diretor de patrimônio) | Cadastra e movimenta sem passar por revisão; revisa os movimentos dos chefes; abre e fecha a conferência; cadastra produtos da Lojinha. Não gerencia usuários. |
| **Chefe** (usuário normal) | Cadastra e movimenta material: vale na hora e fica pendente de revisão; lança divergências na conferência. |
| **Consulta** | Só vê. |

Movimentos do gestor e do administrador já nascem revisados.

A tesouraria lança vendas e compras da Lojinha no Financeiro e também cadastra produtos no Inventário; para isso, quem é da tesouraria precisa de um papel no Inventário (gestor, ou chefe com revisão).

## Fora do escopo por enquanto

- **Empréstimo, retirada e devolução**: pouco usados no começo. Material que sai para atividade do calendário não conta como empréstimo e não é registrado.
- **Reservas**: as seções não disputam material.
- **QR code** nas etiquetas: possível depois; o formato da etiqueta já comporta.
- **Anexos e fotos** de avaria.

## Ordem de implementação

1. **Cadastro**: material por peça ou por quantidade, consumíveis, divisões em árvore, etiquetas, dados de entrada, baixa. Papéis por app.
2. **Lojinha**: produtos e variações; venda pelo Financeiro (rubrica Lojinha) gerando a saída; entrega gratuita no Inventário.
3. **Revisão** pelo gestor.
4. **Conferência** anual.

## Carga inicial

Fonte: planilha "Doc 31 – Inventário" (uma aba por área, quantidades de 2024, 2025 e 2026, estado em texto livre, valor unitário e observações). Na importação:

- Cada aba vira uma divisão; os subtítulos de cada aba viram subdivisões (patrulhas, estantes, caixas, pastas), exceto onde são famílias: Lenços, Camisetas e Moletons (produtos da Lojinha, com o tamanho como variação) e os tipos de distintivo.
- A divisão da planilha é o ponto de partida: onde ela não diz a estante ou o armário, os chefes completam na primeira conferência.
- Cada linha vira um lote (linhas repetidas do mesmo material, com condição ou valor diferentes, viram lotes diferentes; linhas com contagem por condição, como "2 ruins / 1 razoável / 1 ok", são divididas). A quantidade atual é a de 2026 ou, onde 2026 não foi contado, a de 2025. As contagens de 2024 a 2026 entram como histórico das conferências.
- O estado em texto livre vira condição; o que não for condição (validade, observações) vai para o campo certo.
- Linhas com quantidade atual 0 não viram lote (a planilha guarda o histórico). As marcadas "ver onde está" são candidatas a extravio na primeira conferência.
- A coluna Categoria (só a Alcateia tem: Atividade, Compartilhado, Infraestrutura, Primeiros Socorros) não tem campo próprio no modelo: vai para a observação do lote.
- A aba BARRACAS (B1 a B11, conferidas em 10/01/2026) vira peças com etiqueta, família Barracas (`001`): B1 = `GEAS-001-0001` … B11 = `GEAS-001-0011`, com o código antigo e a descrição de cada uma, no material "Barraca etiquetada" e na divisão provisória Almoxarifado › Barracas (a conferir). Falta conciliar com as linhas de barraca das abas das seções (que continuam como lotes), para não contar a mesma barraca duas vezes.
- Descartados: a aba ALCATEIA TESTE e as linhas "a adquirir" (lista de compras, não patrimônio).
- Lenços, camisetas, moletons e distintivos entram, por enquanto, como materiais por quantidade nas suas famílias; viram produtos com variações no passo 2 (Lojinha).

Scripts (só para o banco local de desenvolvimento; os CSV são dados do grupo e não são versionados):

```bash
node apps/inventario/scripts/planilha-para-csv.mjs <planilha.xlsx> <pasta>     # gera inventario-lotes.csv e inventario-pecas.csv
node apps/inventario/scripts/importar-planilha.mjs <pasta> --grupo "<nome>"     # apaga o inventário do grupo e importa pelas funções
```

## Em aberto

- **Regulamento patrimonial**: conferir regras quando aprovado.
