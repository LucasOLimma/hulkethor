// Le as variaveis do .env.local e confere se estao certas.
// So existem DUAS chaves aqui, e as duas sao publicas: a URL do projeto e a
// chave publishable/anon. A seguranca dos dados fica no banco (RLS).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Trava de seguranca: se alguem colar por engano a chave secreta
// (service_role / sb_secret_...), o app se recusa a funcionar.
function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json)?.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}

export function getSupabaseEnv(): { url: string; publishableKey: string } {
  if (!url || !publishableKey) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local (veja .env.example).",
    );
  }
  if (isSecretKey(publishableKey)) {
    throw new Error(
      "A chave em NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e uma chave SECRETA (service_role). Use a chave publica (publishable/anon).",
    );
  }
  return { url, publishableKey };
}

// Endereco do site, usado no link do e-mail de recuperacao de senha.
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}
