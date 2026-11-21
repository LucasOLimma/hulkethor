import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

// Cliente ADMINISTRADOR do Supabase (chave secreta).
//
// REGRAS DESTE ARQUIVO:
// - "server-only" acima faz o projeto NEM COMPILAR se alguma tela do
//   navegador tentar importar este arquivo.
// - A variavel SUPABASE_SECRET_KEY NAO tem o prefixo NEXT_PUBLIC_, entao o
//   Next.js nunca a envia para o navegador.
// - Use SOMENTE depois de conferir que quem pediu e dono do motel.
// - Use SOMENTE para o que a chave publica nao consegue: enviar convite e
//   ler o e-mail das pessoas da equipe.

function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json)?.role === "service_role";
  } catch {
    return false;
  }
}

export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Falta SUPABASE_SECRET_KEY no .env.local (veja .env.example).");
  }
  if (!looksLikeSecretKey(secretKey)) {
    throw new Error("SUPABASE_SECRET_KEY nao parece uma chave secreta (sb_secret_... ou service_role).");
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
