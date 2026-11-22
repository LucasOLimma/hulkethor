# Banco de dados (Supabase)

`01_base_multi_motel.sql` **já foi executado** no banco do Supabase (os 18 testes passaram).

- Ele fica aqui **só como referência**, para consultar as tabelas e as regras de segurança.
- **Não rode de novo**: os comandos `create table` dariam erro de "já existe".
- O app nunca roda este arquivo nem altera a estrutura do banco.

## 02_reservas_sem_conflito.sql

Impede, no próprio banco, duas reservas ativas da mesma suíte em horários que se cruzam (mesmas regras do
site: 30 min de limpeza, pernoite até 12h). **Não altera nem apaga dados.** Rode um passo por vez; o
passo 3 precisa voltar vazio antes do passo 4. O fim do arquivo mostra como desfazer.
