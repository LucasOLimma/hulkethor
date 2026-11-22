# Banco de dados (Supabase)

`01_base_multi_motel.sql` **já foi executado** no banco do Supabase (os 18 testes passaram).

- Ele fica aqui **só como referência**, para consultar as tabelas e as regras de segurança.
- **Não rode de novo**: os comandos `create table` dariam erro de "já existe".
- O app nunca roda este arquivo nem altera a estrutura do banco.

## 02_reservas_sem_conflito.sql

Impede, no próprio banco, duas reservas ativas da mesma suíte em horários que se cruzam (mesmas regras do
site: 30 min de limpeza, pernoite até 12h). **Não altera nem apaga dados.** Rode um passo por vez; o
passo 3 precisa voltar vazio antes do passo 4. O fim do arquivo mostra como desfazer.

## 03_pagina_publica.sql (precisa do 02 antes)

Página pública do motel (`/m/[slug]`) e pedidos de reserva de clientes sem login:
- nova situação **"pendente"** (pedido do cliente; não bloqueia a suíte até a equipe confirmar);
- `public_motel_page(slug)`: dados do motel e suítes ativas (nada de hóspedes);
- `public_request_reservation(...)`: valida tudo no banco (suíte ativa do próprio motel, período oferecido,
  preço da tabela, horário livre, data entre hoje e 60 dias, maioridade, termos, limite de 30 pedidos/hora)
  e grava como "pendente" com o consentimento. Visitantes continuam sem acesso direto às tabelas.

## 04_estoque.sql (precisa do 01, 02 e 03 antes)

Módulo de **estoque** (Fase 1A). Só **acrescenta** tabelas e funções; não altera nem apaga dados existentes.
Rode o arquivo inteiro de uma vez. O fim do arquivo mostra como desfazer.
- Cadastros: `stock_categories` (cria Enxoval, Amenities, Frigobar e Limpeza em cada motel, sem produtos),
  `suppliers` e `products` (consumo ou enxoval, unidade, mínimo, validade, preço de venda).
- Saldo por local em `stock_levels`: estoque, nas suítes (`em_uso`) e lavanderia. Pode ficar **negativo**
  (a operação não trava) e gera alerta.
- `stock_movements`: histórico que **ninguém edita nem apaga**; erro se corrige com **estorno**. Cada lançamento
  tem uma chave anti-duplicidade (o mesmo pedido enviado 2 vezes lança 1 vez).
- Lotes e validade em `stock_lots` (sai primeiro o que vence antes).
- **Custos** (`product_costs`, `stock_movement_costs`): **só o dono** lê. Recepção e camareira não veem custos.
- Funções (cada uma numa transação única, conferindo o perfil): `stock_entry` (dono), `stock_exit`
  (consumo/uso interno: dono e recepção; perda/avaria/vencimento: dono), `stock_transfer` (enxoval: dono e
  recepção), `stock_reverse` (dono), `inventory_open` / `inventory_count` (dono e recepção),
  `inventory_close` / `inventory_cancel` (dono) e `stock_alerts` (toda a equipe).

## 05_operacao.sql (precisa do 01 ao 04 antes)

Fase 1B: **limpeza**, **kit padrão por categoria de suíte** e **conta da hospedagem**. Rode o arquivo inteiro de uma vez.
O fim do arquivo mostra como desfazer.
- **Migração (com justificativa):** cria `suite_categories` e a coluna **opcional** `suites.category_id`. Para cada
  tipo já usado nas suítes (ignorando maiúsculas e espaços) cria uma categoria e liga as suítes a ela. A coluna
  `type` **não é alterada nem apagada**. Motivo: o kit padrão é por categoria, e `type` é texto livre.
- `suite_category_kits`: o que a camareira repõe a cada limpeza. O enxoval é **trocado** (estoque → suíte →
  lavanderia) e os amenities saem do estoque.
