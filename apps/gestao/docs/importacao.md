# Importação por CSV: contrato

Formato dos arquivos que povoam o Gestão (Associados e Inventário) pela tela **Importar** (`/importar`). Este documento
é a especificação para quem converte as planilhas do grupo, à mão ou com IA: cole-o no pedido junto com a planilha.

As tabelas de colunas abaixo são geradas de `lib/import/contract.ts` (`npm run import:doc --workspace=@geas/gestao`);
não as edite à mão.

## Como funciona

1. Gere um ou mais arquivos desta lista. Nenhum é obrigatório; mande só o que tiver.
2. Em **Importar**, envie os arquivos juntos (o tipo vem do nome do arquivo, ou do cabeçalho se o nome for outro).
3. Confira a pré-visualização: cada linha aparece como nova, atualiza (com o que muda), igual, aviso ou erro, e as
   seções, patrulhas, divisões e famílias que serão criadas.
4. Importe. Linhas com erro ficam de fora e continuam listadas: corrija o CSV e envie de novo. Reenviar o mesmo arquivo
   não duplica nada (tudo aparece como "igual").

Ordem em que o app grava (um arquivo pode citar pessoas de outro do mesmo envio): `secoes` → `itens-controle` →
`pessoas` → `funcoes` → `responsaveis` → `controle` → `vida-escoteira` → `inventario-lotes` → `inventario-pecas`.
Tudo numa transação só: um erro inesperado no banco desfaz o envio inteiro.

Na mesma tela dá para baixar o **modelo vazio** de cada arquivo e os **dados atuais** no mesmo formato (com a coluna
`id`): servem de exemplo e permitem exportar, corrigir numa planilha e reimportar.

## Regras para todos os arquivos

- **Codificação e separador:** UTF-8 (com ou sem BOM) ou Windows-1252; separador `;` (preferido) ou `,`. Campos com
  separador, aspas ou quebra de linha entre aspas duplas (`"Silva; Souza"`), aspas internas dobradas (`""`).
- **Cabeçalho** na primeira linha, com os nomes das colunas das tabelas abaixo (ou um dos nomes alternativos). Acentos,
  maiúsculas e espaços repetidos não importam; a ordem das colunas é livre. Coluna que não está no contrato gera um
  aviso e é ignorada.
- **Uma informação por célula.** Nada de totais, subtítulos, linhas em branco no meio, células mescladas ou cores com
  significado: o que a cor diz na planilha vira valor numa coluna.
- **Tipos:**
  - data: `dd/mm/aaaa` (aceita `aaaa-mm-dd`; ano com 2 dígitos vale 2000–2069 ou 1970–1999);
  - mês: `mm/aaaa` (só nas colunas de início e fim da vida escoteira);
  - sim/não: `sim` ou `não` (aceita `s`, `n`, `x` = sim);
  - valor: `1.234,56` (com ou sem `R$`);
  - listas: um dos valores indicados (sem diferenciar acento nem maiúsculas).
- **Célula vazia não muda nada** no que já está no app. Ao criar, vazia vale o padrão indicado. Para apagar um valor,
  use a tela normal do app.
- **Pessoas são identificadas** pelo `id` (quando vier da exportação); senão pelo nome + nascimento; senão pelo nome,
  se só existir uma pessoa com ele. Nome comparado sem acento, maiúsculas nem espaços repetidos: "José  da Silva" =
  "jose da silva". Se houver duas pessoas com o mesmo nome, informe o nascimento.
- **Nomes de seção, patrulha, divisão e família** que não existem são criados; a pré-visualização mostra cada um como
  "nova seção…" para pegar erros de digitação antes de gravar.
- **Dados pessoais:** só nomes, datas e vínculos. Nada de CPF, RG, endereço, telefone, e-mail ou saúde (ficam no Paxtu).
- Os CSVs são dados do grupo (com menores): não os guarde no repositório nem em pastas compartilhadas abertas.

## De onde vem cada arquivo

