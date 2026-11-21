"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/auth-actions";
import { AuthShell } from "@/components/auth-shell";
import { Alert, EmailField, SubmitButton } from "@/components/fields";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Informe seu e-mail e enviaremos um link para criar uma nova senha."
    >
      {state?.success ? (
        <Alert kind="ok">{state.success}</Alert>
      ) : (
        <form action={action} className="auth-form">
          <EmailField />
          <SubmitButton pending={pending} pendingText="Enviando...">
            Enviar link
          </SubmitButton>
        </form>
      )}
      <p className="auth-footer">
        <Link href="/login" className="small-link">
          ← Voltar para o login
        </Link>
      </p>
    </AuthShell>
  );
}
