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
