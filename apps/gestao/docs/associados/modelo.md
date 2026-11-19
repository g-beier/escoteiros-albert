# Modelo e vocabulário do Associados

Rascunho de 2026-11-19, antes da implementação. Termos usados na interface, no código e na documentação. Tabelas marcadas com *(proposto)* ainda não existem. Plano de histórias e fases em `plano.md`.

O módulo **Associados** (`/associados`) passa a ser o dono do cadastro de pessoas do grupo, que hoje está espalhado em planilhas:

| Fonte | O que tem | Vira |
|---|---|---|
| Doc 10 – Lista simples de efetivo | Adultos e jovens por seção, com contagem; jovens com pais, responsáveis e familiares (`*` = outro parentesco; "Ver X" = irmão já listado) | Associados, seção/equipe, familiares, efetivo calculado |
| Doc 13 – Controle de idade dos jovens | Nascimento, idade, período de transição de ramo | Nascimento; idade e transição calculadas |
| Doc 14 – Datas de promessa | Data da promessa, por mês, de jovens e adultos | Data da promessa; aniversários calculados |
| Doc 22 – Controle de fluxo de dados pessoais | Checklist pessoa × onde o dado está, por diretoria (Escotistas, Dirigentes, Jovens e familiares, Integrações) | Itens de controle e situações |

O dado pessoal completo (documentos, CPF, endereço, telefone, e-mail, saúde) fica **só no Paxtu** (sistema da UEB), e continua lá: o app guarda nomes, datas, vínculos e o controle de onde cada dado está, nunca o dado em si. O Paxtu exporta, mas mal; a importação fica para depois.

## Termos

