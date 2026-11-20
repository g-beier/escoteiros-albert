# Modelo e vocabulário do Associados

Termos usados na interface, no código e na documentação. Atualizado em 2026-11-19, com a primeira entrega na branch
`feat/associados-base` (migrations 040 e 041). Tabelas marcadas com *(proposto)* ainda não existem. Fases e o que
falta em `plano.md`.

O módulo **Associados** (`/associados`) é o dono do cadastro de pessoas do grupo, que antes estava em planilhas:

| Fonte | O que tem | Vira |
|---|---|---|
| Doc 10 – Lista simples de efetivo | Adultos e jovens por seção, com contagem; jovens com pais, responsáveis e familiares (`*` = outro parentesco; "Ver X" = irmão já listado) | Associados por ramo; responsáveis compartilhados entre irmãos |
| Doc 13 – Controle de idade dos jovens | Nascimento, idade, período de transição de ramo | Nascimento; idade calculada (transição: Fase 2) |
| Doc 14 – Datas de promessa | Data da promessa, por mês, de jovens e adultos | Data da promessa (aniversários: Fase 2) |
| Doc 22 – Controle de fluxo de dados pessoais | Por pessoa × coluna: onde o dado está e em que situação, com colunas agrupadas por diretoria; abas Escotistas, Dirigentes, Jovens e seus familiares, Integrações | Itens de controle, situações e a matriz `/associados/controle` |

O dado pessoal completo (documentos, CPF, endereço, telefone, e-mail, saúde) fica **só no Paxtu** (sistema da UEB). O
app guarda nomes, datas, vínculos e o controle de onde cada dado está, nunca o dado em si. O Paxtu exporta mal; a
importação dele fica para depois.

## Termos

| Termo | O que é | No banco |
|---|---|---|
| **Associado** | Pessoa registrada no grupo: jovem (Lobinho, Escoteiro, Sênior, Pioneiro) ou adulto. É a mesma linha que o Financeiro usa em mensalidades, isenções, rateios e devedores; o cadastro é feito aqui, e o Financeiro só lê. | `associates` (+ `birth_date`, `promise_date`, `joined_on`, `notes`); visão `associate_profile_rows` |
| **Para revisar** | Cadastro feito pelo registro rápido (`/rapido/associado`): o associado já existe, mas fica marcado até a Secretaria conferir e marcar como revisado (`/associados?revisao=para_revisar`). | `associates.review_status`, `associates_create_quick`, `associates_review` (049) |
| **Jovem** / **Adulto** | Tipo do associado, dado pelo ramo (`adulto` = adulto). A lista divide os associados só por ramo; os adultos se subdividem por **função**. | `associates.branch` |
| **Seção** / **Equipe** | Continuam existindo (o Financeiro filtra mensalidades por seção) e se configuram aqui, mas a lista não agrupa por elas. | `sections`, `patrols` |
| **Nascimento**, **Promessa**, **Entrada** | Datas do cadastro. Nenhuma pode ser futura; promessa e entrada não podem ser antes do nascimento. A promessa "formal" de adulto (feita em outro grupo) fica sem data. | `associates.birth_date`, `promise_date`, `joined_on` |
| **Período** / **Desligamento** / **Reingresso** | Entradas e saídas com data. `active` é derivado da última movimentação (trigger), seja ela lançada aqui, pela grade de mensalidades ou pela importação CSV. | `associate_movements` (de 022) |
| **Passagem** | Mudança de ramo, seção ou equipe com data, inclusive pioneiro → adulto (zera seção e equipe; promessa e tempo de atividade mantidos). Não vale para desligado nem quando nada muda. | `associate_moves` |
| **Efetivo** | Associados ativos hoje, contados por ramo e, nos adultos, por função. Calculado. | lista `/associados` |
| **Idade** | Anos completos, calculada do nascimento. | calculado |
| **Faixa do ramo** / **Transição** | Idades do POR (Lobinho 6½–10, Escoteiro 10–14, Sênior 14–18, Pioneiro 18–22) e janelas de transição (10–11, 14–15; aviso a partir dos 17; pioneiro aos 22 vira adulto ou sai). | *(proposto, Fase 2)* `branch_age_ranges` |
| **Função** | O que o adulto faz: **escotista** ou **dirigente**, com cargo opcional (ex.: chefe de seção, presidente), início e fim. Pode ter as duas ao mesmo tempo. Só adulto ativo recebe função; o desligamento não encerra funções. Na lista, adultos ficam em Escotistas, Dirigentes (quem tem as duas aparece nas duas) ou Sem função. | `associate_functions`, visão `associate_function_rows` |
| **Responsável** | Pai, mãe ou outro familiar de um jovem (ex.: irmã que acompanha o grupo), que não é necessariamente associado. Só o nome: contatos ficam no Paxtu. Irmãos compartilham o mesmo cadastro. Se também é associado, aponta para ele (`associate_id`). | `relatives` |
| **Vínculo** | Jovem × responsável, com **parentesco** (mãe, pai, outro + descrição obrigatória), **responsável legal** e **responsável financeiro**. Só jovem tem responsável. Desvincular apaga o responsável só se ele ficar sem jovem e com as situações ainda no valor inicial. | `relative_links`, visão `relative_link_rows` (com `sibling_count`) |
| **Família** | Associados ligados pelos mesmos responsáveis (irmãos). Hoje aparece como "compartilhado com N irmão(s)"; o uso em cobrança é da Fase 7. | calculado |
| **Diretoria** | Área dona de um conjunto de itens: **Métodos Educativos**, **Administrativa**, **Financeira**, **Comunicação** (nesta ordem na matriz). Fixas. | enum `directorate` |
| **Público** | A quem um item se aplica: **Jovem** e **Adulto** (pelo ramo, independente de função) e **Responsável**. A matriz tem abas Jovens (jovens com os responsáveis abaixo) e Adultos. | enum `control_audience` |
| **Item de controle** | Uma coluna do Doc 22: **documento**, **sistema**, **canal** ou **etapa**, de uma diretoria, com posição (arrastar), validade em meses (opcional), **remover no desligamento**, e por público: se se aplica e o **valor inicial**. Mostra na célula a **situação**, um **ano** (ex.: Ano-base do registro) ou uma **data** (ex.: Validade do registro). Itens se desativam, nunca se apagam. | `control_items` (+ `value_kind`), `control_item_audiences` (`initial_status`) |
| **Valor inicial** | Situação gravada ao cadastrar um associado (tela ou importação) ou um responsável, para cada item ativo do público, com a data do dia. Mudar o valor inicial não altera o que já foi gravado. Responsável que já é associado ativo não ganha valor inicial. | `control_statuses_init` |
| **Situação** | Estado de um item para uma pessoa: **ok**, **pendente** (planilha: NÃO), **desatualizado** (DESAT./ANTIGA), **a verificar** (VER, TEM?), **convidado** (CONV.), **não se aplica** (XXX, selo N/A), **a remover** e **removido** (DESAT. de canal). Com data, validade, ano (itens de ano) e observação. Efetiva: ok vencido (validade passada ou ano anterior ao atual) vira desatualizado. Sem linha = **sem registro** (conta como pendência). | `control_statuses` (de associado **ou** de responsável), visão `control_status_rows` |
| **Pendência** | Sem registro, pendente, desatualizado, a verificar ou a remover, num item que se aplica. "Só pendências" filtra a matriz; o bloco do jovem conta também os responsáveis dele. | calculado |
| **A remover** | Aberto por toda saída que deixa o associado inativo, nos itens removíveis com situação ok/desatualizado/a verificar/convidado. Vale também para os responsáveis do jovem que não estejam ligados a outro jovem ativo nem sejam associados ativos. A diretoria fecha como removido. | trigger em `associate_movements` |
| **Registro (UEB)** | Número no Paxtu, ano-base e validade. Hoje: os itens Ano-base e Validade do registro, preenchidos à mão. Depois: calculados dos rateios (Fase 6). | *(proposto)* `associate_registrations` |
| **Gestão**, **ATV**, **PPF** | Mandato da diretoria; acordo de trabalho voluntário (experiência 1–4 meses, até o fim da gestão ou prazo); plano pessoal de formação (revisão 1–2×/ano e ao mudar a função). Hoje ATV e PPF são itens de controle comuns (PPF com validade de 12 meses). | *(proposto, Fase 4)* `board_terms` |