| Planilha | Arquivos |
|---|---|
| Doc 10 – Lista simples de efetivo | `pessoas.csv` (nome, ramo, seção, registro definitivo/provisório), `funcoes.csv` (escotistas por seção, diretoria com eleitos em negrito, honoríficos, comissão fiscal), `responsaveis.csv` (familiares de cada jovem: `*` = não é responsável legal; "Ver X" = o mesmo responsável já listado no irmão X, repetir a linha com o jovem atual) |
| Doc 13 – Controle de idade | `pessoas.csv` (nascimento) |
| Doc 14a – Datas de promessa | `pessoas.csv` (promessa) |
| Doc 22 – Controle de fluxo de dados pessoais | `controle.csv` (uma coluna por item; `NÃO`, `OK`, `DESAT.`, `ANTIGA`, `VER`, `TEM?`, `CONV.`, `XXX` são aceitos como estão; célula cinza = deixar vazia), `itens-controle.csv` só se houver coluna que não existe no app |
| Linha do tempo (vida escoteira) | `vida-escoteira.csv`: cada sequência de meses pintados da mesma cor vira uma linha `período` (cor do ramo = ramo; azul = `adulto`); meses em branco entre elas são lacunas (não gerar linha); anotações viram `anotação` ou, com data, `evento` |
| Doc 31 – Inventário | `inventario-lotes.csv` (uma linha por material × divisão × condição; aba = divisão, subtítulo = subdivisão `Aba › Subtítulo`; colunas de quantidade por ano = `contagem AAAA`; estado em texto livre = `condição` + `observação`; validade escrita no estado vai para `validade`; "a adquirir" não entra), `inventario-pecas.csv` (aba BARRACAS: uma linha por barraca etiquetada). O script `apps/gestao/scripts/inventory/planilha-para-csv.mjs` já faz essa conversão |

## Arquivos

<!-- contrato:inicio -->

### `secoes.csv`: Seções e patrulhas

- **Uma linha por:** seção (patrulha vazia) ou patrulha de uma seção.
- **Identificação:** ramo + seção (+ patrulha).
- **Reimportar:** Cria o que falta; `ativa` muda a situação. Nunca apaga.
- Opcional: seções e patrulhas citadas em `pessoas.csv` e `funcoes.csv` também são criadas. Este arquivo serve para cadastrar as vazias ou desativar.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `ramo` | sim | `filhote`, `lobinho`, `escoteiro`, `sênior`, `pioneiro`, `adulto` | Ramo da seção. | escoteiro |
| `seção` (ou `secao`) | sim | texto (até 60) | Nome da seção. | Tropa Tupã |
| `patrulha` (ou `equipe`, `matilha`) |  | texto (até 60) | Nome da patrulha (vazio = a linha é da seção). | Patrulha Lobo |
| `ativa` |  | sim/não | Padrão: sim. | sim |

Exemplo:

```csv
ramo;seção;patrulha;ativa
lobinho;Alcateia Seeonee;;sim
escoteiro;Tropa Tupã;;
escoteiro;Tropa Tupã;Patrulha Lobo;
escoteiro;Tropa Tupã;Patrulha Águia;
```

### `itens-controle.csv`: Itens de controle (colunas do Doc 22)

