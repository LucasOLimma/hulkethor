import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

// Cliente do Supabase para rodar NO SERVIDOR (paginas e acoes de formulario).
// Usa a mesma chave publica; quem esta logado e lido dos cookies da sessao.
// Um cliente novo por requisicao (nunca compartilhar entre usuarios).
export async function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Paginas (Server Components) nao podem gravar cookies.
          // Tudo bem: o proxy.ts renova a sessao a cada requisicao.
        }
      },
    },
  });
}
