# Plano do Associados

Histórias e fases do módulo Associados (`/associados`). Modelo e vocabulário em `modelo.md`. Cada fase é um PR (ou poucos), entregue e usável sozinha; a ordem segue o que tira mais planilhas de uso mais cedo.

Papéis nas histórias: **secretaria** (gestor do módulo), **diretoria** (Métodos Educativos, Administrativa, Financeira, Comunicação), **chefe**, **tesouraria** (papel no Financeiro), **administrador**.

## Fase 0 — Base do módulo

Sem tela nova para o usuário final; prepara o terreno.

- Rota `/associados` com route group próprio (`app/(associados)/associados/...`), `RootHtml` com `data-app="associados"`, cor própria no tema e entrada no `AppBrand` (`current`).
- Papel `memberships.associates_role` e diretorias do usuário; guards em `lib/server/session.ts` (`associatesEditorOrError`, …); coluna nova em `/usuarios`.
- Camada `lib/server/associates/*` e domínio em `lib/associates/`.
- Migration combinada com quem trabalha no Inventário e no módulo Ações (numeração e arquivos compartilhados: `memberships`, `session.ts`, roles, `AppBrand`, `theme.css`).

Histórias:
- Como **administrador**, quero dar o papel no Associados e as diretorias a cada usuário, para controlar quem vê e edita o quê.

## Fase 1 — Cadastro e efetivo (substitui o Doc 10, aba Paxtu)

- Associado ganha nascimento, promessa, períodos (entrada/desligamento) e passagens com data; `active` passa a ser calculado.
- Telas: lista por seção (abas como no Inventário: "Todos", uma por ramo, adultos), detalhe e edição; Configurações › Seções e equipes (sai do Financeiro).
- `/financeiro/configuracoes/associados` aponta para cá; a importação CSV de associados vem junto.
- Carga de desenvolvimento a partir dos Docs 10, 13 e 14 (script local, CSV não versionado, como no Inventário).

Histórias:
- Como **secretaria**, quero cadastrar um associado com seção, nascimento, promessa e entrada, para não manter a lista de efetivo à mão.
- Como **secretaria**, quero desligar um associado com data, para que ele saia do efetivo e das mensalidades seguintes sem perder o histórico.
- Como **secretaria**, quero registrar a passagem de seção ou de ramo com data, inclusive pioneiro → adulto, mantendo promessa e tempo de atividade.
- Como **qualquer usuário**, quero ver o efetivo por seção com contagem de jovens e adultos, para responder "quantos somos" sem planilha.
- Como **tesouraria**, quero que mensalidades e devedores continuem funcionando com o cadastro novo, sem nada a refazer.

## Fase 2 — Datas (substitui os Docs 13 e 14)

- Idade, faixa do ramo, transição; aniversários de nascimento e de promessa; tempo de atividade.
- Configurações › Faixas dos ramos.
- Início do módulo (Resumo): aniversariantes do mês (nascimento e promessa), jovens em transição ou fora da faixa.
- Início geral (`/`): cartão do Associados com o que pede atenção.

Histórias:
- Como **chefe**, quero ver quem da minha seção está em período de transição, para planejar as passagens.
- Como **comunicação**, quero a lista de aniversariantes do mês (nascimento e promessa), para as publicações e lembranças.
- Como **diretoria de métodos educativos**, quero ver jovens acima da idade do ramo, para não esquecer passagens atrasadas.

## Fase 3 — Familiares e responsáveis (substitui o Doc 10, aba Familiares)

- Familiares, vínculo com parentesco, responsável legal e financeiro; família calculada (irmãos).
- Familiar que também é associado aponta para o associado.
- Carga de desenvolvimento do Doc 10 › Familiares.

Histórias:
- Como **secretaria**, quero cadastrar os familiares de um jovem uma vez só e reaproveitar para os irmãos.
- Como **tesouraria**, quero saber quem é o responsável financeiro de cada jovem, para cobrar a pessoa certa.

## Fase 4 — Adultos: funções, gestões, ATV e PPF