- **Uma linha por:** item de controle.
- **Identificação:** nome do item.
- **Reimportar:** Atualiza os campos preenchidos. Itens novos vão para o fim da sua diretoria.
- Opcional: os 28 itens do Doc 22 já vêm cadastrados. Use para criar itens novos antes de importar `controle.csv` ou ajustar os existentes.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `item` (ou `nome`) | sim | texto (até 80) | Nome do item; é o nome da coluna em controle.csv. | Ficha de saúde |
| `diretoria` | ao criar | `métodos educativos`, `administrativa`, `financeira`, `comunicação` | Diretoria dona do item. | métodos educativos |
| `tipo` | ao criar | `documento`, `sistema`, `canal`, `etapa` | O que o item controla. | documento |
| `valor` |  | `situação`, `ano`, `data` | O que a célula mostra. Padrão: situação. | situação |
| `validade meses` (ou `validade`) |  | inteiro 1–120 | Depois disso, ok vira desatualizado. | 12 |
| `remover no desligamento` |  | sim/não | Abre "a remover" quando a pessoa sai. Padrão: não. | não |
| `jovem` |  | `não`, `sim`, `ok`, `pendente`, `desatualizado`, `a verificar`, `convidado`, `n/a` | Se vale para jovens: `não`, `sim` (sem valor inicial) ou a situação gravada ao cadastrar (ex.: `pendente`). Na criação, vazio = não. | pendente |
| `adulto` |  | `não`, `sim`, `ok`, `pendente`, `desatualizado`, `a verificar`, `convidado`, `n/a` | Idem, para adultos. | pendente |
| `responsável` (ou `responsavel`) |  | `não`, `sim`, `ok`, `pendente`, `desatualizado`, `a verificar`, `convidado`, `n/a` | Idem, para responsáveis. | não |

Exemplo:

```csv
item;diretoria;tipo;valor;validade meses;remover no desligamento;jovem;adulto;responsável
Ficha de saúde;métodos educativos;documento;situação;12;não;pendente;pendente;não
Grupo de WhatsApp;comunicação;canal;situação;;sim;não;convidado;convidado
Ano-base do registro;administrativa;etapa;ano;;não;sim;sim;não
```

### `pessoas.csv`: Pessoas (associados)

- **Uma linha por:** associado (jovem ou adulto).
- **Identificação:** `id`; senão nome + nascimento; senão o nome, se for único no grupo.
- **Reimportar:** Atualiza só as colunas preenchidas; célula vazia não apaga nada.
- Entrada e desligamento entram no histórico com a data do arquivo (não a data da importação).
- Responsáveis que não são associados não vão aqui: vão em `responsaveis.csv`.
- O ramo `filhote` só é aceito quando o ramo Filhote estiver ligado no app.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `id` |  | id do app | Id no app (vem da exportação). Vazio = procurar pelo nome. |  |
| `nome` (ou `pessoa`, `associado`, `nome completo`) | sim | texto (até 120) | Nome completo. | Ana Souza |
| `apelido` |  | texto (até 8) | Até 8 letras; usado nos relatórios ("Ver Ana"). | Aninha |
| `nascimento` |  | data dd/mm/aaaa | Data de nascimento. | 14/05/2015 |
| `ramo` | ao criar | `filhote`, `lobinho`, `escoteiro`, `sênior`, `pioneiro`, `adulto` | Ramo atual; adultos = adulto. | lobinho |
| `seção` (ou `secao`) |  | texto (até 60) | Seção do ramo (criada se não existir). Adulto: vazio. | Alcateia Seeonee |
| `patrulha` (ou `equipe`, `matilha`) |  | texto (até 60) | Patrulha da seção (criada se não existir). |  |
| `registro` |  | `provisório`, `definitivo` | Registro na UEB. Na criação, vazio = provisório. | definitivo |
| `entrada` |  | data dd/mm/aaaa | Data de entrada no grupo. | 10/03/2022 |
| `promessa` |  | data dd/mm/aaaa | Data da promessa (vazia para promessa feita em outro grupo sem data). | 18/06/2022 |
| `situação` (ou `situacao`, `status`) |  | `ativo`, `desligado` | Na criação, vazio = ativo. | ativo |
| `desligado em` (ou `desligamento`, `saida`) | se situação desligado | data dd/mm/aaaa | Data do desligamento. |  |
| `motivo` (ou `motivo do desligamento`) |  | texto (até 120) | Motivo do desligamento. |  |
| `observação` (ou `observacao`, `obs`, `notas`) |  | texto (até 500) | Observação geral. |  |

Exemplo:

