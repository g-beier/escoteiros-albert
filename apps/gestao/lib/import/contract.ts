/**
 * Contrato dos CSVs de importação: fonte única para a leitura (`lib/import/read.ts`), os modelos para baixar,
 * a exportação e as tabelas de `docs/importacao.md` (geradas por `contractMarkdown`, conferidas por teste).
 *
 * Mudar uma coluna aqui muda o contrato: atualize o documento (`npm run import:doc`) e os testes.
 */

export type Choice<T extends string = string> = { value: T; label: string; aliases?: readonly string[] };

export type ColumnType =
  | { kind: "texto"; max: number; min?: number }
  | { kind: "id" }
  | { kind: "data" }
  | { kind: "mes_ou_data" }
  | { kind: "sim_nao" }
  | { kind: "inteiro"; min: number; max: number }
  | { kind: "dinheiro" }
  | { kind: "lista"; choices: readonly Choice[] }
  | { kind: "situacao_controle" };

export type Column = {
  key: string;
  /** Nome da coluna no cabeçalho (sem diferenciar acento nem maiúsculas). */
  header: string;
  aliases?: readonly string[];
  type: ColumnType;
  /** `sempre`: toda linha; `criacao`: só para criar; texto: quando (ex.: "período, exclusão"). */
  required?: "sempre" | "criacao" | string;
  help: string;
  example: string;
};

export type FileKind = "secoes" | "itens-controle" | "pessoas" | "funcoes" | "responsaveis" | "controle" | "vida-escoteira" | "inventario-lotes" | "inventario-pecas" | "lancamentos";

export type Module = "associados" | "inventario" | "financeiro";

/** Nome do módulo nas mensagens ("só editores do Financeiro importam…"). */
export const MODULE_NAMES: Record<Module, string> = { associados: "Associados", inventario: "Inventário", financeiro: "Financeiro" };

export type FileSpec = {
  kind: FileKind;
  file: string;
  title: string;
  module: Module;
  /** Uma linha por… */
  row: string;
  /** Como cada linha é identificada (e o que a reimportação faz). */
  key: string;
  reimport: string;
  columns: readonly Column[];
  /** Colunas que não são fixas (ex.: uma por item de controle). */
  dynamic?: { pattern: string; help: string; example: string };
  /** Exemplo completo (nomes fictícios), na ordem de `columns` + dinâmicas. */
  example: { header: readonly string[]; rows: readonly (readonly string[])[] };
  notes?: readonly string[];
};

// Listas -------------------------------------------------------------------------------------------------------------

export const BRANCH_CHOICES: readonly Choice[] = [
  { value: "filhote", label: "filhote", aliases: ["filhotes"] },
  { value: "lobinho", label: "lobinho", aliases: ["lobinhos", "lobinha", "lobinhas", "alcateia"] },
  { value: "escoteiro", label: "escoteiro", aliases: ["escoteiros", "escoteira", "escoteiras", "tropa escoteira"] },
  { value: "senior", label: "sênior", aliases: ["seniores", "guia", "guias", "tropa senior"] },
  { value: "pioneiro", label: "pioneiro", aliases: ["pioneiros", "pioneira", "pioneiras", "cla", "cla pioneiro"] },
  { value: "adulto", label: "adulto", aliases: ["adultos", "escotista", "escotistas", "dirigente", "dirigentes"] },
];

export const SITUATION_CHOICES: readonly Choice[] = [
  { value: "ativo", label: "ativo", aliases: ["ativa", "a", "sim", "s"] },
  { value: "desligado", label: "desligado", aliases: ["desligada", "inativo", "inativa", "i", "nao", "n"] },
];

export const REGISTRATION_CHOICES: readonly Choice[] = [
  { value: "provisorio", label: "provisório", aliases: ["p"] },
  { value: "definitivo", label: "definitivo", aliases: ["d"] },
];

export const FUNCTION_CHOICES: readonly Choice[] = [
  { value: "escotista", label: "escotista" },
  { value: "dirigente", label: "dirigente", aliases: ["diretoria"] },
  { value: "honorifico", label: "honorífico", aliases: ["honoraria", "honorario"] },
  { value: "colaborador", label: "colaborador", aliases: ["colaboradora"] },
  { value: "contribuinte", label: "contribuinte" },
  { value: "comissao_fiscal", label: "comissão fiscal", aliases: ["conselho fiscal", "fiscal"] },
];

export const KINSHIP_CHOICES: readonly Choice[] = [
  { value: "mae", label: "mãe" },
  { value: "pai", label: "pai" },
  { value: "outro", label: "outro", aliases: ["outra", "*"] },
];

export const AUDIENCE_CHOICES: readonly Choice[] = [
  { value: "jovem", label: "jovem", aliases: ["jovens"] },
  { value: "adulto", label: "adulto", aliases: ["adultos", "escotista", "dirigente"] },
  { value: "responsavel", label: "responsável", aliases: ["responsaveis", "familiar", "familiares"] },
];