| Termo | O que é | No banco |
|---|---|---|
| **Associado** | Pessoa registrada no grupo: jovem (Lobinho, Escoteiro, Sênior, Pioneiro) ou adulto. É a mesma linha que o Financeiro já usa em mensalidades, isenções, rateios e devedores; o cadastro passa a ser feito aqui, e o Financeiro só lê. | `associates` (ampliar) |
| **Jovem** / **Adulto** | Tipo do associado, dado pelo ramo (`adulto` = adulto). Jovem fica numa seção (e opcionalmente numa equipe); adulto não tem seção, e sim **funções**. | `associates.branch` |
| **Seção** / **Equipe** | Como já existem no Financeiro (`sections`, `patrols`); a configuração muda para cá. | `sections`, `patrols` |
| **Nascimento** | Data de nascimento. Base da idade, da transição de ramo e dos aniversários. | `associates.birth_date` *(proposto)* |
| **Promessa** | Data da promessa escoteira (jovem) ou da promessa de adulto. Base do aniversário de promessa. Adulto pode ter a promessa "formal" (feita em outro grupo, sem data conhecida). | `associates.promise_date` *(proposto)* |
| **Entrada** / **Desligamento** | Data em que entrou no grupo e em que saiu. Tempo de atividade = entrada até hoje (ou até o desligamento). Associado desligado sai do efetivo, das mensalidades seguintes e abre as pendências de remoção (ver **Itens de controle**). Reingresso abre um novo período. | `associate_periods` *(proposto)*; `associates.active` passa a ser calculado |
| **Efetivo** | Associados ativos numa data, por seção (jovens) e por função (adultos), com contagem. Substitui o Doc 10. Calculado, nunca digitado. | visão *(proposto)* |
| **Registro (UEB)** | Registro anual na União dos Escoteiros do Brasil: número no Paxtu, **ano-base** e **validade** (varia por pessoa, conforme o mês do pagamento). Base da taxa de registro. | `associate_registrations` *(proposto)*: um por associado e ano-base |
| **Idade** | Anos e meses na data de hoje, calculada do nascimento. | calculado |
| **Faixa do ramo** | Idade de cada ramo, pelo POR: **Lobinho** de 6 anos e meio a 10; **Escoteiro** de 10 a 14; **Sênior** de 14 a 18; **Pioneiro** de 18 até completar 22. Configurável (idade de passagem e duração da janela, em meses), com estes valores de partida. | `branch_age_ranges` *(proposto)* |
| **Transição** | Janela em que o jovem pode estar em qualquer dos dois ramos: Lobinho → Escoteiro dos 10 aos 11 anos; Escoteiro → Sênior dos 14 aos 15. Sênior → Pioneiro não tem janela: a passagem é no aniversário de 18 anos (o Doc 13 mostra 17–18 como aviso antecipado; o app avisa a partir dos 17). Pioneiro sai do ramo ao completar 22 (desligamento ou passagem a adulto). O app avisa quem está na janela, quem está perto da passagem sem janela e quem passou do prazo. | calculado |
| **Familiar** | Pai, mãe, responsável ou outro parente de um jovem, que não é necessariamente associado. Só o nome: contatos ficam no Paxtu (os chefes de seção podem consultá-los lá). Se o familiar também é associado (ex.: mãe escotista), aponta para o associado em vez de repetir o cadastro. | `relatives` *(proposto)*, `relatives.associate_id` opcional |
| **Vínculo familiar** | Jovem × familiar, com **parentesco** (pai, mãe, outro + descrição: tio, avó, padrasto…), se é **responsável legal** e se é **responsável financeiro**. Irmãos compartilham os mesmos familiares. | `relative_links` *(proposto)* |
| **Família** | Conjunto de associados ligados pelos mesmos familiares, incluindo o familiar que também é associado (mãe escotista e dois filhos = três membros). Calculada (componentes ligados), nunca cadastrada. Usada para irmãos, cobrança e contagem. (O desconto de registro por família considera também os responsáveis, mas é contado no Paxtu, não aqui.) | calculado |
| **Responsável financeiro** | Familiar (ou o próprio associado adulto) que paga. Pode haver mais de um por jovem; um é o principal. Base das integrações com mensalidades, taxa de registro e devedores. | `relative_links.financial` *(proposto)* |
| **Função** | O que o adulto faz no grupo, com início e fim: **escotista** (de uma seção, com cargo: chefe de seção, assistente) ou **dirigente** (cargo na diretoria: presidente, diretor de métodos educativos…). Um adulto pode ter várias funções ao mesmo tempo, inclusive escotista e dirigente. Jovens não têm função (regra do grupo: pioneiro não é escotista). | `associate_functions` *(proposto)* |
| **Gestão** | Mandato da diretoria, normalmente de dois anos (ex.: 2025–2027), com início e fim. Base da validade do ATV "até o fim da gestão" e dos cargos de dirigente. | `board_terms` *(proposto)* |
| **ATV** | Acordo de Trabalho Voluntário do adulto. Validade de três tipos: **experiência** (1 a 4 meses), **até o fim da gestão** ou **prazo definido** (data informada). O app avisa quem está vencendo ou sem ATV válido. | documento (ver **Itens de controle**) |
| **PPF** | Plano Pessoal de Formação do adulto. Revisto uma ou duas vezes por ano e sempre que a função muda: mudar a função marca o PPF como "a revisar". | documento |
| **Diretoria** | Área do grupo responsável por um conjunto de controles: **Métodos Educativos**, **Administrativa**, **Financeira** e **Comunicação**, as quatro separadas (no Doc 22 a aba de jovens junta Administrativa e Financeira; na carga, cada item vai para a sua). Cada item de controle tem uma diretoria dona. | `directorates` *(proposto, fixo)* |
| **Item de controle** | Coisa que se acompanha por pessoa, configurável pela diretoria dona: um **documento** (ficha de associação, ficha médica, ficha de aptidão, termo de consentimento, autorização de viagem, certificado de nomeação, ATV, PPF, curso de brigadista), um **sistema** onde o dado foi cadastrado (Paxtu: dados, login, seções/equipes; Google Drive; calendário) ou um **canal** (e-mail do GEAS, listas, Instagram, WhatsApp, site), ou uma **etapa de entrada** (integração, início do estágio, promessa de adulto, palestra Vamos Falar de Escotismo). Diz a quem se aplica (jovem, escotista, dirigente, familiar), se tem validade e como ela é calculada (ficha médica: 1 ano; curso de brigadista: 2 anos; ficha de aptidão e termo de consentimento: não vencem; ATV e PPF: regras próprias, acima), e se precisa ser **removido no desligamento**. Os canais mudam com o tempo (o Twitter, por exemplo): itens se desativam, nunca se apagam. | `control_items` *(proposto)* |
| **Situação** | Estado de um item para uma pessoa: **ok**, **pendente** (planilha: NÃO), **desatualizado** (ANTIGA), **a verificar** (VER, TEM?), **convidado** (CONV.), **não se aplica** (XXX), **a remover** (aberto pelo desligamento) e **removido** (DESAT.). Com data, validade (quando o item tem) e observação ("sem foto", "não necessário à função"). Vencida a validade, o ok vira desatualizado no cálculo. | `control_statuses` *(proposto)* |
| **Pendência** | Situação que pede ação: pendente, desatualizado, a verificar, a remover, validade vencendo. Cada diretoria vê as suas. | calculado |
| **Taxa de registro** | Valor pago à UEB pelo registro anual. Entra e sai do caixa do grupo, **por associado**: o recebimento é um rateio na **rubrica de registro** com o associado, e o repasse à UEB, um rateio na **rubrica de repasse** com o mesmo associado. As duas rubricas são configuráveis, como a de mensalidades. Descontos (percentual a partir do terceiro membro da família) e isenções são contados no Paxtu: o app não calcula valor previsto nem desconto, só olha se houve o rateio. | `registration_settings` *(proposto)* |
| **Situação do registro** | Por associado e ano-base, calculada dos rateios: **pago** (há rateio na rubrica de registro), **repassado** (há rateio na rubrica de repasse) ou **sem registro**. Ao aparecer o pagamento, a validade fica **a verificar**, com uma sugestão (12 meses depois do pagamento); alguém confere no Paxtu e confirma ou corrige. | `associate_registrations` (validade confirmada) + cálculo |
| **Passagem** | Mudança de seção ou de ramo, com data: Lobinho → Escoteiro etc., e Pioneiro → adulto. Ao completar 22, o pioneiro **pode** virar adulto (mesmo associado, promessa e tempo de atividade mantidos, período contínuo) ou ser desligado; o app avisa e a secretaria escolhe. O histórico de passagens mostra quando cada um passou e alimenta o aviso de transição. | `associate_moves` *(proposto)* |