```csv
id;nome;apelido;nascimento;ramo;seção;patrulha;registro;entrada;promessa;situação;desligado em;motivo;observação
;Ana Souza;Aninha;14/05/2015;lobinho;Alcateia Seeonee;;definitivo;10/03/2022;18/06/2022;ativo;;;
;Bruno Lima;;02/09/2012;escoteiro;Tropa Tupã;Patrulha Lobo;provisório;05/02/2024;;ativo;;;
;Carla Dias;Carla;21/11/1985;adulto;;;definitivo;01/03/2019;12/05/2019;ativo;;;
;Daniel Rocha;;30/01/2011;escoteiro;Tropa Tupã;;definitivo;03/03/2021;15/05/2021;desligado;20/12/2025;Mudou de cidade;
```

### `funcoes.csv`: Funções dos adultos

- **Uma linha por:** função de um adulto (quem tem duas funções tem duas linhas).
- **Identificação:** pessoa + tipo + seção + início (sem início: a função com o mesmo fim, ou a vigente).
- **Reimportar:** Atualiza cargo, fim e eleito da mesma função; cria as que não existem. Nunca apaga.
- Só adultos (ramo adulto) têm função.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `pessoa id` (ou `id`, `pessoa_id`) |  | id do app | Id do associado no app (vem da exportação). Com ele, o nome não precisa bater. |  |
| `pessoa` (ou `nome`, `associado`) | sim | texto (até 120) | Nome do associado, como em pessoas.csv. | Ana Souza |
| `nascimento` |  | data dd/mm/aaaa | Desempata nomes iguais. | 14/05/2015 |
| `tipo` (ou `funcao`) | sim | `escotista`, `dirigente`, `honorífico`, `colaborador`, `contribuinte`, `comissão fiscal` | Tipo da função. | escotista |
| `cargo` |  | texto (até 80) | Ex.: chefe de seção, assistente, diretor-presidente. | Chefe de seção |
| `seção` (ou `secao`) | se escotista | texto (até 60) | Seção do escotista (obrigatória para escotista; vazia nos outros tipos). | Alcateia Seeonee |
| `início` (ou `inicio`) |  | data dd/mm/aaaa | Início da função. | 01/03/2019 |
| `fim` |  | data dd/mm/aaaa | Fim (vazio = vigente). |  |
| `eleito` |  | sim/não | Só dirigente: membro eleito da diretoria. | não |

Exemplo:

```csv
pessoa id;pessoa;nascimento;tipo;cargo;seção;início;fim;eleito
;Carla Dias;21/11/1985;escotista;Chefe de seção;Alcateia Seeonee;01/03/2019;;
;Carla Dias;21/11/1985;dirigente;Diretora de métodos educativos;;01/01/2025;;sim
```

### `responsaveis.csv`: Responsáveis dos jovens

- **Uma linha por:** vínculo entre um jovem e um responsável (irmãos repetem o responsável).
- **Identificação:** jovem + nome do responsável. O mesmo nome de responsável no grupo é a mesma pessoa (irmãos compartilham).
- **Reimportar:** Atualiza parentesco, legal e financeiro; cria vínculos novos. Nunca desvincula.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `jovem id` (ou `jovem_id`) |  | id do app | Id do associado no app (vem da exportação). Com ele, o nome não precisa bater. |  |
| `jovem` (ou `nome do jovem`) | sim | texto (até 120) | Nome do associado, como em pessoas.csv. | Bruno Lima |
| `nascimento do jovem` |  | data dd/mm/aaaa | Desempata nomes iguais. | 02/09/2012 |
| `responsável` (ou `responsavel`, `familiar`, `nome do responsavel`) | sim | texto (até 120) | Nome completo do responsável. | Marta Lima |
| `parentesco` | sim | `mãe`, `pai`, `outro` | mãe, pai ou outro. | mãe |
| `descrição do parentesco` (ou `descricao`, `qual parentesco`) | se parentesco outro | texto (até 40) | Ex.: avó, tia, irmã. |  |
| `legal` (ou `responsavel legal`) |  | sim/não | Responsável legal. Na criação, vazio = não. | sim |
| `financeiro` (ou `responsavel financeiro`) |  | sim/não | Responsável financeiro. Na criação, vazio = não. | sim |
| `associado` (ou `e associado`) |  | texto (até 120) | Se o responsável também é associado (adulto), o nome dele em pessoas.csv. |  |
| `observação` (ou `observacao`, `obs`) |  | texto (até 200) | Observação sobre o responsável. |  |

