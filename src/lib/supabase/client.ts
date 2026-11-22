import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

// Cliente do Supabase para o NAVEGADOR. Usa so a chave publica.
// Hoje e usado apenas na tela /auth/convite, para receber o link do convite.
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