export const DIRECTORATE_CHOICES: readonly Choice[] = [
  { value: "metodos_educativos", label: "métodos educativos", aliases: ["metodos", "me"] },
  { value: "administrativa", label: "administrativa", aliases: ["adm", "administrativo"] },
  { value: "financeira", label: "financeira", aliases: ["financeiro", "fin"] },
  { value: "comunicacao", label: "comunicação", aliases: ["com"] },
];

export const ITEM_KIND_CHOICES: readonly Choice[] = [
  { value: "documento", label: "documento" },
  { value: "sistema", label: "sistema" },
  { value: "canal", label: "canal" },
  { value: "etapa", label: "etapa" },
];

export const VALUE_KIND_CHOICES: readonly Choice[] = [
  { value: "situacao", label: "situação" },
  { value: "ano", label: "ano" },
  { value: "data", label: "data" },
];

/** Situações do controle de dados, com os códigos do Doc 22. */
export const CONTROL_STATUS_CHOICES: readonly Choice[] = [
  { value: "ok", label: "ok" },
  { value: "pendente", label: "pendente", aliases: ["nao", "não"] },
  { value: "desatualizado", label: "desatualizado", aliases: ["desat", "desat.", "antiga", "antigo"] },
  { value: "a_verificar", label: "a verificar", aliases: ["ver", "tem?", "verificar"] },
  { value: "convidado", label: "convidado", aliases: ["conv", "conv."] },
  { value: "nao_se_aplica", label: "n/a", aliases: ["xxx", "nao se aplica", "na"] },
  { value: "a_remover", label: "a remover" },
  { value: "removido", label: "removido" },
];

/** Valor da coluna de público em `itens-controle.csv`: não se aplica, aplica sem valor inicial, ou o valor inicial. */
export const AUDIENCE_INITIAL_CHOICES: readonly Choice[] = [
  { value: "nao", label: "não", aliases: ["n", "-"] },
  { value: "sim", label: "sim", aliases: ["s", "x", "sem valor inicial"] },
  ...CONTROL_STATUS_CHOICES.filter((choice) => choice.value !== "removido" && choice.value !== "a_remover"),
];

export const LIFE_KIND_CHOICES: readonly Choice[] = [
  { value: "periodo", label: "período" },
  { value: "exclusao", label: "exclusão", aliases: ["nao contabilizado", "periodo nao contabilizado"] },
  { value: "evento", label: "evento" },
  { value: "estrela", label: "estrela" },
  { value: "anotacao", label: "anotação", aliases: ["nota", "observacao"] },
];

export const EXCLUSION_CHOICES: readonly Choice[] = [
  { value: "frequencia", label: "frequência", aliases: ["frequencia baixa"] },
  { value: "licenca", label: "licença" },
  { value: "suspensao", label: "suspensão" },
  { value: "outro", label: "outro" },
];

export const CONDITION_CHOICES: readonly Choice[] = [
  { value: "novo", label: "novo", aliases: ["nova", "novos", "novas"] },
  { value: "bom", label: "bom", aliases: ["boa", "bons", "boas", "ok"] },
  { value: "regular", label: "regular", aliases: ["usado", "usada"] },
  { value: "ruim", label: "ruim", aliases: ["ruins"] },
  { value: "manutencao", label: "em manutenção", aliases: ["manutencao", "conserto"] },
  { value: "inservivel", label: "inservível", aliases: ["quebrado", "quebrada"] },
];

// Colunas comuns -----------------------------------------------------------------------------------------------------

const text = (max: number, min?: number): ColumnType => ({ kind: "texto", max, ...(min ? { min } : {}) });
const list = (choices: readonly Choice[]): ColumnType => ({ kind: "lista", choices });

const personColumns = (role = "pessoa"): Column[] => [
  { key: "personId", header: `${role} id`, aliases: role === "pessoa" ? ["id", "pessoa_id"] : [`${role}_id`], type: { kind: "id" }, help: `Id do associado no app (vem da exportação). Com ele, o nome não precisa bater.`, example: "" },
  { key: "person", header: role, aliases: role === "pessoa" ? ["nome", "associado"] : [`nome do ${role}`], type: text(120, 2), required: "sempre", help: `Nome do associado, como em pessoas.csv.`, example: role === "pessoa" ? "Ana Souza" : "Bruno Lima" },
  { key: "personBirth", header: role === "pessoa" ? "nascimento" : `nascimento do ${role}`, type: { kind: "data" }, help: "Desempata nomes iguais.", example: role === "pessoa" ? "14/05/2015" : "02/09/2012" },
];

// Arquivos -----------------------------------------------------------------------------------------------------------