- `housekeeping_tasks`: criada **sozinha** quando a reserva vai para "concluída" (saída), ou pedida pela recepção.
  Fica com a suíte e o horário, sem nenhum dado do hóspede (a camareira continua sem ver reservas).
  "Problema" segura a suíte até o dono ou a recepção resolver.
- `reservation_charges`: consumos lançados na reserva, com baixa no estoque. Nada é apagado: correção é estorno
  (só o dono), e o item volta ao estoque.
- Funções: `housekeeping_request` / `housekeeping_resolve` / `housekeeping_cancel` (dono e recepção),
  `housekeeping_start` / `housekeeping_finish` (toda a equipe), `reservation_charge_add` (dono e recepção) e
  `reservation_charge_reverse` (dono).

## 06_turnos_caixa.sql (precisa do 01 ao 05 antes)

Fase 1C: **Central de Turnos** e **caixa**. Só acrescenta; rode o arquivo inteiro de uma vez. O fim mostra como desfazer.
- `shift_checklist_items`: lista de conferência da abertura (cria os 8 itens padrão em cada motel; o dono edita).
- `shifts`: **um turno aberto por motel**. Abertura com a lista conferida e o fundo de caixa; fechamento com o
  dinheiro contado, o esperado, a diferença e a passagem de plantão. Recepção vê o turno aberto e os próprios;
  o histórico de todos (e as diferenças) é só do dono.
- `payments`: pagamentos das reservas (dinheiro, Pix, crédito, débito), sempre no turno aberto; pode dividir.
  Correção só por estorno (dono).
- `cash_movements`: sangria e suprimento, com motivo.
- **Regra no banco:** a reserva só vai para "concluída" (saída) com a conta paga. Consumo informado depois da saída
  vira saldo a receber.
- Funções: `shift_open`, `shift_close`, `shift_summary`, `shift_last_handover`, `cash_movement_add`,
  `reservation_checkout` (saída + pagamento numa transação), `payment_register` (receber saldo) e
  `payment_reverse` (dono).

## 07_portal_cliente.sql (precisa do 01 ao 06 antes)

Fase 2: **fotos das suítes**, **disponibilidade** e **Minha Reserva**. Rode o arquivo inteiro de uma vez.
O fim mostra como desfazer.
- **Duas colunas novas e opcionais** (justificativa no arquivo): `reservations.guest_phone` (celular, só números,
  para o cliente consultar/cancelar com o código, sem conta e sem senha) e `motel_settings.client_cancel_hours`
  (prazo de cancelamento pelo cliente; padrão 2 h). Nada existente é alterado.
- **Storage:** cria a pasta pública `suite-photos` (até 3 MB por arquivo, só imagens). Só o **dono** envia ou apaga,
  e só dentro da pasta do próprio motel (`<motel>/<suíte>/arquivo`). Tabela `suite_photos` guarda a ordem (até 8).
- `public_motel_page` passa a devolver as fotos e o prazo de cancelamento.
- `public_availability`: só os intervalos já ocupados da suíte no dia (com a limpeza), sem dados de hóspedes.
- `public_request_reservation_v2`: pedido com celular (usa as mesmas validações do 03).
- `public_my_reservation` / `public_cancel_reservation`: código + celular. Limite contra adivinhação: 5 erros no
  mesmo código, ou 200 no motel, em 15 minutos, bloqueiam por 15 minutos.

## 08_mapa_ao_vivo.sql (precisa do 01 ao 07 antes)

**Mapa das suítes ao vivo** e base da **previsão**. Não cria tabela nem altera dados; pode rodar de novo.
- `suite_board(motel)`: situação de cada suíte agora (ocupada + saída prevista, em limpeza + desde quando, com
  problema, livre + próxima reserva do dia, desativada) e o **tempo médio real de limpeza** (da saída até liberar,
  últimos 30 dias, por suíte e do motel). Para toda a equipe, **sem nenhum dado de hóspede**.
- Liga o **tempo real** do Supabase (Realtime) nas tabelas de limpeza e reservas. O Realtime respeita o RLS: cada
  pessoa só recebe o que já podia ver.
