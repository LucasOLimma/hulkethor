# hulkethor — SaaS multi-motel

Etapa 1: login da equipe (Supabase Auth), saída, recuperação de senha e um painel
que mostra o motel e o perfil (Dono, Recepção ou Camareira) de quem está logado.

O banco já foi criado com [`supabase/01_base_multi_motel.sql`](supabase/01_base_multi_motel.sql).
**Não rode esse arquivo de novo.**

## Como rodar no seu computador

1. Instale o [Node.js](https://nodejs.org) 22 ou mais novo.
2. Na pasta do projeto, instale as dependências:
   ```bash
   npm install
   ```
3. Copie `.env.example` para `.env.local` e preencha os valores. Eles estão no painel do Supabase, em
   **Project Settings → API Keys**:
   - `NEXT_PUBLIC_SUPABASE_URL`: a URL do projeto.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: a chave **publishable** (`sb_publishable_...`)
     ou a antiga **anon**. **Nunca** a `service_role`/secret. Se ela for colada por engano,
     o app se recusa a iniciar.
   - `NEXT_PUBLIC_SITE_URL`: `http://localhost:3000` enquanto testa no seu computador.

   O `.env.local` está no `.gitignore` e **não vai para o GitHub**.
4. No painel do Supabase, em **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (depois, o endereço real do site).
   - **Redirect URLs**: adicione `http://localhost:3000/auth/confirm`.
5. Inicie:
   ```bash
   npm run dev
   ```
   Depois abra http://localhost:3000.

## Telas

| Endereço | O que faz |
|---|---|
| `/login` | Entrar com e-mail e senha. Se errar, a mensagem é sempre "E-mail ou senha incorretos." |
| `/esqueci-senha` | Envia o link de nova senha. A resposta é sempre a mesma, exista o e-mail ou não. |
| `/auth/confirm` | Destino do link do e-mail de recuperação. Valida o link e leva para `/redefinir-senha`. |
| `/auth/convite` | Destino do link do e-mail de convite. Abre a sessão e leva para `/redefinir-senha`. |
| `/redefinir-senha` | Criar a nova senha (só com sessão aberta). |
| `/painel` | Página protegida: nome do motel e perfil, lidos de `motel_members` + `motels`. |
| `/painel/suites/[id do motel]` | Suítes do motel. Toda a equipe vê; **só o dono** cria, edita, ativa/desativa e exclui. |
| `/demo/suite-3d` | **Suíte demonstrativa em 3D** (pública, sem login): girar 360°, zoom, ângulos prontos, pontos de interesse, climas de luz. |
| `/painel/equipe/[id do motel]` | **Só para o dono:** convidar pessoas, trocar perfil, desativar/reativar. |

O botão **Sair** fica no painel.

## Visualizador 3D

- Feito com **Three.js** (WebGL), sem outras bibliotecas 3D. O código 3D só é baixado na página do visualizador.
- `src/components/suite3d/demo-suite.ts`: a suíte demonstrativa, construída em código (medidas em metros).
- `src/components/suite3d/engine.ts`: câmera, controles (mouse e toque), luzes, qualidade automática no celular.
- `src/components/suite3d/suite-viewer.tsx`: a interface (painel de informações, ângulos, climas, fotos).
- Próximas etapas: modelos `.glb` enviados por cada motel, fotos reais e página pública por motel.

## Suítes (etapa 3)

- Preços ficam em `suites.prices_cents` em **centavos**, um por período, com as mesmas chaves que
  `reservations.period` aceita: `{"3h": 9000, "6h": 12000, "12h": 16000, "pernoite": 19000}`.
  Período sem preço = a suíte não oferece aquele período.
- Itens ficam em `suites.items` (lista de textos).
- Tudo usa a chave pública; quem pode alterar é decidido pelo banco (regra `suites_write`: só dono).
- Suíte com reservas não pode ser excluída (o banco protege o histórico): desative-a.

## Equipe (etapa 2): configuração extra

1. Em `.env.local`, adicione a chave secreta **só para o servidor**:
   `SUPABASE_SECRET_KEY=sb_secret_...` (ou a antiga `service_role`). **Sem** `NEXT_PUBLIC_` na frente.
2. No Supabase, em **Authentication → URL Configuration → Redirect URLs**, adicione
   `http://localhost:3000/auth/convite` (destino do link do e-mail de convite).
   O modelo de e-mail padrão do Supabase funciona como está, sem editar nada.

A chave secreta é usada só em `src/lib/supabase/admin.ts` (marcado `server-only`) e só depois de o
banco confirmar que quem pediu é **dono ativo** do motel. Ela serve apenas para enviar o convite e para
mostrar o e-mail da equipe. O vínculo com o motel e o perfil são gravados com a sessão do dono e
conferidos pelas regras de RLS. Cada ação fica registrada em `audit_logs` via `log_audit`.

Limitação atual: não dá para convidar um e-mail que **já tem conta** (por exemplo, quem já trabalha em
outro motel).

## Como a segurança funciona

- **`src/proxy.ts`** roda antes de cada página. Ele renova a sessão e manda para o `/login` quem não está logado.
- Toda conversa com o Supabase acontece **no servidor** (Server Actions), com a chave pública. A única exceção é a tela da equipe, que usa a chave secreta (veja acima).
- Quem decide o que cada pessoa pode ver é o **banco** (RLS). A pessoa só lê a própria linha de
  `motel_members` e os motéis dos quais é membro **ativo**.