## Papéis

Segue o padrão do Inventário: administrador do grupo vale em todos os módulos; os demais papéis são por módulo (`memberships.associates_role` *(proposto)*). Além do papel, cada usuário pode pertencer a uma ou mais **diretorias** (`memberships.directorates` *(proposto)*), que dizem quais itens de controle ele edita.

| Papel no Associados | Pode |
|---|---|
| **Administrador** (do grupo) | Tudo, mais usuários e configurações. |
| **Secretaria** (gestor) | Cadastra e edita associados, familiares, funções, registros e gestões; edita todos os itens de controle; configura itens, faixas de ramo e seções. |
| **Diretoria** | Vê o cadastro básico; edita as situações dos itens das suas diretorias. |
| **Chefe** | Vê os jovens (cadastro básico, datas, familiares) e as pendências da sua seção. Não edita. |
| **Consulta** | Vê nomes, seções, funções e datas (efetivo e aniversários). |

LGPD: como o app não guarda documentos, contatos nem saúde, o que ele tem de pessoal são nomes, datas de nascimento (de menores) e vínculos familiares; mesmo assim, familiares e situações só para quem precisa. Consequência: o app não emite recibo nem cobrança com dados do responsável (CPF, e-mail); a cobrança continua fora dele.

## Integrações com o Financeiro

1. **Cadastro único**: `associates` é editado aqui; o Financeiro deixa de ter tela própria de associados e seções (`/financeiro/configuracoes/associados` passa a apontar para `/associados`).
2. **Efetivo → Mensalidades**: a grade de mensalidades do ano mostra quem esteve ativo no ano (pelos períodos), sem ligar e desligar à mão. Meses depois do desligamento não são cobrados.
3. **Taxa de registro**: rateio na rubrica de registro com o associado = registro pago no ano-base; rateio na rubrica de repasse com o associado = repassado à UEB. A lista do ano mostra quem pagou, quem falta repassar e quem não tem registro, e a validade sugerida fica a verificar até alguém confirmar. Sem valor previsto nem cálculo de desconto (fica no Paxtu).
4. **Responsável financeiro**: em mensalidades e devedores, mostrar o responsável financeiro e agrupar irmãos. Um lançamento de um responsável pagando dois filhos sugere o rateio entre os associados da família.
5. **Desligamento**: avisa se há mensalidade em aberto, dívida ou registro pendente antes de concluir.

## Fora do escopo por enquanto

- **Importação do Paxtu**: possível depois, se a exportação for usável.
- **Dados pessoais** (contatos, documentos, endereço, saúde): ficam no Paxtu; o app só controla se existem e estão em dia.
- **Recibos e cobrança** com dados do responsável.
- **Progressão e especialidades** dos jovens.
- **Eventos e inscrições** (acampamentos, cobranças por evento): candidato a módulo próprio ou ao módulo Ações.

## Perguntas em aberto

Respondidas em 2026-11-19: dados pessoais só no Paxtu; faixas do POR; validade das fichas; diretorias separadas; contatos para os chefes ficam no Paxtu; registro pelo rateio com o associado, sem controle de desconto; validade sugerida e conferida; repasse por associado; pioneiro pode virar adulto.

Nenhuma pendente que bloqueie as Fases 0 e 1.
