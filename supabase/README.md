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