Exemplo:

```csv
jovem id;jovem;nascimento do jovem;responsável;parentesco;descrição do parentesco;legal;financeiro;associado;observação
;Bruno Lima;02/09/2012;Marta Lima;mãe;;sim;sim;;
;Bruno Lima;02/09/2012;Paulo Lima;pai;;sim;não;;
;Ana Souza;14/05/2015;Carla Dias;outro;tia;não;não;Carla Dias;
```

### `controle.csv`: Controle de dados (Doc 22)

- **Uma linha por:** pessoa (jovem ou adulto) ou responsável.
- **Identificação:** pessoa (ou responsável + jovem) × item.
- **Reimportar:** Grava cada célula preenchida; célula vazia não muda.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `público` (ou `publico`, `tipo`) | sim | `jovem`, `adulto`, `responsável` | jovem, adulto ou responsável. | jovem |
| `pessoa id` (ou `id`, `pessoa_id`) |  | id do app | Id do associado no app (vem da exportação). Com ele, o nome não precisa bater. |  |
| `pessoa` (ou `nome`, `associado`) | sim | texto (até 120) | Nome do associado, como em pessoas.csv. | Ana Souza |
| `nascimento` |  | data dd/mm/aaaa | Desempata nomes iguais. | 14/05/2015 |
| `jovem` | se responsável | texto (até 120) | Só em linha de responsável: um jovem dele (o responsável é procurado entre os responsáveis desse jovem). |  |
| `nascimento do jovem` |  | data dd/mm/aaaa | Desempata jovens com o mesmo nome. |  |
| `<nome do item>` |  |  | Uma coluna por item de controle, com o nome do item (Configurações › Itens, ou itens-controle.csv do mesmo envio); coluna que não é item barra o envio. Célula: situação (tabela abaixo), opcionalmente com a data em que foi conferida (`ok 10/03/2026`); item de ano: o ano (`2026`, vale ok) ou situação e ano; item de data: a validade (`31/03/2027`, vale ok) ou situação e data; texto depois de ` - ` vira observação. Vazia: não muda. | ok - conferido no Paxtu |

Exemplo:

```csv
público;pessoa id;pessoa;nascimento;jovem;nascimento do jovem;Ficha de saúde;Dados individuais no Paxtu;Ano-base do registro
jovem;;Bruno Lima;02/09/2012;;;ok;ok - conferido em março;2026
responsável;;Marta Lima;;Bruno Lima;02/09/2012;;pendente;
adulto;;Carla Dias;21/11/1985;;;desatualizado;ok;2025
```

### `vida-escoteira.csv`: Vida escoteira (linha do tempo)

