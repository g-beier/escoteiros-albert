# Gestão do Grupo Escoteiro Albert Schweitzer: hospedagem, uso e custo previsto

Estimativa de 22/11/2026, **versão 3**, para os voluntários do grupo.

> **O que mudou na versão 3:** o sistema ficou mais leve (cerca de 99% menos requisições e 85% menos tráfego) e o documento passou a mostrar quanto custa se o banco pequeno não estiver disponível em São Paulo. O custo previsto continua o mesmo.

## Em resumo

- **O que é:** o Gestão é o sistema interno do grupo, com Financeiro, Inventário e Associados. Hoje ele está em desenvolvimento e **ainda não está no ar**.
- **Onde ficaria:** na nuvem da Microsoft (Azure), com os dados em São Paulo.
- **Quando começa:** todos os dados começam em **2027**. Não serão importados anos anteriores.
- **Quanto custa:** cerca de **US$ 64 por mês**, ou **US$ 765 por ano**.
- **Quem paga:** a Microsoft oferece **US$ 2.000 por ano** em crédito a organizações sem fins lucrativos aprovadas. O sistema usaria cerca de **38%** desse crédito. Se o grupo não tiver o crédito ativo, o valor sai do caixa.
- **O que falta:** nada foi contratado nem criado. Ainda é preciso confirmar o crédito e se o banco de dados escolhido está disponível em São Paulo para a nossa conta.

## O que o sistema faz

| Módulo | Para quê |
|---|---|
| Financeiro | Lançamentos, extrato bancário, mensalidades, prestação de contas |
| Inventário | Materiais do grupo, onde estão, em que estado e o que entrou ou saiu |
| Associados | Jovens, adultos e responsáveis, controle de pendências e relatórios |

Contatos, documentos e fichas de saúde **continuam no Paxtu**. O Gestão guarda nomes, datas, vínculos, situação de cada pendência e os dados financeiros do grupo.

O site público do grupo não muda e não entra nesta conta.

## Serviços e preços

Valores em dólar, por mês.

| Serviço | Para que serve | Configuração | Preço |
|---|---|---|--:|
| Azure Database for PostgreSQL | Banco de dados | 1 processador, 2 GB de memória (B1ms) | 25,55 |
| Disco do banco | Espaço para os dados | 32 GB, o menor disponível | 6,99 |
| Balanceador de carga | Entrada do sistema, exigida pela rede privada | 1 | 18,25 |
| Endereços de internet | Entrada e saída do sistema | 2 | 7,30 |
| DNS privado | Permite ao sistema achar o banco na rede privada | 1 | 0,50 |
| Container Registry | Guarda as versões do sistema | Básico | 5,07 |
| **Total fixo** | | | **63,66** |
| Container Apps | Executa o sistema e desliga quando ninguém usa | 0,5 processador, 1 GB | 0 dentro da franquia |
| Log Analytics | Registro de erros e funcionamento | Teto de 0,15 GB por dia, dentro da franquia de 5 GB | 0 dentro da franquia |
| Key Vault | Cofre das senhas do sistema | Padrão | centavos |
| Blob Storage | Comprovantes, recurso hoje desligado | Cerca de 1 GB por ano, se ligado | centavos |
| **Total previsto** | | | **cerca de 63,76** |

O login usa a conta Google de cada pessoa, sem custo. Só entra quem o administrador do grupo cadastrar.

## O que pode mudar a conta

O valor previsto depende de a Microsoft liberar o banco pequeno (B1ms) em São Paulo para a nossa conta. Só dá para confirmar com acesso ao Azure.

| Situação | Por mês | Por ano | Parte do crédito |
|---|--:|--:|--:|
| Previsto: banco pequeno em São Paulo | 63,76 | 765 | 38% |
| Banco maior em São Paulo (D2s v3) | 206,84 | 2.482 | **124%, passa do crédito em US$ 482** |
| Banco pequeno nos Estados Unidos (East US 2, também a confirmar) | 47,31 | 568 | 28%, com dados de menores fora do Brasil |

