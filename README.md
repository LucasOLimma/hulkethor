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

## Publicar na internet (Vercel)

1. Em https://vercel.com, entre com a conta do GitHub e clique em **Add New → Project**.
2. Importe o repositório `hulkethor` (Framework: Next.js — detectado sozinho).
3. Em **Environment Variables**, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL` — URL do projeto Supabase
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — chave **publishable/anon**
   - `SUPABASE_SECRET_KEY` — chave secreta (**só servidor**; sem `NEXT_PUBLIC_`)
   - `NEXT_PUBLIC_SITE_URL` — o endereço final (ex.: `https://hulkethor.vercel.app`)
4. **Deploy**. A Vercel publica a branch de produção (por padrão, `main`).
5. No Supabase, **Authentication → URL Configuration**: troque o **Site URL** pelo endereço final e
   adicione em **Redirect URLs** `https://SEU-ENDERECO/auth/confirm` e `https://SEU-ENDERECO/auth/convite`
   (pode manter os de `localhost` para continuar testando no computador).

## Foto do login

A tela de login usa uma **fotografia real** em `public/login/suite.jpg` (horizontal, ~2400 px de
largura, JPG). Para trocar, substitua o arquivo. Use uma foto do próprio motel ou com licença de uso
comercial. Sem o arquivo, a tela mostra um fundo escuro neutro.

## Página pública do motel (clientes)

- `/m/[slug]` (sem login): nome, endereço e suítes ativas com preços; o cliente pede a reserva (data,
  horário, período, nome opcional, maioridade e consentimento) e recebe um código.
- O pedido entra como **"pendente"** (não bloqueia a suíte). A equipe vê em **Reservas → Pedidos** e
  confirma (com nova checagem de conflito) ou recusa.
- Requer `supabase/02_reservas_sem_conflito.sql` e `supabase/03_pagina_publica.sql` rodados no Supabase.
- Link "Ver página pública" em **Meu Motel**.

## Reservas (equipe)

- `/painel/[id]/reservas`: dono e recepção criam, editam (enquanto confirmada) e mudam a situação das
  reservas; camareira não tem acesso (mesma regra do banco). Não há exclusão (o banco não permite).
- Situações: confirmada → em andamento (chegada) / cancelada / não compareceu; em andamento → concluída (saída).
- Conflito de horário: recusa reserva que se sobreponha a outra confirmada ou em andamento na mesma suíte,
  com **30 min de limpeza** entre elas; pernoite vai até **12h do dia seguinte**
  (`src/lib/reservations.ts`: `CLEANING_MINUTES`, `OVERNIGHT_CHECKOUT`).
- Código único de 6 caracteres por reserva; valor sugerido pela tabela de preços da suíte; confirmação de
  maioridade obrigatória; cada ação vai para `audit_logs` (`log_audit`).
- Conflito também barrado **no banco** por `supabase/02_reservas_sem_conflito.sql` (regra de exclusão com
  as mesmas regras de horário), inclusive para duas pessoas salvando no mesmo instante. Se o banco recusar,
  o site mostra uma mensagem clara.

## Área do proprietário (multi-motel)

Fluxo: **login → Meus estabelecimentos (`/painel`) → painel do motel (`/painel/[id]`)**.

- `/painel`: cards com os estabelecimentos em que a pessoa é membro ativo (nome, suítes, situação,
  perfil). Sem números financeiros. Com um único estabelecimento vai direto ao painel;
  `/painel?lista=1` sempre mostra a lista. Sem nenhum, mostra como solicitar acesso.
- `/painel/[id]`: dashboard do motel (faturamento, reservas, clientes atendidos, suítes, ocupação,
  gráficos, suítes em destaque, reservas recentes, situação das suítes) e as páginas do menu:
  `suites`, `reservas`, `clientes`, `equipe`, `promocoes`, `relatorios`, `configuracoes`, `meu-motel`.
- **Segurança:** o ID no endereço nunca é confiado sozinho. `src/lib/motel-access.ts` (`requireMotel`)
  confere no banco, a cada requisição, se a pessoa é membro **ativo** daquele motel e com qual perfil;
  todas as consultas filtram pelo motel conferido e o banco ainda aplica o RLS. Sem acesso → 404.
- Perfis: recepção não vê Equipe/Promoções/Relatórios; camareira não vê reservas, faturamento e clientes
  (mesma regra do banco).
- Indicadores (nada inventado): faturamento = soma das reservas confirmadas, em andamento ou concluídas
  do período; clientes atendidos = reservas com chegada registrada ou concluídas; ocupação = suítes
  ocupadas agora ÷ suítes ativas. Clientes, Promoções e Relatórios aparecem como "Em desenvolvimento"
  porque o banco ainda não tem esses dados.

## Telas

| Endereço | O que faz |
|---|---|
| `/login` | Entrar com e-mail e senha. Se errar, a mensagem é sempre "E-mail ou senha incorretos." |
| `/esqueci-senha` | Envia o link de nova senha. A resposta é sempre a mesma, exista o e-mail ou não. |
| `/auth/confirm` | Destino do link do e-mail de recuperação. Valida o link e leva para `/redefinir-senha`. |
| `/auth/convite` | Destino do link do e-mail de convite. Abre a sessão e leva para `/redefinir-senha`. |
| `/redefinir-senha` | Criar a nova senha (só com sessão aberta). |
| `/painel` | Meus estabelecimentos (seleção do motel). |
| `/painel/suites/[id do motel]` | Suítes do motel. Toda a equipe vê; **só o dono** cria, edita, ativa/desativa e exclui. |
| `/demo/suite-3d` | **Suíte demonstrativa em 3D** (pública, sem login): girar 360°, zoom, ângulos prontos, pontos de interesse, climas de luz. |
| `/painel/equipe/[id do motel]` | **Só para o dono:** convidar pessoas, trocar perfil, desativar/reativar. |

O botão **Sair** fica no painel.

## Visualizador 3D (suíte demonstrativa realista)

- **Página:** `/demo/suite-3d` (pública). `?qualidade=rapida` força o modo leve.
- **Tecnologia:** Three.js (WebGL 2) + `three-gpu-pathtracer` (path tracing) + `three-mesh-bvh`.
  - Renderização rápida enquanto a câmera se move; **modo fotográfico** (path tracing com iluminação
    global, sombras suaves, reflexos reais e redução de ruído) quando a câmera para **dentro** da suíte.
  - Computador: modo fotográfico ligado por padrão. Celular: desligado por padrão (pode ser ligado).
- **Conteúdo:** modelos, texturas PBR e HDRI da Poly Haven (CC0, domínio público) em `public/suite3d`
  (ver `public/suite3d/CREDITOS.txt`), convertidos para WebP (~11 MB no total, carregados só nesta página).
  Cama, roupa de cama, cabeceira capitonê, cortinas e banheira são geometrias orgânicas feitas em código
  (`src/components/suite3d/realistic/geometry.ts`) em medidas reais.
- **Navegação:** órbita 360°, zoom, ângulos prontos (inclui **vista de cima**), pontos de interesse,
  climas de luz e **exploração em 1ª pessoa** (arrastar para olhar, tocar no chão para andar, W A S D).
- **Para chegar ao realismo de fotografia de um motel real:** substituir esta suíte por modelos `.glb`
  produzidos no Blender a partir do projeto/fotos do motel (o motor já carrega GLTF), ou usar o tour 360°
  com fotos reais (`src/components/suite3d/tour-engine.ts`).

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