- Funções (escotista de seção com cargo; dirigente com cargo), com início e fim; várias ao mesmo tempo; bloqueio para jovens.
- Gestões (mandatos) da diretoria.
- ATV com os três tipos de validade; PPF com revisão periódica e marcação "a revisar" ao mudar a função.
- Lista de adultos por função (escotistas por seção, diretoria atual).

Histórias:
- Como **secretaria**, quero registrar que um adulto passou de assistente a chefe de seção, para que o PPF dele fique marcado para revisão.
- Como **diretoria de métodos educativos**, quero ver ATVs vencendo nos próximos 30 dias e adultos sem ATV válido.
- Como **secretaria**, quero abrir uma nova gestão e ver quais ATVs "até o fim da gestão" vencem com ela.

## Fase 5 — Controles por diretoria (substitui o Doc 22)

- Itens de controle configuráveis (diretoria dona, a quem se aplica, validade, remover no desligamento); situações por pessoa.
- Tela por diretoria: matriz pessoa × item, como a planilha, editável por quem é da diretoria; filtro "só pendências".
- Desligamento abre "a remover" nos itens marcados; a diretoria fecha como "removido".
- Etapas de entrada (integração, estágio, promessa de adulto, Vamos Falar de Escotismo) como itens com data.
- Carga de desenvolvimento do Doc 22 (situações da planilha → situações do modelo).

Histórias:
- Como **diretoria de comunicação**, quero ver quem ainda não está na lista de e-mails e no WhatsApp de avisos, para incluir.
- Como **diretoria administrativa**, quero ver fichas médicas pendentes ou antigas por seção, antes de um acampamento.
- Como **qualquer diretoria**, quero ver o que preciso remover de quem se desligou, para cumprir a LGPD.
- Como **secretaria**, quero desativar um canal que o grupo não usa mais (Twitter) sem perder o histórico.

## Fase 6 — Registro UEB e taxa de registro

- Configurações › Registro: rubrica de registro e rubrica de repasse (como Configurações › Mensalidades).
- Lista do ano-base calculada dos rateios por associado: pago, repassado, sem registro; total recebido × repassado.
- Validade: ao aparecer o pagamento, sugerida (12 meses) e marcada a verificar; confirmada ou corrigida à mão; lista de quem vence.
- Sem valor previsto, desconto nem isenção (contados no Paxtu).

Histórias:
- Como **diretoria administrativa**, quero ver quem tem registro vencendo ou vencido, para cobrar a renovação.
- Como **tesouraria**, quero lançar o pagamento da taxa com o associado e ver o registro dele como pago sem digitar duas vezes.
- Como **tesouraria**, quero ver quem já pagou e ainda não foi repassado à UEB.
- Como **diretoria administrativa**, quero confirmar ou corrigir a validade sugerida depois de conferir no Paxtu.

## Fase 7 — Integrações financeiras restantes

- Mensalidades: grade pelos períodos de atividade; responsável financeiro na linha; irmãos agrupados.
- Devedores: agrupar por responsável financeiro.
- Sugestão de rateio quando um lançamento cobre vários jovens da mesma família.
- Desligamento avisa de mensalidades em aberto, dívidas e registro pendente.

Histórias:
- Como **tesouraria**, quero lançar o pagamento de um responsável por dois filhos e ter o rateio sugerido por associado.
- Como **secretaria**, quero ser avisada de pendências financeiras ao desligar alguém.

## Depois (sem data)

- Importação do Paxtu, se a exportação for usável.
- Exportações: efetivo, aniversariantes, listas de contato por canal (para a comunicação).

## Divisão do trabalho

- **Banco** (migrations, funções auditadas, pgTAP em `supabase/tests/associates.test.sql`) e **telas** de cada fase podem ser feitos por pessoas diferentes depois que o modelo da fase estiver fechado.
- Fases 2, 3 e 4 dependem só da 1 e podem andar em paralelo; a 5 depende da 4 (ATV/PPF são itens de controle); a 6 e a 7 dependem da 1 e da 3.
- Arquivos compartilhados com outros módulos (migrations, `memberships`, `session.ts`, `/usuarios`, `AppBrand`, tema) ficam na Fase 0, num PR só, para reduzir conflitos com o Inventário e o Ações.
- Os dados reais das planilhas nunca entram no repositório: scripts de carga leem de uma pasta local e só rodam contra o Supabase local.
