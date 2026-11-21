"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/auth-actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <main className="page">
      <div className="card">
        <h1>Recuperar senha</h1>
        <p className="subtitle">Informe seu e-mail para receber um link de nova senha.</p>
        {state?.success ? (
          <p className="alert ok" role="status">
            {state.success}
          </p>
        ) : (
          <form action={action}>
            <label>
              E-mail
              <input name="email" type="email" autoComplete="email" required maxLength={200} />
            </label>
            <button type="submit" disabled={pending}>
              {pending ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        )}
        <p className="links">
          <Link href="/login">Voltar para o login</Link>
        </p>
      </div>
    </main>
  );
}
