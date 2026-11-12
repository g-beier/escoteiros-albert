# Modelo e vocabulário

Termos usados na interface, no código e na documentação. Quando um termo aparecer em outro lugar com outro sentido, corrija lá.

| Termo | O que é | No banco |
|---|---|---|
| **Conta** | Onde o dinheiro está: conta corrente, poupança, caixa. Cada lançamento pertence a uma conta. | `accounts` |
| **Conta contábil** | Código do plano de contas do sistema contábil de destino (`0.0.0.0.0000`). Sempre escrito por extenso: nunca chame de "conta" só. A rubrica tem uma (várias rubricas podem usar a mesma); a conta pode ter uma, usada como contrapartida. | `categories.ledger_code`, `accounts.ledger_code` (domínio `ledger_code`) |
| **Extrato / linha do extrato** | O que veio do banco num arquivo OFX. É o "fato" do banco e não é editado. | `statement_imports`, `statement_lines` |
| **ID OFX** | O `FITID` da linha do extrato. Não é único (nem combinado com a conta), mas junta a movimentação do banco ao lançamento e aos seus rateios. | `statement_lines.external_id`; nas visões, `external_ids` |
| **Lançamento** | Movimentação registrada no app: data, **histórico** (quem pagou/recebeu, emitente), conta, forma de pagamento, documento e total. | `ledger_entries` (`name` = histórico) |
| **Rateio** | Parte do lançamento numa rubrica, com descrição e associado opcional. O sinal vem da rubrica. | `entry_splits` |
| **Rubrica** | Classificação gerencial do grupo, em árvore pelo código (`1.x` receita, `2.x` despesa). Traduzida para a contabilidade pela conta contábil. | `categories.code` |
| **Conciliação** | Vínculo entre linhas do extrato e lançamentos da mesma conta cujas somas batem (1:1, 1:N, N:1). | `reconciliation_links` |
| **Mensalidade** | Caixinha associado × mês (março a dezembro): pago ou atenção (registrados), atrasado (calculado pelo vencimento). Ligada aos rateios da rubrica de mensalidade. | `fee_records`, `fee_record_splits` |
| **Isenção** | Associado que não paga mensalidade naquele ano (voluntário, bolsa…), com motivo. | `fee_exemptions` |
| **Vencimento** | Regra do grupo: dia N, N-ésimo dia útil ou fim do mês. | `fee_settings` |
| **Documentos** | Situação do comprovante: Pendente ou Arquivado (parâmetro de URL `pasta`, por compatibilidade). | `ledger_entries.document_filed` |
| **Comprovante (anexo)** | Cópia digital (PDF, JPG, PNG ou HEIC, até 10 MB) anexada ao lançamento. Não muda **Documentos**, que continua sendo a pasta física. | `entry_attachments`; arquivo no bucket privado `comprovantes` |

## Visões de `/lancamentos`

- **Por lançamento** (`visao` ausente; `visao=extrato` ainda é aceito): um lançamento por linha.
- **Por rubrica** (`visao=rubricas`): um rateio por linha.
- `ofx=<FITID>` filtra pelo ID OFX: o lançamento, seus rateios e os demais lançamentos pagos pela mesma movimentação.
- Tesouraria e administração podem marcar lançamentos na visão Por lançamento e movê-los em lote para outra conta (ex.: tirar de "A definir"); conciliados que mudam de conta perdem o vínculo, como em Trocar conta.
- `conciliado=sim` / `conciliado=nao` filtra pelo vínculo com o extrato (coluna `reconciled` das duas visões); sem o parâmetro, ou com as duas opções, mostra todos. O ✓ ao lado do valor marca o lançamento conciliado nas duas visões.

## Comprovantes anexados

- Arquivo no bucket privado `comprovantes` (migration 027), caminho `<group_id>/<entry_id>/<uuid>.<ext>`. As políticas de `storage.objects` leem o grupo e o lançamento do caminho: membros do grupo leem; tesouraria/administração enviam (só para um lançamento do próprio grupo) e apagam; não há sobrescrita.
- Envio em dois passos (`app/lancamentos/actions.ts`): `prepareAttachmentUpload` valida tipo/tamanho e cria uma URL de envio assinada; o navegador manda o arquivo direto ao Storage (não passa pelo servidor do app); `registerAttachment` chama `add_entry_attachment`, que confere o objeto em `storage.objects` (tipo e tamanho vêm do Storage) e audita. Se o registro falhar, o arquivo é apagado.
- Abrir/baixar: `GET /lancamentos/<id>/anexos/<anexoId>[?baixar=1]` redireciona para uma URL assinada de 60 s. Consulta pode abrir e baixar.
- Excluir: `delete_entry_attachment` remove o registro, audita e devolve o caminho; o app apaga o arquivo pela API do Storage (o banco não apaga `storage.objects`). Excluir o lançamento apaga os registros em cascata e o app apaga os arquivos em seguida.
- Na lista `/lancamentos`, um clipe ao lado de Documentos mostra quantos comprovantes o lançamento tem (uma consulta por página em `entry_attachments`, fora das visões).
- Regras compartilhadas (tipos, limite, caminho): `lib/attachments.ts`, iguais às da migration.

## Fluxo

OFX → linhas do extrato (abertas) → conciliação (vincular a lançamentos existentes ou criar a partir da linha) → lançamento com rateios por rubrica → conta contábil → CSV para a contabilidade.

## Regras de escrita

Toda escrita passa por funções SQL `security definer` que validam o papel (`can_edit_group`) e gravam `audit_events`. Não há políticas de escrita direta em `categories`, `payment_methods`, `accounts` nem nas tabelas de extrato e conciliação. No app, a sessão e o grupo vêm de `lib/session.ts` (`pageSession`, `pageMember`, `memberOrError`, `editorOrError`, `requireEditor`, `requireAdmin`).

## Histórico de alterações

`audit_events` só é lido diretamente por administradores. A página de detalhes do lançamento mostra a qualquer membro do grupo o histórico daquele lançamento pela função `ledger_entry_history` (`023`): criação, edições (antes → depois, inclusive rateios incluídos e removidos), documentos, comprovantes anexados ou removidos, conta, fora do extrato e vínculos de conciliação que o incluem, com data, hora e e-mail de quem fez.
