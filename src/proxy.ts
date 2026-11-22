import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

// O "porteiro" do site: roda antes de cada pagina.
// 1) Renova a sessao de login (cookies) quando precisa.
// 2) Quem nao esta logado e tenta abrir uma pagina protegida vai para /login.
// 3) Quem ja esta logado e abre /login vai direto para /painel.

const PROTECTED = ["/painel", "/redefinir-senha"];
const GUEST_ONLY = ["/login", "/esqueci-senha"];

function matches(pathname: string, list: string[]) {
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Impede que uma resposta com cookie de sessao fique em cache.
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getClaims() confere a assinatura do token: nao confia so no cookie.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    const redirect = NextResponse.redirect(target);
    // leva junto os cookies renovados
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!loggedIn && (pathname === "/" || matches(pathname, PROTECTED))) {
    return redirectTo("/login");
  }
  if (loggedIn && (pathname === "/" || matches(pathname, GUEST_ONLY))) {
    return redirectTo("/painel");
  }
  return response;
}

export const config = {
  // Roda em todas as paginas, menos arquivos estaticos e imagens.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|suite3d/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
