"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/auth-actions";

// So chega aqui quem esta logado (o proxy.ts garante) — normalmente
// pelo link de recuperacao do e-mail, que abre uma sessao temporaria.
export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <main className="page">
      <div className="card">
        <h1>Criar nova senha</h1>
        <p className="subtitle">Use pelo menos 8 caracteres.</p>
        <form action={action}>
          {state?.error && (
            <p className="alert error" role="alert">
              {state.error}
            </p>
          )}
          <label>
            Nova senha
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={200}
            />
          </label>
          <label>
            Repita a nova senha
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={200}
            />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </main>
  );
}