Se o banco pequeno não estiver disponível, a decisão volta à diretoria antes de qualquer contratação.

## Quanto vamos usar

### Números do grupo

| Dado | Quantidade |
|---|--:|
| Lançamentos financeiros por ano | cerca de 1.000 |
| Associados | cerca de 80 |
| Pessoas, contando responsáveis | cerca de 150 |
| Linhas de inventário, hoje em planilha | cerca de 1.300 |
| Usuários do sistema | no máximo 20 |

### O que ainda é suposição

- Cada um dos 20 usuários entra 2 vezes por semana.
- 800 linhas de extrato e 800 registros de mensalidade por ano.
- 1.000 movimentações de material por ano, já com os acertos da conferência anual.
- 240 alterações de associados por ano.
- A lista de Movimentações do Financeiro é rolada até o fim 800 vezes por ano.

### Requisições por mês

Uma requisição é cada pedido que o navegador faz ao sistema. Cada tela gera cerca de 1,25, e rolar um ano de lançamentos, mais 10.

| Origem | Telas por mês | Requisições por mês |
|---|--:|--:|
| Financeiro | 567 | 1.375 |
| Inventário | 417 | 521 |
| Associados | 152 | 190 |
| Início e login | 347 | 434 |
| Arquivos do sistema (cada pessoa baixa uma vez por mês) | | 700 |
| **Total** | **cerca de 1.482** | **3.220** |

O tráfego de internet de todos os usuários caiu de cerca de 390 MB para cerca de 60 MB por mês.

### Uso da franquia gratuita mensal

| Item | Uso previsto | Grátis por mês | Quanto usamos |
|---|--:|--:|--:|
| Requisições | 3.220 | 2.000.000 | 0,2% |
| Tempo com o sistema ligado | 58 horas | 100 horas | 58% |

O primeiro limite a ser atingido é o de **tempo ligado**. Cada acesso foi contado como 15 minutos de uso mais 5 até o sistema desligar, sem descontar pessoas usando ao mesmo tempo.

## Como será 2027

| Período | O que muda | Horas ligado no mês | Custo no mês |
|---|---|--:|--:|
| Janeiro | Saldos iniciais e digitação de todos os cadastros | cerca de 106 | 64,09 |
| Fevereiro a dezembro | Uso normal (mensalidades de março a dezembro) | cerca de 58 | 63,76 |
| **Ano de 2027** | | | **cerca de 765** |

**Atenção ao inventário:** o sistema ainda não importa a planilha em produção (o importador atual só funciona em desenvolvimento). Digitar as 1.300 linhas, a 2 minutos cada, são cerca de **43 horas de trabalho voluntário**.

Cada mês em que os serviços ficarem criados antes de janeiro de 2027 acrescenta cerca de US$ 64.

Para começar em 2027, o grupo precisa reunir:

1. O saldo de cada conta em 01/01/2027.
2. A relação de associados ativos, seções e responsáveis.
3. A contagem dos materiais existentes.
4. O valor da mensalidade de 2027 e as isenções.
5. As dívidas ainda em aberto, se o grupo quiser acompanhá-las no sistema.

### Espaço ocupado no banco

| Fim de | 2027 | 2028 | 2029 | 2030 | 2031 |
|---|--:|--:|--:|--:|--:|
| Tamanho aproximado | 19 MB | 24 MB | 28 MB | 32 MB | 36 MB |

O disco de 32 GB sobra por muitos anos.

## E se usarmos mais?

| Cenário | Horas ligado por mês | Por mês | Por ano | Parte do crédito |
|---|--:|--:|--:|--:|
| 20 pessoas, 2 vezes por semana (previsto) | 58 | 63,76 | 765 | 38% |
| 20 pessoas, 3 vezes por semana | 87 | 63,76 | 765 | 38% |
| 20 pessoas, 5 vezes por semana | 144 | 66,16 | 794 | 40% |
| 20 pessoas, todos os dias | 200 | 69,16 | 830 | 42% |
| Sistema ligado o tempo todo (por exemplo, robôs da internet acessando) | 730 | 98,18 | 1.178 | 59% |

