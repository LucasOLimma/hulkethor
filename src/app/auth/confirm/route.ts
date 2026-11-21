import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino do link do e-mail de recuperacao de senha.
// Aceita os dois formatos que o Supabase pode mandar:
//  - ?code=...                      (padrao, sem mexer no modelo de e-mail)
//  - ?token_hash=...&type=recovery  (se o modelo de e-mail for personalizado)
// Depois de validar, abre uma sessao e manda para /redefinir-senha.
// O destino e FIXO, para ninguem usar este link para redirecionar a outro site.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  return NextResponse.redirect(new URL(ok ? "/redefinir-senha" : "/login?erro=link", origin));
}