## Papéis

Administrador do grupo vale em todos os módulos. Papel por módulo em `memberships.associates_role`:

| Papel | Pode |
|---|---|
| **Administrador** (do grupo) | Tudo, mais usuários. |
| **Secretaria** (`manager`) | Cadastra e edita associados, passagens, funções, responsáveis, seções, itens e todas as situações. |
| **Tesouraria** (papel do Financeiro) | O mesmo que a Secretaria, durante a transição (`can_manage_associates` = secretaria ou `can_edit_group`). |
| **Consulta** (`viewer`) | Vê tudo, sem editar. |
| **Diretoria**, **Chefe** | *(proposto)* Diretoria edita só as colunas das suas diretorias (`memberships.directorates`); Chefe vê a sua seção. |

LGPD: o app não guarda documentos, contatos nem saúde; o que tem de pessoal são nomes, datas de nascimento (de menores) e
vínculos familiares. Consequência: o app não emite recibo nem cobrança com dados do responsável.

## Integrações com o Financeiro

1. **Cadastro único** (feito): associados, seções e importação CSV saíram do Financeiro;
   `/financeiro/configuracoes/associados` redireciona para `/associados`.
2. **Períodos → Mensalidades** (feito em parte): `active` vem das movimentações; a grade já não cobra meses fora do grupo.
3. **Taxa de registro** *(Fase 6)*: rateio na rubrica de registro com o associado = pago no ano-base; na rubrica de
   repasse = repassado à UEB; validade sugerida (12 meses) e conferida à mão. Sem valor previsto nem desconto (Paxtu).
4. **Responsável financeiro** *(Fase 7)*: mostrar em mensalidades e devedores, agrupar irmãos, sugerir rateio.
5. **Desligamento** *(Fase 7)*: avisar de mensalidade em aberto, dívida ou registro pendente.

## Fora do escopo por enquanto

- Importação do Paxtu; dados pessoais; recibos e cobrança com dados do responsável; progressão e especialidades;
  eventos e inscrições (candidato ao módulo Ações).