Com o banco pequeno, mesmo o último cenário cabe no crédito anual.

## Escolhas feitas

| Escolha | Motivo | Contrapartida |
|---|---|---|
| Dados em São Paulo | Há dados de menores: ficam no Brasil e o acesso é mais rápido | O banco custa cerca do dobro do preço nos Estados Unidos |
| Banco em rede privada | O banco não fica acessível pela internet | Cerca de US$ 26 por mês a mais. O relatório de transparência do site passa a ser exportado manualmente |
| Desligar sem uso | Mantém a execução dentro da franquia | O primeiro acesso depois de uma pausa demora alguns segundos |
| Um único servidor de banco | Menor custo | Se houver falha, o sistema fica fora do ar até voltar |
| Cópia de segurança de 7 dias | Incluída no serviço | Não dá para restaurar um ponto com mais de 7 dias |

## Cuidados com o crédito

- O grupo precisa ser aprovado no [programa da Microsoft para organizações sem fins lucrativos](https://nonprofit.microsoft.com).
- Depois de oferecido, o crédito tem **90 dias para ser ativado**, e só o contato principal pode ativar.
- Ele vale por 12 meses e a **renovação é manual**. Se vencer, **a cobrança vai para o cartão cadastrado**.
- O saldo não passa de um ano para o outro e não paga planos de suporte.
- Será preciso criar um alerta de orçamento (sugestão: US$ 90 por mês) e um lembrete 30 dias antes do vencimento. O alerta avisa, mas não interrompe a cobrança.

## O que precisamos dos voluntários

| Quem | O que confirmar |
|---|---|
| Tesouraria | Contas, saldos de abertura, linhas de extrato por ano, mensalidade e isenções |
| Responsável pelo material | Movimentações por ano e se a planilha será digitada ou se precisamos de um importador |
| Secretaria | Lista de ativos, seções e responsáveis |
| Diretoria | Quem serão os até 20 usuários, o contato do crédito e o cartão a cadastrar |
| Responsável pelo site | Quem administra o endereço `escoteirosalbert.com.br` |

## Como calculamos

- **Preços:** tabela pública do Azure para a região Brazil South, consultada em 21/11/2026, com mês de 730 horas. Não incluem impostos, IOF, câmbio nem reajustes. Para converter em reais, multiplique pela cotação do dia.
- **Medição:** o sistema foi executado num computador de desenvolvimento, com cinco anos de dados fictícios. Foram medidas 13 telas, as listas roladas até o fim, 20 acessos simultâneos (sem falhas) e 3 relatórios (requisições, memória e crescimento do banco).
- **Contas:** Financeiro = 4 telas por lançamento, 1,5 por linha de extrato, 1 por mensalidade e 800 consultas. Inventário = 4 por movimentação e 1.000 consultas. Associados = 3 por alteração e 1.100 consultas. Início = 2 por acesso. Janeiro soma 2 minutos para cada uma das 1.300 linhas de inventário e 150 pessoas.
- **Limites:** gravações foram estimadas, não medidas. A velocidade no Azure não foi medida. Volume mensal de tráfego e registros de erro foram estimados dentro das franquias.
- **Referências da Microsoft:** [cobrança do Container Apps](https://learn.microsoft.com/azure/container-apps/billing), [custos da rede privada](https://learn.microsoft.com/azure/container-apps/custom-virtual-networks#managed-resources), [banco por região](https://learn.microsoft.com/azure/postgresql/overview#azure-regions), [renovação do crédito](https://learn.microsoft.com/industry/nonprofit/microsoft-for-nonprofits/renew-azure-grant) e [calculadora de preços](https://azure.microsoft.com/pricing/calculator/).