export const FILES: readonly FileSpec[] = [
  {
    kind: "secoes",
    file: "secoes.csv",
    title: "Seções e patrulhas",
    module: "associados",
    row: "seção (patrulha vazia) ou patrulha de uma seção",
    key: "ramo + seção (+ patrulha)",
    reimport: "Cria o que falta; `ativa` muda a situação. Nunca apaga.",
    columns: [
      { key: "branch", header: "ramo", type: list(BRANCH_CHOICES), required: "sempre", help: "Ramo da seção.", example: "escoteiro" },
      { key: "section", header: "seção", aliases: ["secao"], type: text(60, 2), required: "sempre", help: "Nome da seção.", example: "Tropa Tupã" },
      { key: "patrol", header: "patrulha", aliases: ["equipe", "matilha"], type: text(60, 2), help: "Nome da patrulha (vazio = a linha é da seção).", example: "Patrulha Lobo" },
      { key: "active", header: "ativa", type: { kind: "sim_nao" }, help: "Padrão: sim.", example: "sim" },
    ],
    example: {
      header: ["ramo", "seção", "patrulha", "ativa"],
      rows: [["lobinho", "Alcateia Seeonee", "", "sim"], ["escoteiro", "Tropa Tupã", "", ""], ["escoteiro", "Tropa Tupã", "Patrulha Lobo", ""], ["escoteiro", "Tropa Tupã", "Patrulha Águia", ""]],
    },
    notes: ["Opcional: seções e patrulhas citadas em `pessoas.csv` e `funcoes.csv` também são criadas. Este arquivo serve para cadastrar as vazias ou desativar."],
  },
  {
    kind: "itens-controle",
    file: "itens-controle.csv",
    title: "Itens de controle (colunas do Doc 22)",
    module: "associados",
    row: "item de controle",
    key: "nome do item",
    reimport: "Atualiza os campos preenchidos. Itens novos vão para o fim da sua diretoria.",
    columns: [
      { key: "name", header: "item", aliases: ["nome"], type: text(80, 2), required: "sempre", help: "Nome do item; é o nome da coluna em controle.csv.", example: "Ficha de saúde" },
      { key: "directorate", header: "diretoria", type: list(DIRECTORATE_CHOICES), required: "criacao", help: "Diretoria dona do item.", example: "métodos educativos" },
      { key: "kind", header: "tipo", type: list(ITEM_KIND_CHOICES), required: "criacao", help: "O que o item controla.", example: "documento" },
      { key: "valueKind", header: "valor", type: list(VALUE_KIND_CHOICES), help: "O que a célula mostra. Padrão: situação.", example: "situação" },
      { key: "validityMonths", header: "validade meses", aliases: ["validade"], type: { kind: "inteiro", min: 1, max: 120 }, help: "Depois disso, ok vira desatualizado.", example: "12" },
      { key: "removeOnLeave", header: "remover no desligamento", type: { kind: "sim_nao" }, help: "Abre \"a remover\" quando a pessoa sai. Padrão: não.", example: "não" },
      { key: "jovem", header: "jovem", type: list(AUDIENCE_INITIAL_CHOICES), help: "Se vale para jovens: `não`, `sim` (sem valor inicial) ou a situação gravada ao cadastrar (ex.: `pendente`). Na criação, vazio = não.", example: "pendente" },
      { key: "adulto", header: "adulto", type: list(AUDIENCE_INITIAL_CHOICES), help: "Idem, para adultos.", example: "pendente" },
      { key: "responsavel", header: "responsável", aliases: ["responsavel"], type: list(AUDIENCE_INITIAL_CHOICES), help: "Idem, para responsáveis.", example: "não" },
    ],
    example: {
      header: ["item", "diretoria", "tipo", "valor", "validade meses", "remover no desligamento", "jovem", "adulto", "responsável"],
      rows: [["Ficha de saúde", "métodos educativos", "documento", "situação", "12", "não", "pendente", "pendente", "não"], ["Grupo de WhatsApp", "comunicação", "canal", "situação", "", "sim", "não", "convidado", "convidado"], ["Ano-base do registro", "administrativa", "etapa", "ano", "", "não", "sim", "sim", "não"]],
    },
    notes: ["Opcional: os 28 itens do Doc 22 já vêm cadastrados. Use para criar itens novos antes de importar `controle.csv` ou ajustar os existentes."],
  },
  {
    kind: "pessoas",
    file: "pessoas.csv",
    title: "Pessoas (associados)",
    module: "associados",
    row: "associado (jovem ou adulto)",
    key: "`id`; senão nome + nascimento; senão o nome, se for único no grupo",
    reimport: "Atualiza só as colunas preenchidas; célula vazia não apaga nada.",
    columns: [
      { key: "id", header: "id", type: { kind: "id" }, help: "Id no app (vem da exportação). Vazio = procurar pelo nome.", example: "" },
      { key: "name", header: "nome", aliases: ["pessoa", "associado", "nome completo"], type: text(120, 2), required: "sempre", help: "Nome completo.", example: "Ana Souza" },
      { key: "nickname", header: "apelido", type: text(8, 1), help: "Até 8 letras; usado nos relatórios (\"Ver Ana\").", example: "Aninha" },
      { key: "birth", header: "nascimento", type: { kind: "data" }, help: "Data de nascimento.", example: "14/05/2015" },
      { key: "branch", header: "ramo", type: list(BRANCH_CHOICES), required: "criacao", help: "Ramo atual; adultos = adulto.", example: "lobinho" },
      { key: "section", header: "seção", aliases: ["secao"], type: text(60, 2), help: "Seção do ramo (criada se não existir). Adulto: vazio.", example: "Alcateia Seeonee" },
      { key: "patrol", header: "patrulha", aliases: ["equipe", "matilha"], type: text(60, 2), help: "Patrulha da seção (criada se não existir).", example: "" },
      { key: "registration", header: "registro", type: list(REGISTRATION_CHOICES), help: "Registro na UEB. Na criação, vazio = provisório.", example: "definitivo" },
      { key: "joined", header: "entrada", type: { kind: "data" }, help: "Data de entrada no grupo.", example: "10/03/2022" },
      { key: "promise", header: "promessa", type: { kind: "data" }, help: "Data da promessa (vazia para promessa feita em outro grupo sem data).", example: "18/06/2022" },
      { key: "situation", header: "situação", aliases: ["situacao", "status"], type: list(SITUATION_CHOICES), help: "Na criação, vazio = ativo.", example: "ativo" },
      { key: "left", header: "desligado em", aliases: ["desligamento", "saida"], type: { kind: "data" }, required: "situação desligado", help: "Data do desligamento.", example: "" },
      { key: "leftReason", header: "motivo", aliases: ["motivo do desligamento"], type: text(120), help: "Motivo do desligamento.", example: "" },
      { key: "notes", header: "observação", aliases: ["observacao", "obs", "notas"], type: text(500), help: "Observação geral.", example: "" },
    ],
    example: {
      header: ["id", "nome", "apelido", "nascimento", "ramo", "seção", "patrulha", "registro", "entrada", "promessa", "situação", "desligado em", "motivo", "observação"],
      rows: [
        ["", "Ana Souza", "Aninha", "14/05/2015", "lobinho", "Alcateia Seeonee", "", "definitivo", "10/03/2022", "18/06/2022", "ativo", "", "", ""],
        ["", "Bruno Lima", "", "02/09/2012", "escoteiro", "Tropa Tupã", "Patrulha Lobo", "provisório", "05/02/2024", "", "ativo", "", "", ""],
        ["", "Carla Dias", "Carla", "21/11/1985", "adulto", "", "", "definitivo", "01/03/2019", "12/05/2019", "ativo", "", "", ""],
        ["", "Daniel Rocha", "", "30/01/2011", "escoteiro", "Tropa Tupã", "", "definitivo", "03/03/2021", "15/05/2021", "desligado", "20/12/2025", "Mudou de cidade", ""],
      ],
    },
    notes: [
      "Entrada e desligamento entram no histórico com a data do arquivo (não a data da importação).",
      "Responsáveis que não são associados não vão aqui: vão em `responsaveis.csv`.",
      "O ramo `filhote` só é aceito quando o ramo Filhote estiver ligado no app.",
    ],
  },
  {
    kind: "funcoes",
    file: "funcoes.csv",
    title: "Funções dos adultos",
    module: "associados",
    row: "função de um adulto (quem tem duas funções tem duas linhas)",
    key: "pessoa + tipo + seção + início (sem início: a função com o mesmo fim, ou a vigente)",
    reimport: "Atualiza cargo, fim e eleito da mesma função; cria as que não existem. Nunca apaga.",
    columns: [
      ...personColumns(),
      { key: "kind", header: "tipo", aliases: ["funcao"], type: list(FUNCTION_CHOICES), required: "sempre", help: "Tipo da função.", example: "escotista" },
      { key: "title", header: "cargo", type: text(80, 1), help: "Ex.: chefe de seção, assistente, diretor-presidente.", example: "Chefe de seção" },
      { key: "section", header: "seção", aliases: ["secao"], type: text(60, 2), required: "escotista", help: "Seção do escotista (obrigatória para escotista; vazia nos outros tipos).", example: "Alcateia Seeonee" },
      { key: "started", header: "início", aliases: ["inicio"], type: { kind: "data" }, help: "Início da função.", example: "01/03/2019" },
      { key: "ended", header: "fim", type: { kind: "data" }, help: "Fim (vazio = vigente).", example: "" },
      { key: "elected", header: "eleito", type: { kind: "sim_nao" }, help: "Só dirigente: membro eleito da diretoria.", example: "não" },
    ],
    example: {
      header: ["pessoa id", "pessoa", "nascimento", "tipo", "cargo", "seção", "início", "fim", "eleito"],
      rows: [["", "Carla Dias", "21/11/1985", "escotista", "Chefe de seção", "Alcateia Seeonee", "01/03/2019", "", ""], ["", "Carla Dias", "21/11/1985", "dirigente", "Diretora de métodos educativos", "", "01/01/2025", "", "sim"]],
    },
    notes: ["Só adultos (ramo adulto) têm função."],
  },
  {
    kind: "responsaveis",
    file: "responsaveis.csv",
    title: "Responsáveis dos jovens",
    module: "associados",
    row: "vínculo entre um jovem e um responsável (irmãos repetem o responsável)",
    key: "jovem + nome do responsável. O mesmo nome de responsável no grupo é a mesma pessoa (irmãos compartilham)",
    reimport: "Atualiza parentesco, legal e financeiro; cria vínculos novos. Nunca desvincula.",
    columns: [
      ...personColumns("jovem"),
      { key: "relative", header: "responsável", aliases: ["responsavel", "familiar", "nome do responsavel"], type: text(120, 2), required: "sempre", help: "Nome completo do responsável.", example: "Marta Lima" },
      { key: "kinship", header: "parentesco", type: list(KINSHIP_CHOICES), required: "sempre", help: "mãe, pai ou outro.", example: "mãe" },
      { key: "kinshipNote", header: "descrição do parentesco", aliases: ["descricao", "qual parentesco"], type: text(40, 1), required: "parentesco outro", help: "Ex.: avó, tia, irmã.", example: "" },
      { key: "legal", header: "legal", aliases: ["responsavel legal"], type: { kind: "sim_nao" }, help: "Responsável legal. Na criação, vazio = não.", example: "sim" },
      { key: "financial", header: "financeiro", aliases: ["responsavel financeiro"], type: { kind: "sim_nao" }, help: "Responsável financeiro. Na criação, vazio = não.", example: "sim" },
      { key: "relativeAssociate", header: "associado", aliases: ["e associado"], type: text(120, 2), help: "Se o responsável também é associado (adulto), o nome dele em pessoas.csv.", example: "" },
      { key: "notes", header: "observação", aliases: ["observacao", "obs"], type: text(200), help: "Observação sobre o responsável.", example: "" },
    ],
    example: {
      header: ["jovem id", "jovem", "nascimento do jovem", "responsável", "parentesco", "descrição do parentesco", "legal", "financeiro", "associado", "observação"],
      rows: [
        ["", "Bruno Lima", "02/09/2012", "Marta Lima", "mãe", "", "sim", "sim", "", ""],
        ["", "Bruno Lima", "02/09/2012", "Paulo Lima", "pai", "", "sim", "não", "", ""],
        ["", "Ana Souza", "14/05/2015", "Carla Dias", "outro", "tia", "não", "não", "Carla Dias", ""],
      ],
    },
  },
  {
    kind: "controle",
    file: "controle.csv",
    title: "Controle de dados (Doc 22)",
    module: "associados",
    row: "pessoa (jovem ou adulto) ou responsável",
    key: "pessoa (ou responsável + jovem) × item",
    reimport: "Grava cada célula preenchida; célula vazia não muda.",
    columns: [
      { key: "audience", header: "público", aliases: ["publico", "tipo"], type: list(AUDIENCE_CHOICES), required: "sempre", help: "jovem, adulto ou responsável.", example: "jovem" },
      ...personColumns(),
      { key: "youth", header: "jovem", type: text(120, 2), required: "responsável", help: "Só em linha de responsável: um jovem dele (o responsável é procurado entre os responsáveis desse jovem).", example: "" },
      { key: "youthBirth", header: "nascimento do jovem", type: { kind: "data" }, help: "Desempata jovens com o mesmo nome.", example: "" },
    ],
    dynamic: {
      pattern: "<nome do item>",
      help: "Uma coluna por item de controle, com o nome do item (Configurações › Itens, ou itens-controle.csv do mesmo envio); coluna que não é item barra o envio. Célula: situação (tabela abaixo), opcionalmente com a data em que foi conferida (`ok 10/03/2026`); item de ano: o ano (`2026`, vale ok) ou situação e ano; item de data: a validade (`31/03/2027`, vale ok) ou situação e data; texto depois de ` - ` vira observação. Vazia: não muda.",
      example: "ok - conferido no Paxtu",
    },
    example: {
      header: ["público", "pessoa id", "pessoa", "nascimento", "jovem", "nascimento do jovem", "Ficha de saúde", "Dados individuais no Paxtu", "Ano-base do registro"],
      rows: [
        ["jovem", "", "Bruno Lima", "02/09/2012", "", "", "ok", "ok - conferido em março", "2026"],
        ["responsável", "", "Marta Lima", "", "Bruno Lima", "02/09/2012", "", "pendente", ""],
        ["adulto", "", "Carla Dias", "21/11/1985", "", "", "desatualizado", "ok", "2025"],
      ],
    },
  },
  {
    kind: "vida-escoteira",
    file: "vida-escoteira.csv",
    title: "Vida escoteira (linha do tempo)",
    module: "associados",
    row: "fato da vida escoteira de uma pessoa: período, exclusão, evento, estrela ou anotação",
    key: "pessoa + tipo",
    reimport: "Para cada pessoa, os fatos dos tipos presentes no arquivo substituem os do app (ex.: linhas de período de Ana trocam todos os períodos de Ana; os eventos dela ficam).",
    columns: [
      ...personColumns(),
      { key: "kind", header: "tipo", type: list(LIFE_KIND_CHOICES), required: "sempre", help: "período, exclusão, evento, estrela ou anotação.", example: "período" },
      { key: "branch", header: "ramo", type: list(BRANCH_CHOICES), required: "período", help: "Período: ramo (adulto = escotista ou dirigente). Estrela: correção do ramo da estrela.", example: "lobinho" },
      { key: "start", header: "início", aliases: ["inicio"], type: { kind: "mes_ou_data" }, required: "período, exclusão", help: "Mês (mm/aaaa = dia 1º) ou data.", example: "03/2022" },
      { key: "end", header: "fim", type: { kind: "mes_ou_data" }, required: "exclusão", help: "Último mês (mm/aaaa, inclusive) ou último dia. Período vazio = vigente.", example: "12/2025" },
      { key: "place", header: "outro grupo", aliases: ["grupo"], type: text(80, 1), help: "Período em outro grupo: o nome dele.", example: "" },
      { key: "reason", header: "motivo", type: list(EXCLUSION_CHOICES), required: "exclusão", help: "Exclusão: frequência, licença (acima de 60 dias), suspensão ou outro.", example: "" },
      { key: "date", header: "data", type: { kind: "data" }, required: "evento", help: "Evento: data.", example: "" },
      { key: "title", header: "título", aliases: ["titulo"], type: text(80, 1), required: "evento", help: "Evento: título (ex.: Cruzeiro do Sul).", example: "" },
      { key: "description", header: "descrição", aliases: ["descricao", "texto"], type: text(1000, 1), required: "anotação; exclusão com motivo outro", help: "Evento: detalhe. Exclusão: observação. Anotação: o texto (várias linhas de anotação se juntam).", example: "" },
      { key: "star", header: "estrela", type: { kind: "inteiro", min: 1, max: 99 }, required: "estrela", help: "Número da estrela de atividade.", example: "" },
      { key: "delivered", header: "entregue em", type: { kind: "data" }, help: "Estrela: data da entrega do certificado.", example: "" },
    ],
    example: {
      header: ["pessoa id", "pessoa", "nascimento", "tipo", "ramo", "início", "fim", "outro grupo", "motivo", "data", "título", "descrição", "estrela", "entregue em"],
      rows: [
        ["", "Bruno Lima", "02/09/2012", "período", "lobinho", "02/2020", "02/2023", "Grupo Escoteiro Exemplo", "", "", "", "", "", ""],
        ["", "Bruno Lima", "02/09/2012", "período", "escoteiro", "03/2023", "", "", "", "", "", "", "", ""],
        ["", "Bruno Lima", "02/09/2012", "exclusão", "", "04/2024", "08/2024", "", "licença", "", "", "", "", ""],
        ["", "Bruno Lima", "02/09/2012", "evento", "", "", "", "", "", "10/11/2024", "Lis de Ouro", "", "", ""],
        ["", "Bruno Lima", "02/09/2012", "estrela", "", "", "", "", "", "", "", "", "1", "20/06/2021"],
        ["", "Bruno Lima", "02/09/2012", "anotação", "", "", "", "", "", "", "", "Ficha antiga cita acampamento regional em 2021.", "", ""],
      ],
    },
    notes: [
      "Períodos não se sobrepõem; na passagem, um termina no mês anterior ao início do outro.",
      "A contagem começa na promessa (pessoas.csv) e as estrelas são calculadas; a linha `estrela` só registra entrega ou correção de ramo.",
    ],
  },
  {
    kind: "inventario-lotes",
    file: "inventario-lotes.csv",
    title: "Inventário: materiais por quantidade (lotes)",
    module: "inventario",
    row: "lote: um material numa divisão, numa condição (e validade e variação)",
    key: "material + divisão + condição + validade + variação (linhas iguais somam)",
    reimport: "Substitui o inventário inteiro (divisões, famílias, materiais, lotes, peças, contagens), enquanto nada tiver sido registrado pelo app.",
    columns: [
      { key: "location", header: "divisão", aliases: ["divisao", "local"], type: text(400, 1), required: "sempre", help: "Caminho da divisão, do mais geral ao mais específico, separado por ` › ` ou ` > ` (criada se não existir).", example: "Almoxarifado › Estante 1" },
      { key: "familyCode", header: "família código", aliases: ["codigo da familia"], type: text(3, 3), help: "Código de 3 dígitos da família.", example: "002" },
      { key: "family", header: "família", aliases: ["familia"], type: text(80, 2), help: "Nome da família (criada se não existir).", example: "Cozinha" },
      { key: "material", header: "material", aliases: ["item", "nome"], type: text(120, 2), required: "sempre", help: "Nome do material; o mesmo nome em várias linhas é o mesmo material.", example: "Panela 10 L" },
      { key: "materialDescription", header: "descrição do material", type: text(500), help: "Descrição do material (a primeira preenchida vale).", example: "" },
      { key: "consumable", header: "consumível", aliases: ["consumivel"], type: { kind: "sim_nao" }, help: "Consumível (some com o uso). Padrão: não.", example: "não" },
      { key: "minimum", header: "mínimo", aliases: ["minimo", "estoque minimo"], type: { kind: "inteiro", min: 0, max: 100000 }, help: "Estoque mínimo do material.", example: "" },
      { key: "quantity", header: "quantidade", aliases: ["qtd"], type: { kind: "inteiro", min: 0, max: 1000000 }, help: "Quantidade atual. Vazia = a contagem mais recente. Zero = só registra as contagens.", example: "4" },
      { key: "condition", header: "condição", aliases: ["condicao", "estado"], type: list(CONDITION_CHOICES), help: "Vazia = não se aplica (consumível aberto etc.).", example: "bom" },
      { key: "expires", header: "validade", type: { kind: "data" }, help: "Validade do lote.", example: "" },
      { key: "unitValue", header: "valor unitário", aliases: ["valor unit", "valor"], type: { kind: "dinheiro" }, help: "Valor de uma unidade.", example: "89,90" },
      { key: "variant", header: "variação", aliases: ["variacao"], type: text(80, 1), help: "Diferencia lotes do mesmo material (ex.: modelo antigo, tamanho P).", example: "" },
      { key: "notes", header: "observação", aliases: ["observacao", "obs"], type: text(500), help: "Observação do lote.", example: "" },
    ],
    dynamic: { pattern: "contagem AAAA", help: "Uma coluna por ano de conferência (ex.: `contagem 2025`, `contagem 2026`): a quantidade contada naquele ano, no histórico do material e da divisão.", example: "4" },
    example: {
      header: ["divisão", "família código", "família", "material", "descrição do material", "consumível", "mínimo", "quantidade", "condição", "validade", "valor unitário", "variação", "observação", "contagem 2025", "contagem 2026"],
      rows: [
        ["Cozinha e despensa › Armário 1", "002", "Cozinha", "Panela 10 L", "", "não", "", "3", "bom", "", "89,90", "", "", "4", "3"],
        ["Cozinha e despensa › Armário 1", "002", "Cozinha", "Panela 10 L", "", "não", "", "1", "ruim", "", "89,90", "", "Alça solta", "1", "1"],
        ["Alcateia", "005", "Primeiros socorros", "Soro fisiológico 250 mL", "", "sim", "4", "", "", "31/08/2027", "6,50", "", "", "10", "6"],
      ],
    },
  },
  {
    kind: "inventario-pecas",
    file: "inventario-pecas.csv",
    title: "Inventário: peças etiquetadas",
    module: "inventario",
    row: "peça com etiqueta (ex.: barraca B1)",
    key: "etiqueta (ou código antigo)",
    reimport: "Substitui junto com inventario-lotes.csv, que precisa vir no mesmo envio.",
    columns: [
      { key: "tag", header: "etiqueta", type: text(20), help: "`GEAS-<família>-<número>` (ex.: GEAS-001-0001). Vazia = sem etiqueta ainda.", example: "GEAS-001-0001" },
      { key: "legacyCode", header: "código antigo", aliases: ["codigo"], type: text(30, 1), help: "Código usado antes (ex.: B1).", example: "B1" },
      { key: "material", header: "material", aliases: ["item", "nome"], type: text(120, 2), required: "sempre", help: "Material da peça (não pode ser também material de lotes).", example: "Barraca iglu 4 pessoas" },
      { key: "familyCode", header: "família código", aliases: ["codigo da familia"], type: text(3, 3), help: "Código de 3 dígitos da família.", example: "001" },
      { key: "family", header: "família", aliases: ["familia"], type: text(80, 2), help: "Nome da família.", example: "Barracas" },
      { key: "location", header: "divisão", aliases: ["divisao", "local"], type: text(400, 1), required: "sempre", help: "Caminho da divisão.", example: "Almoxarifado › Barracas" },
      { key: "condition", header: "condição", aliases: ["condicao", "estado"], type: list(CONDITION_CHOICES), help: "Condição da peça.", example: "bom" },
      { key: "description", header: "descrição", aliases: ["descricao"], type: text(500), help: "O que identifica a peça.", example: "Azul, sobreteto remendado" },
      { key: "unitValue", header: "valor", aliases: ["valor unitario"], type: { kind: "dinheiro" }, help: "Valor da peça.", example: "450,00" },
      { key: "notes", header: "observação", aliases: ["observacao", "obs"], type: text(500), help: "Observação.", example: "" },
    ],
    example: {
      header: ["etiqueta", "código antigo", "material", "família código", "família", "divisão", "condição", "descrição", "valor", "observação"],
      rows: [["GEAS-001-0001", "B1", "Barraca iglu 4 pessoas", "001", "Barracas", "Almoxarifado › Barracas", "bom", "Azul, sobreteto remendado", "450,00", "Conferida em 10/01/2026"]],
    },
  },
  {
    kind: "lancamentos",
    file: "lancamentos.csv",
    title: "Financeiro: lançamentos (só administradores do Financeiro)",
    module: "financeiro",
    row: "rateio: uma rubrica de um lançamento (o lançamento de um rateio só é uma linha)",
    key: "`id` do lançamento; sem ele, data + conta + histórico + valor total (lançamentos iguais no mesmo dia contam um a um)",
    reimport: "Cria os lançamentos que não existem; os que já existem ficam como estão. Nunca altera nem apaga.",
    columns: [
      { key: "id", header: "id", type: { kind: "id" }, help: "Id do lançamento no app (vem da exportação). Com ele, a linha é do lançamento que já existe.", example: "" },
      { key: "group", header: "lançamento", aliases: ["lancamento", "grupo"], type: text(60, 1), help: "Junta linhas num lançamento só (um rateio por linha): as linhas com o mesmo texto aqui são o mesmo lançamento, e data, conta, forma e histórico vêm da primeira. Vazio = a linha é um lançamento.", example: "" },
      { key: "date", header: "data", type: { kind: "data" }, required: "sempre", help: "Data do lançamento.", example: "10/03/2026" },
      { key: "name", header: "histórico", aliases: ["historico", "nome"], type: text(200, 2), help: "Nome do lançamento. Vazio = a descrição do rateio.", example: "Mensalidade março" },
      { key: "account", header: "conta", type: text(60, 2), required: "criacao", help: "Nome da conta (criada se não existir). Use \"A definir\" quando não souber.", example: "Mercado Pago" },
      { key: "paymentMethod", header: "forma de pagamento", aliases: ["forma pgto", "forma", "forma de pgto"], type: text(60, 2), required: "criacao", help: "Nome da forma de pagamento (criada se não existir).", example: "PIX" },
      { key: "document", header: "documento", type: text(60), help: "Número da nota ou recibo.", example: "" },
      { key: "filed", header: "pasta", aliases: ["documentos arquivados", "arquivado"], type: { kind: "sim_nao" }, help: "Documentos arquivados na pasta. Padrão: não.", example: "não" },
      { key: "amount", header: "valor", type: { kind: "dinheiro" }, required: "sempre", help: "Valor do rateio, sem sinal: entrada ou saída pelo tipo da rubrica (receita ou despesa).", example: "30,00" },
      { key: "category", header: "rubrica", type: text(200, 1), required: "sempre", help: "Código da rubrica (`1.1`, `1.1.` ou `1.1. Mensalidades`), ou o nome, se for único.", example: "1.1" },
      { key: "description", header: "descrição", aliases: ["descricao", "descrição do rateio"], type: text(200, 2), help: "Descrição do rateio. Vazio = o histórico.", example: "Mensalidade" },
      { key: "associate", header: "associado", aliases: ["nome do associado"], type: text(120, 2), help: "Associado do rateio, pelo nome. Não encontrado: o rateio fica sem associado e o nome vai para a observação do lançamento.", example: "Ana Souza" },
      { key: "notes", header: "observação", aliases: ["observacao", "obs"], type: text(500), help: "Observação do lançamento.", example: "" },
    ],
    example: {
      header: ["id", "lançamento", "data", "histórico", "conta", "forma de pagamento", "documento", "pasta", "valor", "rubrica", "descrição", "associado", "observação"],
      rows: [
        ["", "", "10/03/2026", "Mensalidade março", "Mercado Pago", "PIX", "", "não", "30,00", "1.1", "Mensalidade", "Ana Souza", ""],
        ["", "feira-1", "12/03/2026", "Compras da feira", "Caixa", "Dinheiro", "NF 123", "sim", "40,00", "2.6.2", "Legumes", "", ""],
        ["", "feira-1", "12/03/2026", "Compras da feira", "Caixa", "Dinheiro", "NF 123", "sim", "12,50", "2.6.4", "Copos", "", ""],
      ],
    },
    notes: [
      "Transferência entre contas do próprio grupo não é lançamento: não entra aqui (na conciliação, ignore a linha do extrato como transferência).",
      "Os lançamentos importados entram revisados; os rateios podem ser agrupados ou desagrupados depois no Detalhamento.",
    ],
  },
];

export const FILE_ORDER: readonly FileKind[] = FILES.map((spec) => spec.kind);

export function fileSpec(kind: FileKind): FileSpec {
  return FILES.find((spec) => spec.kind === kind)!;
}