- **Uma linha por:** fato da vida escoteira de uma pessoa: período, exclusão, evento, estrela ou anotação.
- **Identificação:** pessoa + tipo.
- **Reimportar:** Para cada pessoa, os fatos dos tipos presentes no arquivo substituem os do app (ex.: linhas de período de Ana trocam todos os períodos de Ana; os eventos dela ficam).
- Períodos não se sobrepõem; na passagem, um termina no mês anterior ao início do outro.
- A contagem começa na promessa (pessoas.csv) e as estrelas são calculadas; a linha `estrela` só registra entrega ou correção de ramo.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `pessoa id` (ou `id`, `pessoa_id`) |  | id do app | Id do associado no app (vem da exportação). Com ele, o nome não precisa bater. |  |
| `pessoa` (ou `nome`, `associado`) | sim | texto (até 120) | Nome do associado, como em pessoas.csv. | Ana Souza |
| `nascimento` |  | data dd/mm/aaaa | Desempata nomes iguais. | 14/05/2015 |
| `tipo` | sim | `período`, `exclusão`, `evento`, `estrela`, `anotação` | período, exclusão, evento, estrela ou anotação. | período |
| `ramo` | se período | `filhote`, `lobinho`, `escoteiro`, `sênior`, `pioneiro`, `adulto` | Período: ramo (adulto = escotista ou dirigente). Estrela: correção do ramo da estrela. | lobinho |
| `início` (ou `inicio`) | se período, exclusão | mês mm/aaaa ou data | Mês (mm/aaaa = dia 1º) ou data. | 03/2022 |
| `fim` | se exclusão | mês mm/aaaa ou data | Último mês (mm/aaaa, inclusive) ou último dia. Período vazio = vigente. | 12/2025 |
| `outro grupo` (ou `grupo`) |  | texto (até 80) | Período em outro grupo: o nome dele. |  |
| `motivo` | se exclusão | `frequência`, `licença`, `suspensão`, `outro` | Exclusão: frequência, licença (acima de 60 dias), suspensão ou outro. |  |
| `data` | se evento | data dd/mm/aaaa | Evento: data. |  |
| `título` (ou `titulo`) | se evento | texto (até 80) | Evento: título (ex.: Cruzeiro do Sul). |  |
| `descrição` (ou `descricao`, `texto`) | se anotação; exclusão com motivo outro | texto (até 1000) | Evento: detalhe. Exclusão: observação. Anotação: o texto (várias linhas de anotação se juntam). |  |
| `estrela` | se estrela | inteiro 1–99 | Número da estrela de atividade. |  |
| `entregue em` |  | data dd/mm/aaaa | Estrela: data da entrega do certificado. |  |

Exemplo:

```csv
pessoa id;pessoa;nascimento;tipo;ramo;início;fim;outro grupo;motivo;data;título;descrição;estrela;entregue em
;Bruno Lima;02/09/2012;período;lobinho;02/2020;02/2023;Grupo Escoteiro Exemplo;;;;;;
;Bruno Lima;02/09/2012;período;escoteiro;03/2023;;;;;;;;
;Bruno Lima;02/09/2012;exclusão;;04/2024;08/2024;;licença;;;;;
;Bruno Lima;02/09/2012;evento;;;;;;10/11/2024;Lis de Ouro;;;
;Bruno Lima;02/09/2012;estrela;;;;;;;;;1;20/06/2021
;Bruno Lima;02/09/2012;anotação;;;;;;;;Ficha antiga cita acampamento regional em 2021.;;
```

### `inventario-lotes.csv`: Inventário: materiais por quantidade (lotes)

- **Uma linha por:** lote: um material numa divisão, numa condição (e validade e variação).
- **Identificação:** material + divisão + condição + validade + variação (linhas iguais somam).
- **Reimportar:** Substitui o inventário inteiro (divisões, famílias, materiais, lotes, peças, contagens), enquanto nada tiver sido registrado pelo app.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `divisão` (ou `divisao`, `local`) | sim | texto (até 400) | Caminho da divisão, do mais geral ao mais específico, separado por ` › ` ou ` > ` (criada se não existir). | Almoxarifado › Estante 1 |
| `família código` (ou `codigo da familia`) |  | texto (3) | Código de 3 dígitos da família. | 002 |
| `família` (ou `familia`) |  | texto (até 80) | Nome da família (criada se não existir). | Cozinha |
| `material` (ou `item`, `nome`) | sim | texto (até 120) | Nome do material; o mesmo nome em várias linhas é o mesmo material. | Panela 10 L |
| `descrição do material` |  | texto (até 500) | Descrição do material (a primeira preenchida vale). |  |
| `consumível` (ou `consumivel`) |  | sim/não | Consumível (some com o uso). Padrão: não. | não |
| `mínimo` (ou `minimo`, `estoque minimo`) |  | inteiro 0–100000 | Estoque mínimo do material. |  |
| `quantidade` (ou `qtd`) |  | inteiro 0–1000000 | Quantidade atual. Vazia = a contagem mais recente. Zero = só registra as contagens. | 4 |
| `condição` (ou `condicao`, `estado`) |  | `novo`, `bom`, `regular`, `ruim`, `em manutenção`, `inservível` | Vazia = não se aplica (consumível aberto etc.). | bom |
| `validade` |  | data dd/mm/aaaa | Validade do lote. |  |
| `valor unitário` (ou `valor unit`, `valor`) |  | valor 1.234,56 | Valor de uma unidade. | 89,90 |
| `variação` (ou `variacao`) |  | texto (até 80) | Diferencia lotes do mesmo material (ex.: modelo antigo, tamanho P). |  |
| `observação` (ou `observacao`, `obs`) |  | texto (até 500) | Observação do lote. |  |
| `contagem AAAA` |  |  | Uma coluna por ano de conferência (ex.: `contagem 2025`, `contagem 2026`): a quantidade contada naquele ano, no histórico do material e da divisão. | 4 |

