"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/fields";

// Destino do link do E-MAIL DE CONVITE (modelo padrao do Supabase).
// O Supabase confere o convite e manda a pessoa para ca com a sessao no
// final do endereco (depois do "#"), parte que so o navegador enxerga.
// Esta tela grava a sessao em cookies e leva para /redefinir-senha,
// onde a pessoa cria a propria senha.
export default function AcceptInvitePage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Apaga os dados do endereco para nao ficarem no historico
    // (logo depois de o Next terminar de montar a pagina).
    const cleanUrl = window.setTimeout(
      () => window.history.replaceState(window.history.state, "", window.location.pathname),
      0,
    );

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    // setSession confere o token com o Supabase antes de aceitar.
    const result =
      accessToken && refreshToken
        ? createClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        : Promise.resolve({ error: new Error("link sem dados") });

    result.then(({ error }) => {
      if (error) setFailed(true);
      else window.location.replace("/redefinir-senha");
    });
    return () => window.clearTimeout(cleanUrl);
  }, []);

  return (
    <AuthShell title={failed ? "Convite inválido" : "Abrindo seu convite..."}>
      {failed ? (
        <>
          <Alert kind="error">
            O link é inválido ou expirou. Peça ao dono do motel um novo convite.
          </Alert>
          <p className="auth-footer">
            <Link href="/login" className="small-link">
              ← Ir para o login
            </Link>
          </p>
        </>
      ) : (
        <p className="subtitle">Só um instante.</p>
      )}
    </AuthShell>
  );
}