Exemplo:

```csv
divisão;família código;família;material;descrição do material;consumível;mínimo;quantidade;condição;validade;valor unitário;variação;observação;contagem 2025;contagem 2026
Cozinha e despensa › Armário 1;002;Cozinha;Panela 10 L;;não;;3;bom;;89,90;;;4;3
Cozinha e despensa › Armário 1;002;Cozinha;Panela 10 L;;não;;1;ruim;;89,90;;Alça solta;1;1
Alcateia;005;Primeiros socorros;Soro fisiológico 250 mL;;sim;4;;;31/08/2027;6,50;;;10;6
```

### `inventario-pecas.csv`: Inventário: peças etiquetadas

- **Uma linha por:** peça com etiqueta (ex.: barraca B1).
- **Identificação:** etiqueta (ou código antigo).
- **Reimportar:** Substitui junto com inventario-lotes.csv, que precisa vir no mesmo envio.

| Coluna | Obrigatória | Valores | O que é | Exemplo |
|---|---|---|---|---|
| `etiqueta` |  | texto (até 20) | `GEAS-<família>-<número>` (ex.: GEAS-001-0001). Vazia = sem etiqueta ainda. | GEAS-001-0001 |
| `código antigo` (ou `codigo`) |  | texto (até 30) | Código usado antes (ex.: B1). | B1 |
| `material` (ou `item`, `nome`) | sim | texto (até 120) | Material da peça (não pode ser também material de lotes). | Barraca iglu 4 pessoas |
| `família código` (ou `codigo da familia`) |  | texto (3) | Código de 3 dígitos da família. | 001 |
| `família` (ou `familia`) |  | texto (até 80) | Nome da família. | Barracas |
| `divisão` (ou `divisao`, `local`) | sim | texto (até 400) | Caminho da divisão. | Almoxarifado › Barracas |
| `condição` (ou `condicao`, `estado`) |  | `novo`, `bom`, `regular`, `ruim`, `em manutenção`, `inservível` | Condição da peça. | bom |
| `descrição` (ou `descricao`) |  | texto (até 500) | O que identifica a peça. | Azul, sobreteto remendado |
| `valor` (ou `valor unitario`) |  | valor 1.234,56 | Valor da peça. | 450,00 |
| `observação` (ou `observacao`, `obs`) |  | texto (até 500) | Observação. |  |

Exemplo:

```csv
etiqueta;código antigo;material;família código;família;divisão;condição;descrição;valor;observação
GEAS-001-0001;B1;Barraca iglu 4 pessoas;001;Barracas;Almoxarifado › Barracas;bom;Azul, sobreteto remendado;450,00;Conferida em 10/01/2026
```

Situações aceitas nas células de `controle.csv` (e como valor inicial em `itens-controle.csv`):

| Na célula | Situação |
|---|---|
| `ok` | ok |
| `pendente`, `nao`, `não` | pendente |
| `desatualizado`, `desat`, `desat.`, `antiga`, `antigo` | desatualizado |
| `a verificar`, `ver`, `tem?`, `verificar` | a verificar |
| `convidado`, `conv`, `conv.` | convidado |
| `n/a`, `xxx`, `nao se aplica`, `na` | nao se aplica |
| `a remover` | a remover |
| `removido` | removido |

<!-- contrato:fim -->
